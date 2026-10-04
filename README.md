# 风机偏航对中台

现场技师登记**场站**、机组编号与偏航误差（度）；但**没有值班长放行的场站机组不得报送偏航**：技师须先在「值班长放行台」提交场站开放申请，由值班长点放行后写口才解锁。后台 worker 用数据库行锁认领待处理记录，按 ±1.5° 阈值写入「合格」或「偏航超差」。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号

| 用户 | 密码 | 角色 | 放行权 | 场站 |
|------|------|------|--------|------|
| technician | tech123456 | 可提交（writer） | 否 | S01 |
| stationtech2 | tech123456 | 可提交（writer） | 否 | S02 |
| foreman | fore123456 | 可提交（writer） | **是（值班长）** | S02 |
| supervisor | sup123456 | 只读（reader） | **是（带班观察员）** | — |
| observer | obs123456 | 只读（reader） | 否 | — |

- `role=writer` 才能走报送写口；放行权限 `can_release` 与角色**正交**。观察员即便带值班长权限（supervisor）**可以放行、仍不能报送**。
- 申请人**不能给自己场站放行**，须由其他值班长放行。

## 放行闸口规则

1. 技师在「偏航报送」页选场站；未放行时点「提交场站开放申请」，该场站进入放行台**左列（等候放行）**，此时写口仍锁定，直接报送会被服务端 `403` 退回。
2. 值班长在顶栏「**值班长放行台**」专页放行：左列为等候放行场站、右列为已放开清单、底部为滚动**放行流水**。
3. 放行点击（更新申请为 released）与流水记录在**同一数据库事务**内完成，故障时整体回滚，禁止只写一半。
4. 放行后该场站写口解锁，技师再送单进入「待处理」，worker 数秒内给出结论。

## 启动

```bash
cd projects/20-yaw-align-log
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 验收

1. 种子数据：一号场站 S01 机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. **一号场站闸口链路**：technician 在 S01 未放行时先送单 → 服务端 `403` 退回；提交开放申请（未放行前再送仍 `403`）；由 foreman 在放行台点放行后，再送单进入「待处理」，数秒内 worker 处理为对应结论，且放行台流水留有「申请人 technician / 放行人 foreman」痕迹。
3. 自批拒绝：foreman 为自己所属场站 S02 提交申请后点自己放行 → `403`，申请停留等候列、流水无记录。
4. 观察员带班：supervisor（reader + 放行权）可放行他人申请，但自己报送 → `403`。
5. observer 可查看列表与放行台，无报送表单、无放行按钮。

## 主要接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/release-requests` | writer | 提交场站开放申请（写口仍锁） |
| GET | `/api/release-desk` | 登录 | 等候列 / 已放开 / 流水 |
| POST | `/api/releases` | can_release | 放行；与流水同事务；禁自批 |
| POST | `/api/logs` | writer | 报送偏航；**服务端校验场站已放行，否则 403** |

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
