import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request
import psycopg

from db import SCHEMA, connect, ensure_schema
from rules import judge

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# role: writer 可报送偏航；reader 只读。
# can_release: 是否拥有值班长放行权限（与 role 正交：观察员带班权限可放行，仍不能报送）。
# station: 该账号所属场站，用于前端默认填充与申请归属。
USERS = {
    "technician": {
        "role": "writer",
        "can_release": False,
        "station": "S01",
        "password_hash": pwd.hash("tech123456"),
    },
    "stationtech2": {
        "role": "writer",
        "can_release": False,
        "station": "S02",
        "password_hash": pwd.hash("tech123456"),
    },
    "foreman": {
        "role": "writer",
        "can_release": True,
        "station": "S02",
        "password_hash": pwd.hash("fore123456"),
    },
    "supervisor": {
        "role": "reader",
        "can_release": True,
        "station": None,
        "password_hash": pwd.hash("sup123456"),
    },
    "observer": {
        "role": "reader",
        "can_release": False,
        "station": None,
        "password_hash": pwd.hash("obs123456"),
    },
}

app = Quart(__name__)


@app.errorhandler(psycopg.Error)
async def db_error(exc):
    # 事务在写流水等环节失败时，整笔回滚（见 create_release 的 with transaction），
    # 这里仅把数据库错误统一成 JSON，避免向前端吐出 500 HTML。
    return jsonify({"detail": "数据库操作失败，已回滚", "error": str(exc)}), 500


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
        ("S01", "W01", 0.4, "合格"),
        ("S01", "W07", 3.2, "偏航超差"),
    ]
    for station, code, err, expected_verdict in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (station_code, turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, %s, 'done', %s, %s, %s, %s, %s)""",
            (station, code, err, verdict, reason, "technician", now, now),
        )


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            ensure_schema(conn)
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
    return {
        "username": sub,
        "role": payload.get("role"),
        "can_release": bool(payload.get("can_release")),
        "station": payload.get("station"),
    }


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def require_writer(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        # 只有 writer 能写报送口；即便携带放行权限（观察员带班），role 仍是 reader，照样拒绝。
        if user["role"] != "writer":
            return jsonify({"detail": "仅现场技师可提交偏航记录"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


def require_release_right(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        if not user["can_release"]:
            return jsonify({"detail": "无值班长放行权限"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


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
        {
            "sub": username,
            "role": user["role"],
            "can_release": user["can_release"],
            "station": user["station"],
            "exp": exp,
        },
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "role": user["role"],
            "can_release": user["can_release"],
            "station": user["station"],
        }
    )


@app.get("/api/stations")
@require_login
async def list_stations(user):
    def query():
        with connect() as conn:
            stations = conn.execute(
                """SELECT s.code, s.name,
                          (SELECT status FROM release_requests r
                           WHERE r.station_code = s.code
                           ORDER BY r.id DESC LIMIT 1) AS last_status,
                          (SELECT r.id FROM release_requests r
                           WHERE r.station_code = s.code AND r.status = 'pending'
                           ORDER BY r.id DESC LIMIT 1) AS pending_id
                   FROM stations s ORDER BY s.code"""
            ).fetchall()
            return stations

    rows = await run_db(query)
    return jsonify(rows)


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, station_code, turbine_code, yaw_err_deg, status,
                          verdict, reason, created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/release-requests")
@require_writer
async def create_release_request(user):
    """技师提交场站开放申请，进入「等候放行」队列，写口此时仍锁定。"""
    body = await request.get_json(force=True, silent=True) or {}
    station_code = (body.get("station_code") or "").strip()
    if not station_code:
        return jsonify({"detail": "场站编号不能为空"}), 400
    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            station = conn.execute(
                "SELECT code FROM stations WHERE code = %s", (station_code,)
            ).fetchone()
            if station is None:
                return None, "unknown_station"
            latest = conn.execute(
                """SELECT status FROM release_requests
                   WHERE station_code = %s ORDER BY id DESC LIMIT 1""",
                (station_code,),
            ).fetchone()
            # 放行是场站写口的开放态（持续有效）：已开放无需重复申请，
            # 也避免用一条新申请把已开放场站重新打回锁定。
            if latest is not None and latest["status"] == "released":
                return None, "already_open"
            if latest is not None and latest["status"] == "pending":
                return None, "duplicate"
            row = conn.execute(
                """INSERT INTO release_requests
                   (station_code, status, requested_by, requested_at)
                   VALUES (%s, 'pending', %s, %s)
                   RETURNING id, station_code, status, requested_by, requested_at""",
                (station_code, user["username"], now),
            ).fetchone()
            conn.commit()
            return row, None

    row, err = await run_db(insert)
    if err == "unknown_station":
        return jsonify({"detail": "场站不存在"}), 400
    if err == "already_open":
        return jsonify({"detail": "该场站已经值班长放行，写口已开放，无需重复申请"}), 409
    if err == "duplicate":
        return jsonify({"detail": "该场站已有等候放行的申请，无需重复提交"}), 409
    return jsonify(row), 201


@app.get("/api/release-desk")
@require_login
async def release_desk(user):
    """放行台：左列等候、右列已放开、底部流水。"""
    def query():
        with connect() as conn:
            waiting = conn.execute(
                """SELECT r.id, r.station_code, s.name AS station_name,
                          r.requested_by, r.requested_at
                   FROM release_requests r
                   JOIN stations s ON s.code = r.station_code
                   WHERE r.status = 'pending'
                   ORDER BY r.id"""
            ).fetchall()
            # 右列「已放开」= 当前写口开放的场站：取每站最新一条申请，
            # 仅当它仍为 released 才列入；若已再次发起申请(pending)则应回到左列、离开右列。
            released = conn.execute(
                """SELECT t.station_code, t.station_name, t.released_by, t.released_at
                   FROM (
                       SELECT DISTINCT ON (r.station_code)
                              r.station_code, s.name AS station_name,
                              r.released_by, r.released_at, r.status
                       FROM release_requests r
                       JOIN stations s ON s.code = r.station_code
                       ORDER BY r.station_code, r.id DESC
                   ) t
                   WHERE t.status = 'released'
                   ORDER BY t.released_at DESC"""
            ).fetchall()
            events = conn.execute(
                """SELECT id, request_id, station_code, station_name,
                          requested_by, released_by, released_at
                   FROM release_events ORDER BY id DESC LIMIT 100"""
            ).fetchall()
            return {"waiting": waiting, "released": released, "events": events}

    data = await run_db(query)
    return jsonify(data)


@app.post("/api/releases")
@require_release_right
async def create_release(user):
    """值班长点放行：更新申请 + 写流水必须在同一事务内完成，禁止只写一半。"""
    body = await request.get_json(force=True, silent=True) or {}
    request_id = body.get("request_id")
    station_code = (body.get("station_code") or "").strip() or None
    now = datetime.now(timezone.utc)

    def release():
        with connect() as conn:
            # 单连接 + 显式事务：锁行、改状态、写流水要么全部提交，要么全部回滚。
            with conn.transaction():
                if request_id is not None:
                    row = conn.execute(
                        """SELECT id, station_code, status, requested_by
                           FROM release_requests WHERE id = %s FOR UPDATE""",
                        (request_id,),
                    ).fetchone()
                else:
                    row = conn.execute(
                        """SELECT id, station_code, status, requested_by
                           FROM release_requests
                           WHERE station_code = %s AND status = 'pending'
                           ORDER BY id DESC LIMIT 1 FOR UPDATE""",
                        (station_code,),
                    ).fetchone()

                if row is None:
                    return None, "not_found"
                if row["status"] != "pending":
                    return None, "not_pending"
                # 申请人不能给自己场站放行。
                if row["requested_by"] == user["username"]:
                    return None, "self_release"

                station = conn.execute(
                    "SELECT name FROM stations WHERE code = %s",
                    (row["station_code"],),
                ).fetchone()
                station_name = station["name"] if station else None

                conn.execute(
                    """UPDATE release_requests
                       SET status = 'released', released_by = %s, released_at = %s
                       WHERE id = %s""",
                    (user["username"], now, row["id"]),
                )
                conn.execute(
                    """INSERT INTO release_events
                       (request_id, station_code, station_name, requested_by,
                        released_by, released_at)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (
                        row["id"],
                        row["station_code"],
                        station_name,
                        row["requested_by"],
                        user["username"],
                        now,
                    ),
                )
            conn.commit()

            event = conn.execute(
                "SELECT * FROM release_events WHERE request_id = %s ORDER BY id DESC LIMIT 1",
                (row["id"],),
            ).fetchone()
            return event, None

    event, err = await run_db(release)
    if err == "not_found":
        return jsonify({"detail": "未找到该场站的待放行申请"}), 404
    if err == "not_pending":
        return jsonify({"detail": "该申请已放行，请勿重复操作"}), 409
    if err == "self_release":
        return jsonify({"detail": "申请人不能给自己场站放行，请由其他值班长放行"}), 403
    return jsonify(event), 201


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    station_code = (body.get("station_code") or user["station"] or "").strip()
    turbine_code = (body.get("turbine_code") or "").strip()
    if not station_code:
        return jsonify({"detail": "场站编号不能为空"}), 400
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
                    "SELECT code FROM stations WHERE code = %s FOR SHARE",
                    (station_code,),
                ).fetchone()
                if station is None:
                    return None, "unknown_station"

                # 真正的写口闸口（服务端强制，前端美化不能替代）：
                # 该场站最近一次放行申请必须为 released，未申请/等候中一律退回。
                last = conn.execute(
                    """SELECT status FROM release_requests
                       WHERE station_code = %s ORDER BY id DESC LIMIT 1""",
                    (station_code,),
                ).fetchone()
                if last is None or last["status"] != "released":
                    return None, "not_released"

                row = conn.execute(
                    """INSERT INTO yaw_logs
                       (station_code, turbine_code, yaw_err_deg, status, verdict,
                        reason, created_by, created_at)
                       VALUES (%s, %s, %s, 'pending', NULL, NULL, %s, %s)
                       RETURNING id, station_code, turbine_code, yaw_err_deg, status,
                                 verdict, reason, created_by, created_at, processed_at""",
                    (station_code, turbine_code, yaw_err_deg, user["username"], now),
                ).fetchone()
            conn.commit()
            return row, None

    row, err = await run_db(insert)
    if err == "unknown_station":
        return jsonify({"detail": "场站不存在"}), 400
    if err == "not_released":
        return jsonify({"detail": f"场站 {station_code} 未经值班长放行，报送已退回"}), 403
    return jsonify(row), 201
