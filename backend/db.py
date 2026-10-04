import os

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA = """
-- 场站主数据：机组归属于场站，报送偏航按场站受放行闸口控制
CREATE TABLE IF NOT EXISTS stations (
    code text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    station_code text NOT NULL DEFAULT 'S01',
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_yaw_logs_station ON yaw_logs (station_code);

-- 开放申请：一个场站同一时刻只允许存在一条「等候放行」(pending) 申请；
-- 放行后该场站可再次发起申请，故仅对 pending 做唯一约束。
CREATE TABLE IF NOT EXISTS release_requests (
    id serial PRIMARY KEY,
    station_code text NOT NULL REFERENCES stations(code),
    status text NOT NULL DEFAULT 'pending',  -- pending / released
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL,
    released_by text,
    released_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_release_pending_station
    ON release_requests (station_code)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_release_station ON release_requests (station_code, id);

-- 放行流水：每次放行落一条审计记录，与放行动作同事务写入
CREATE TABLE IF NOT EXISTS release_events (
    id serial PRIMARY KEY,
    request_id integer NOT NULL,
    station_code text NOT NULL,
    station_name text,
    requested_by text NOT NULL,
    released_by text NOT NULL,
    released_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_release_events_time ON release_events (id DESC);

-- 兼容旧库：补齐场站列
ALTER TABLE yaw_logs ADD COLUMN IF NOT EXISTS station_code text NOT NULL DEFAULT 'S01';
"""

# 基础场站（幂等）
SEED_STATIONS = """
INSERT INTO stations (code, name) VALUES
    ('S01', '一号场站'),
    ('S02', '二号场站'),
    ('S03', '三号场站')
ON CONFLICT (code) DO NOTHING;
"""


def ensure_schema(conn):
    conn.execute(SCHEMA)
    conn.execute(SEED_STATIONS)
    conn.commit()
