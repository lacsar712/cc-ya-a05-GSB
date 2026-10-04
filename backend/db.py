import os

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


# 场站目录：写口默认全部锁定，须技师申请、值班长放行后才能报送偏航。
STATION_CATALOG = [
    ("S01", "一号场站"),
    ("S02", "二号场站"),
    ("S03", "三号场站"),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz,
    station_code text
);
ALTER TABLE yaw_logs ADD COLUMN IF NOT EXISTS station_code text;

CREATE TABLE IF NOT EXISTS stations (
    code text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_requests (
    id serial PRIMARY KEY,
    station_code text NOT NULL UNIQUE REFERENCES stations(code),
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    released_by text,
    released_at timestamptz
);

CREATE TABLE IF NOT EXISTS release_events (
    id serial PRIMARY KEY,
    event_type text NOT NULL,
    station_code text NOT NULL,
    actor text NOT NULL,
    note text,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_events_id ON release_events (id);

INSERT INTO stations (code, name) VALUES
    ('S01', '一号场站'),
    ('S02', '二号场站'),
    ('S03', '三号场站')
ON CONFLICT (code) DO NOTHING;
"""
