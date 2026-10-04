import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import SCHEMA, connect
from rules import judge

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# writer：可提交开放申请、可报送偏航；supervisor：值班长，可放行。
# 报送与放行是两本权限：兼值班长的观察员有 supervisor 但没有 writer，
# 能放行别人场站，自己仍不能报送。
USERS = {
    "technician": {
        "perms": ["writer"],
        "password_hash": pwd.hash("tech123456"),
    },
    "observer": {
        "perms": [],
        "password_hash": pwd.hash("obs123456"),
    },
    "foreman": {
        "perms": ["supervisor"],
        "password_hash": pwd.hash("boss123456"),
    },
    "obsboss": {
        "perms": ["supervisor"],
        "password_hash": pwd.hash("obsboss123456"),
    },
}

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格"),
        ("W07", 3.2, "偏航超差"),
    ]
    for code, err, expected_verdict in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s)""",
            (code, err, verdict, reason, "technician", now, now),
        )


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            seed_if_empty(conn)
            conn.commit()

    await run_db(init)


def parse_bearer():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def current_user():
    token = parse_bearer()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub not in USERS:
        return None
    return {"username": sub, "perms": payload.get("perms", [])}


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def require_perm(perm, detail):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(*args, **kwargs):
            user = await current_user()
            if user is None:
                return jsonify({"detail": "未登录"}), 401
            if perm not in user["perms"]:
                return jsonify({"detail": detail}), 403
            return await handler(user, *args, **kwargs)

        return wrapper

    return decorator


def require_writer(handler):
    return require_perm("writer", "仅现场技师可提交偏航记录")(handler)


def require_supervisor(handler):
    return require_perm("supervisor", "仅值班长可放行场站")(handler)


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.post("/api/auth/login")
async def login():
    body = await request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = USERS.get(username)
    if not user or not pwd.verify(password, user["password_hash"]):
        return jsonify({"detail": "用户名或密码错误"}), 401
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": username, "perms": user["perms"], "exp": exp},
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "perms": user["perms"],
        }
    )


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, station_code, yaw_err_deg, status,
                          verdict, reason, created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    station_code = (body.get("station_code") or "").strip()
    turbine_code = (body.get("turbine_code") or "").strip()
    if not station_code:
        return jsonify({"detail": "场站不能为空"}), 400
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        yaw_err_deg = float(body.get("yaw_err_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            with conn.transaction():
                station = conn.execute(
                    "SELECT code, name FROM stations WHERE code = %s FOR SHARE",
                    (station_code,),
                ).fetchone()
                if station is None:
                    return "bad_station", None
                # 写口硬拦截：与放行状态同一事务内核对，未放行一律退回。
                req = conn.execute(
                    """SELECT status FROM release_requests
                       WHERE station_code = %s FOR SHARE""",
                    (station_code,),
                ).fetchone()
                if req is None or req["status"] != "released":
                    return "not_released", station["name"]
                row = conn.execute(
                    """INSERT INTO yaw_logs
                       (station_code, turbine_code, yaw_err_deg, status,
                        verdict, reason, created_by, created_at)
                       VALUES (%s, %s, %s, 'pending', NULL, NULL, %s, %s)
                       RETURNING id, turbine_code, station_code, yaw_err_deg,
                                 status, verdict, reason, created_by,
                                 created_at, processed_at""",
                    (station_code, turbine_code, yaw_err_deg,
                     user["username"], now),
                ).fetchone()
            conn.commit()
            return "ok", row

    result, payload = await run_db(insert)
    if result == "bad_station":
        return jsonify({"detail": "场站不存在"}), 400
    if result == "not_released":
        return jsonify(
            {"detail": f"场站「{payload}」未经值班长放行，报送退回"}
        ), 403
    return jsonify(payload), 201


@app.get("/api/stations")
@require_login
async def list_stations(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT s.code, s.name,
                          r.status AS request_status,
                          r.requested_by, r.requested_at,
                          r.released_by, r.released_at
                   FROM stations s
                   LEFT JOIN release_requests r ON r.station_code = s.code
                   ORDER BY s.code"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/stations/<station_code>/request")
@require_writer
async def request_release(user, station_code):
    now = datetime.now(timezone.utc)

    def apply():
        with connect() as conn:
            with conn.transaction():
                station = conn.execute(
                    "SELECT code, name FROM stations WHERE code = %s FOR SHARE",
                    (station_code,),
                ).fetchone()
                if station is None:
                    return "bad_station", None
                created = conn.execute(
                    """INSERT INTO release_requests
                       (station_code, requested_by, requested_at, status)
                       VALUES (%s, %s, %s, 'pending')
                       ON CONFLICT (station_code) DO NOTHING
                       RETURNING id""",
                    (station_code, user["username"], now),
                ).fetchone()
                if created is not None:
                    # 申请与流水同笔事务，不会只写一半。
                    conn.execute(
                        """INSERT INTO release_events
                           (event_type, station_code, actor, note, created_at)
                           VALUES ('request', %s, %s, %s, %s)""",
                        (station_code, user["username"],
                         f"技师 {user['username']} 申请开放场站", now),
                    )
                row = conn.execute(
                    """SELECT s.code, s.name, r.status AS request_status,
                              r.requested_by, r.requested_at,
                              r.released_by, r.released_at
                       FROM stations s
                       JOIN release_requests r ON r.station_code = s.code
                       WHERE s.code = %s""",
                    (station_code,),
                ).fetchone()
                if row["request_status"] == "released":
                    return "already_released", row
            conn.commit()
            return ("created" if created is not None else "waiting"), row

    result, row = await run_db(apply)
    if result == "bad_station":
        return jsonify({"detail": "场站不存在"}), 400
    if result == "already_released":
        return jsonify({"detail": "该场站已放行，无需重复申请"}), 409
    return jsonify(row), (201 if result == "created" else 200)


@app.post("/api/stations/<station_code>/release")
@require_supervisor
async def release_station(user, station_code):
    now = datetime.now(timezone.utc)

    def do_release():
        with connect() as conn:
            with conn.transaction():
                # 行锁串行并发点击；只有 pending 申请能被放行。
                req = conn.execute(
                    """SELECT id, requested_by, status
                       FROM release_requests
                       WHERE station_code = %s
                       FOR UPDATE""",
                    (station_code,),
                ).fetchone()
                if req is None:
                    return "no_request", None
                if req["status"] == "released":
                    return "already_released", None
                # 申请人不能给自己场站放行，服务端硬拦。
                if req["requested_by"] == user["username"]:
                    return "self_release", None
                updated = conn.execute(
                    """UPDATE release_requests
                       SET status = 'released', released_by = %s,
                           released_at = %s
                       WHERE id = %s AND status = 'pending'
                       RETURNING id""",
                    (user["username"], now, req["id"]),
                ).fetchone()
                if updated is None:
                    return "already_released", None
                # 放行状态更新与流水写入必须同一事务提交。
                conn.execute(
                    """INSERT INTO release_events
                       (event_type, station_code, actor, note, created_at)
                       VALUES ('release', %s, %s, %s, %s)""",
                    (station_code, user["username"],
                     f"值班长 {user['username']} 放行场站"
                     f"（申请人 {req['requested_by']}）",
                     now),
                )
                row = conn.execute(
                    """SELECT s.code, s.name, r.status AS request_status,
                              r.requested_by, r.requested_at,
                              r.released_by, r.released_at
                       FROM stations s
                       JOIN release_requests r ON r.station_code = s.code
                       WHERE s.code = %s""",
                    (station_code,),
                ).fetchone()
            conn.commit()
            return "ok", row

    result, row = await run_db(do_release)
    if result == "no_request":
        return jsonify({"detail": "该场站尚无开放申请，无可放行项"}), 409
    if result == "already_released":
        return jsonify({"detail": "该场站已放行"}), 409
    if result == "self_release":
        return jsonify({"detail": "申请人不能给自己场站放行"}), 403
    return jsonify(row), 200


@app.get("/api/release-events")
@require_login
async def list_release_events(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, event_type, station_code, actor, note, created_at
                   FROM release_events ORDER BY id DESC LIMIT 100"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)
