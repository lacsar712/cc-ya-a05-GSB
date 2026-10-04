# 风机偏航对中台

现场技师登记场站、机组编号与偏航误差（度）；**场站须先由技师提交开放申请、经值班长在「值班长放行台」放行后，报送写口才解锁**，未放行场站的送单由后端直接退回。后台 worker 用数据库行锁认领待处理记录，按 ±1.5° 阈值写入「合格」或「偏航超差」。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号与权限

报送（writer）与放行（supervisor）是两本独立权限：

| 用户 | 密码 | 权限 |
|------|------|------|
| technician | tech123456 | 可提交开放申请、可报送偏航；不能放行 |
| observer | obs123456 | 只读 |
| foreman | boss123456 | 值班长，可放行；不能报送 |
| obsboss | obsboss123456 | 观察员兼值班长：可放行别人场站，自身仍不能报送 |

## 放行规则（后端硬约束，非仅界面）

1. 没有值班长放行记录的场站，`POST /api/logs` 一律 403 退回——校验与插入在同一数据库事务内完成。
2. 技师在「值班长放行台」左列对场站提交开放申请；申请写入与流水记录同笔事务。
3. 值班长在左列点「放行」：申请状态置为 released、写放行流水，两者必须同一事务提交（`FOR UPDATE` 行锁 + 条件更新，并发点击只成一笔）。
4. 申请人不能给自己场站放行（服务端 403，前端按钮同时禁用）。
5. 带值班长权限的观察员（obsboss）可以放行，但因没有 writer 权限，报送仍被拒。
6. 页面底部「放行流水」每 2 秒轮询，留痕全部申请与放行动作。

## 启动

```bash
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | - | 登录，返回含 `perms` 的 JWT |
| GET | `/api/stations` | 登录 | 场站目录及申请/放行状态 |
| POST | `/api/stations/<code>/request` | writer | 提交开放申请（重复 pending 返回 200，已放行 409） |
| POST | `/api/stations/<code>/release` | supervisor | 放行场站（申请人自批 403，重复放行 409） |
| GET | `/api/release-events` | 登录 | 放行/申请流水（最近 100 条） |
| POST | `/api/logs` | writer | 报送偏航；场站未放行 403 |
| GET | `/api/logs` | 登录 | 对中记录列表 |

## 验收

1. 种子数据：机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. technician 对一号场站（S01）提交开放申请；**放行前**报送偏航被 403 退回，列表无新记录。
3. technician 自己点放行返回 403；foreman 放行 S01 后，右列出现该场站，底部流水同时留下 request 与 release 两条痕迹。
4. 放行后 technician 再报送，记录以「待处理」进入队列，数秒内 worker 处理为对应结论。
5. observer 全站只读；obsboss 能放行，但自己报送偏航仍 403。
6. 并发重复放行同一申请只生效一次（200 + 409），流水不重复。

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
