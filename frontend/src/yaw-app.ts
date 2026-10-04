import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  station_code: string;
  turbine_code: string;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type Station = {
  code: string;
  name: string;
  last_status: string | null;
  pending_id: number | null;
};

type WaitingRow = {
  id: number;
  station_code: string;
  station_name: string;
  requested_by: string;
  requested_at: string;
};

type ReleasedRow = {
  station_code: string;
  station_name: string;
  released_by: string;
  released_at: string;
};

type EventRow = {
  id: number;
  request_id: number;
  station_code: string;
  station_name: string | null;
  requested_by: string;
  released_by: string;
  released_at: string;
};

type Desk = {
  waiting: WaitingRow[];
  released: ReleasedRow[];
  events: EventRow[];
};

type Session = {
  token: string;
  username: string;
  role: string;
  can_release: boolean;
  station: string | null;
};

type Tab = "submit" | "desk";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 1040px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .tabs {
      display: flex;
      gap: 0.5rem;
    }
    .tab {
      cursor: pointer;
      padding: 0.55rem 1.1rem;
      border-radius: 8px 8px 0 0;
      border: 1px solid #334155;
      border-bottom: none;
      background: #0f172a;
      color: #94a3b8;
      font-weight: 600;
    }
    .tab.active {
      background: #1e293b;
      color: #38bdf8;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 0.25rem;
    }
    input,
    select {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    button {
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: #475569;
    }
    button.go {
      background: #16a34a;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 0.5rem 0.4rem;
      border-bottom: 1px solid #334155;
      vertical-align: top;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #713f12;
      color: #fde68a;
    }
    .locked {
      background: #7f1d1d;
      color: #fecaca;
    }
    .open {
      background: #14532d;
      color: #bbf7d0;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .ok-msg {
      color: #86efac;
      margin-top: 0.5rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .desk-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 760px) {
      .desk-grid {
        grid-template-columns: 1fr;
      }
    }
    .col-title {
      font-size: 1rem;
      margin: 0 0 0.75rem;
    }
    .wait-warn {
      color: #fde68a;
    }
    .open-done {
      color: #86efac;
    }
    .empty {
      color: #64748b;
      font-size: 0.88rem;
    }
    .card {
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.6rem 0.7rem;
      margin-bottom: 0.6rem;
      background: #0f172a;
    }
    .card .meta {
      color: #94a3b8;
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }
    .feed {
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #0f172a;
    }
    .feed table {
      font-size: 0.82rem;
    }
    .badge {
      font-size: 0.75rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      margin-left: 0.4rem;
    }
  `;

  @state() private session: Session | null = null;
  @state() private tab: Tab = "submit";
  @state() private logs: LogRow[] = [];
  @state() private stations: Station[] = [];
  @state() private desk: Desk = { waiting: [], released: [], events: [] };
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private stationCode = "";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private error = "";
  @state() private notice = "";
  @state() private loading = false;

  private _pollTimer?: number;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        this.stationCode = this.session.station ?? "S01";
        void this.refreshAll();
        this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async getJson(path: string) {
    const res = await fetch(path, { headers: this.authHeaders() });
    if (res.status === 401) {
      this.logout();
      return null;
    }
    if (!res.ok) return null;
    return res.json();
  }

  private async refreshAll() {
    if (!this.session) return;
    const [logs, stations, desk] = await Promise.all([
      this.getJson("/api/logs"),
      this.getJson("/api/stations"),
      this.getJson("/api/release-desk"),
    ]);
    if (logs) this.logs = logs as LogRow[];
    if (stations) this.stations = stations as Station[];
    if (desk) this.desk = desk as Desk;
  }

  private async login() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.loginUser,
          password: this.loginPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "登录失败";
        return;
      }
      this.session = {
        token: data.access_token,
        username: data.username,
        role: data.role,
        can_release: !!data.can_release,
        station: data.station ?? null,
      };
      this.stationCode = this.session.station ?? "S01";
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      await this.refreshAll();
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.session = null;
    this.logs = [];
    this.stations = [];
    this.desk = { waiting: [], released: [], events: [] };
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private get canRelease() {
    return !!this.session?.can_release;
  }

  private currentStation(): Station | undefined {
    return this.stations.find((s) => s.code === this.stationCode);
  }

  // 场站当前是否已获值班长放行（最近一次申请为 released）
  private get stationReleased(): boolean {
    const st = this.currentStation();
    return !!st && st.last_status === "released";
  }

  private get stationPending(): boolean {
    const st = this.currentStation();
    return !!st && st.last_status === "pending";
  }

  private async requestRelease() {
    this.error = "";
    this.notice = "";
    this.loading = true;
    try {
      const res = await fetch("/api/release-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({ station_code: this.stationCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "提交开放申请失败";
      } else {
        this.notice = `场站 ${this.stationCode} 开放申请已提交，等待值班长放行`;
      }
      await this.refreshAll();
    } catch {
      this.error = "提交申请时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async doRelease(requestId: number) {
    this.error = "";
    this.notice = "";
    this.loading = true;
    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({ request_id: requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "放行失败";
      } else {
        this.notice = `场站 ${data.station_code} 已放行并记入流水`;
      }
      await this.refreshAll();
    } catch {
      this.error = "放行时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async submitLog() {
    this.error = "";
    this.notice = "";
    this.loading = true;
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          station_code: this.stationCode,
          turbine_code: this.turbineCode,
          yaw_err_deg: Number(this.yawErr),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 未放行时服务端真实退回（403），前端如实展示，而非只在界面上隐藏按钮
        this.error = data.detail || "提交失败";
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      this.notice = `已进入待处理队列（记录 #${data.id}）`;
      await this.refreshAll();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private fmt(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleString("zh-CN", { hour12: false });
    } catch {
      return ts;
    }
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private stationName(code: string): string {
    return this.stations.find((s) => s.code === code)?.name ?? code;
  }

  render() {
    if (!this.session) {
      return html`
        <h1>风机偏航对中台</h1>
        <p class="sub">现场技师提交偏航误差须经值班长场站放行；后台 worker 认领后给出合格或偏航超差结论。</p>
        <section>
          <label>用户名</label>
          <input
            .value=${this.loginUser}
            @input=${(e: Event) =>
              (this.loginUser = (e.target as HTMLInputElement).value)}
          />
          <label>密码</label>
          <input
            type="password"
            .value=${this.loginPass}
            @input=${(e: Event) =>
              (this.loginPass = (e.target as HTMLInputElement).value)}
          />
          <button ?disabled=${this.loading} @click=${this.login}>登录</button>
          ${this.error ? html`<p class="err">${this.error}</p>` : null}
        </section>
      `;
    }

    const roleText = this.isWriter
      ? this.canRelease
        ? "技师 · 值班长放行权"
        : "现场技师 · 可报送"
      : this.canRelease
        ? "观察员 · 值班长放行权（只读不可报送）"
        : "观察员 · 只读";

    return html`
      <h1>风机偏航对中台</h1>
      <div class="topbar">
        <div class="tabs">
          <button
            class="tab ${this.tab === "submit" ? "active" : ""}"
            @click=${() => (this.tab = "submit")}
          >
            偏航报送
          </button>
          <button
            class="tab ${this.tab === "desk" ? "active" : ""}"
            @click=${() => (this.tab = "desk")}
          >
            值班长放行台
          </button>
        </div>
        <div class="row-actions">
          <span class="sub" style="margin:0;">
            ${this.session.username}（${roleText}）
          </span>
          <button class="secondary" @click=${this.logout}>退出</button>
        </div>
      </div>

      ${this.error ? html`<section><p class="err" style="margin:0;">${this.error}</p></section>` : null}
      ${this.notice ? html`<section><p class="ok-msg" style="margin:0;">${this.notice}</p></section>` : null}

      ${this.tab === "submit" ? this.renderSubmit() : this.renderDesk()}
    `;
  }

  private renderSubmit() {
    const released = this.stationReleased;
    const pending = this.stationPending;
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">提交偏航记录</h2>
              <label>场站</label>
              <select
                .value=${this.stationCode}
                @change=${(e: Event) => {
                  this.stationCode = (e.target as HTMLSelectElement).value;
                  this.error = "";
                  this.notice = "";
                }}
              >
                ${this.stations.map(
                  (s) => html`<option value=${s.code}>${s.code} · ${s.name}</option>`
                )}
              </select>

              <div style="margin-bottom:0.75rem;">
                场站放行状态：
                ${released
                  ? html`<span class="tag open">已放行 · 写口已解锁</span>`
                  : pending
                    ? html`<span class="tag pending">等候值班长放行 · 写口锁定</span>`
                    : html`<span class="tag locked">未放行 · 写口锁定</span>`}
              </div>

              <label>机组编号</label>
              <input
                placeholder="例如 W12"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <div class="row-actions">
                <button ?disabled=${this.loading} @click=${this.submitLog}>
                  报送偏航
                </button>
                ${!released
                  ? html`
                      <button
                        class="go"
                        ?disabled=${this.loading || pending}
                        @click=${this.requestRelease}
                      >
                        ${pending ? "已提交，等候放行" : "提交场站开放申请"}
                      </button>
                    `
                  : null}
              </div>
              ${!released
                ? html`<p class="err" style="margin-bottom:0;">
                    该场站未经值班长放行，直接报送会被服务端退回。请先提交开放申请，待值班长放行后再送。
                  </p>`
                : null}
            </section>
          `
        : html`
            <section>
              <p style="margin:0;color:#94a3b8;">
                当前为只读账号，不能报送偏航记录。
                ${this.canRelease ? "你可在「值班长放行台」放行他人场站申请。" : ""}
              </p>
            </section>
          `}

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">对中记录</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>场站</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map(
              (row) => html`
                <tr>
                  <td>${row.id}</td>
                  <td>${row.station_code}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span class="tag ${row.status === "pending" ? "pending" : "ok"}">
                      ${row.status === "pending" ? "待处理" : "已完成"}
                    </span>
                  </td>
                  <td>
                    ${row.verdict
                      ? html`<span class="tag ${this.verdictClass(row)}">${row.verdict}</span>`
                      : "—"}
                  </td>
                  <td>${row.reason ?? "—"}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderDesk() {
    return html`
      <section>
        <h2 style="margin:0 0 0.25rem;font-size:1.1rem;">值班长放行台</h2>
        <p class="sub" style="margin:0 0 1rem;font-size:0.85rem;">
          左列为等候放行的场站，右列为已放开清单。
          ${this.canRelease
            ? "你拥有放行权限；但不能给自己提交的申请放行。"
            : "你仅有查看权限，无放行操作权。"}
        </p>
        <div class="desk-grid">
          <div>
            <h3 class="col-title wait-warn">等候放行（${this.desk.waiting.length}）</h3>
            ${this.desk.waiting.length === 0
              ? html`<p class="empty">暂无等候放行的场站</p>`
              : this.desk.waiting.map(
                  (w) => html`
                    <div class="card">
                      <div class="row-actions" style="justify-content:space-between;">
                        <strong>${w.station_code} · ${w.station_name}</strong>
                        ${this.canRelease
                          ? html`<button
                              class="go"
                              ?disabled=${this.loading ||
                              w.requested_by === this.session?.username}
                              @click=${() => this.doRelease(w.id)}
                            >
                              放行
                            </button>`
                          : html`<span class="tag pending">待值班长</span>`}
                      </div>
                      <div class="meta">
                        申请人：${w.requested_by} · ${this.fmt(w.requested_at)}
                      </div>
                      ${w.requested_by === this.session?.username
                        ? html`<div class="meta" style="color:#fca5a5;">不能给自己场站放行</div>`
                        : null}
                    </div>
                  `
                )}
          </div>
          <div>
            <h3 class="col-title open-done">已放开清单（${this.desk.released.length}）</h3>
            ${this.desk.released.length === 0
              ? html`<p class="empty">尚无已放行场站</p>`
              : this.desk.released.map(
                  (r) => html`
                    <div class="card">
                      <strong>${r.station_code} · ${r.station_name}</strong>
                      <div class="meta">
                        <span class="tag open">已放开</span>
                        放行：${r.released_by} · ${this.fmt(r.released_at)}
                      </div>
                    </div>
                  `
                )}
          </div>
        </div>
      </section>

      <section>
        <h3 class="col-title" style="margin-bottom:0.5rem;">放行流水</h3>
        <div class="feed">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>场站</th>
                <th>申请人</th>
                <th>放行人</th>
              </tr>
            </thead>
            <tbody>
              ${this.desk.events.length === 0
                ? html`<tr><td colspan="4" class="empty">暂无放行流水</td></tr>`
                : this.desk.events.map(
                    (e) => html`
                      <tr>
                        <td>${this.fmt(e.released_at)}</td>
                        <td>${e.station_code}${e.station_name ? " · " + e.station_name : ""}</td>
                        <td>${e.requested_by}</td>
                        <td>${e.released_by}</td>
                      </tr>
                    `
                  )}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
