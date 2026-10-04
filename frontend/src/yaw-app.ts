import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  station_code: string | null;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type StationRow = {
  code: string;
  name: string;
  request_status: "pending" | "released" | null;
  requested_by: string | null;
  requested_at: string | null;
  released_by: string | null;
  released_at: string | null;
};

type ReleaseEvent = {
  id: number;
  event_type: string;
  station_code: string;
  actor: string;
  note: string | null;
  created_at: string;
};

type Session = {
  token: string;
  username: string;
  perms: string[];
};

type Tab = "logs" | "release";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 1080px;
      margin: 0 auto;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }
    .brand {
      font-size: 1.5rem;
      font-weight: 700;
      color: #38bdf8;
    }
    nav {
      display: flex;
      gap: 0.5rem;
    }
    nav button {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    nav button.active {
      background: #0284c7;
      color: #fff;
      border-color: #0284c7;
    }
    .who {
      margin-left: auto;
      color: #94a3b8;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .perm-tag {
      background: #334155;
      color: #e2e8f0;
      border-radius: 4px;
      padding: 0.1rem 0.45rem;
      font-size: 0.75rem;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    h2 {
      margin-top: 0;
      font-size: 1.1rem;
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
    button.warn {
      background: #b45309;
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
      background: #3f3f46;
      color: #d4d4d8;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.8rem;
      margin-top: 0.5rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .release-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .col {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0.75rem;
      min-height: 12rem;
    }
    .col h3 {
      margin: 0 0 0.6rem;
      font-size: 0.95rem;
      color: #94a3b8;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.6rem 0.7rem;
      margin-bottom: 0.6rem;
    }
    .card-title {
      font-weight: 600;
      margin-bottom: 0.2rem;
    }
    .card-meta {
      color: #94a3b8;
      font-size: 0.78rem;
      margin-bottom: 0.5rem;
    }
    .empty {
      color: #64748b;
      font-size: 0.85rem;
    }
    .feed {
      height: 15rem;
      overflow-y: auto;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
    }
    .feed-item {
      padding: 0.45rem 0;
      border-bottom: 1px dashed #334155;
      font-size: 0.85rem;
      display: flex;
      gap: 0.6rem;
      align-items: baseline;
    }
    .feed-time {
      color: #64748b;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .feed-note {
      color: #e2e8f0;
    }
    .feed-item.event-release .feed-dot {
      color: #4ade80;
    }
    .feed-item.event-request .feed-dot {
      color: #fbbf24;
    }
    @media (max-width: 760px) {
      .release-cols {
        grid-template-columns: 1fr;
      }
      .who {
        margin-left: 0;
      }
    }
  `;

  @state() private session: Session | null = null;
  @state() private tab: Tab = "logs";
  @state() private logs: LogRow[] = [];
  @state() private stations: StationRow[] = [];
  @state() private events: ReleaseEvent[] = [];
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private stationCode = "";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private error = "";
  @state() private releaseError = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.refreshAll();
        this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  private _pollTimer?: number;

  private get isWriter() {
    return this.session?.perms.includes("writer") ?? false;
  }

  private get isSupervisor() {
    return this.session?.perms.includes("supervisor") ?? false;
  }

  private permLabels(): string[] {
    const labels: string[] = [];
    if (this.isWriter) labels.push("可报送");
    if (this.isSupervisor) labels.push("值班长放行");
    if (labels.length === 0) labels.push("只读");
    return labels;
  }

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshAll() {
    await Promise.all([
      this.refreshLogs(),
      this.refreshStations(),
      this.refreshEvents(),
    ]);
  }

  private async refreshLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/logs", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      this.logs = (await res.json()) as LogRow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshStations() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/stations", { headers: this.authHeaders() });
      if (!res.ok) return;
      this.stations = (await res.json()) as StationRow[];
      if (!this.stationCode && this.stations.length > 0) {
        this.stationCode = this.stations[0].code;
      }
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshEvents() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/release-events", {
        headers: this.authHeaders(),
      });
      if (!res.ok) return;
      this.events = (await res.json()) as ReleaseEvent[];
    } catch {
      /* ignore transient network errors */
    }
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
        perms: data.perms ?? [],
      };
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      this.tab = "logs";
      await this.refreshAll();
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
    this.events = [];
    localStorage.removeItem("yaw_session");
  }

  private switchTab(tab: Tab) {
    this.tab = tab;
    this.error = "";
    this.releaseError = "";
  }

  private async submitLog() {
    this.error = "";
    if (!this.stationCode) {
      this.error = "请选择场站";
      return;
    }
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
        // 未放行场站：服务端硬退回，这里原样展示退回原因。
        this.error = data.detail || "提交失败";
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshLogs();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async requestOpen(code: string) {
    this.releaseError = "";
    try {
      const res = await fetch(`/api/stations/${code}/request`, {
        method: "POST",
        headers: this.authHeaders(),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        this.releaseError = data.detail || "申请失败";
        return;
      }
      await Promise.all([this.refreshStations(), this.refreshEvents()]);
    } catch {
      this.releaseError = "申请时网络异常";
    }
  }

  private async releaseStation(code: string) {
    this.releaseError = "";
    try {
      const res = await fetch(`/api/stations/${code}/release`, {
        method: "POST",
        headers: this.authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        this.releaseError = data.detail || "放行失败";
        return;
      }
      await Promise.all([
        this.refreshStations(),
        this.refreshEvents(),
        this.refreshLogs(),
      ]);
    } catch {
      this.releaseError = "放行时网络异常";
    }
  }

  private stationName(code: string | null): string {
    if (!code) return "—";
    return this.stations.find((s) => s.code === code)?.name ?? code;
  }

  private fmt(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private stationStateTag(s: StationRow) {
    if (s.request_status === "released") {
      return html`<span class="tag ok">已放行</span>`;
    }
    if (s.request_status === "pending") {
      return html`<span class="tag pending">待放行</span>`;
    }
    return html`<span class="tag locked">未申请</span>`;
  }

  render() {
    if (!this.session) {
      return html`
        <div class="brand">风机偏航对中台</div>
        <p class="sub">
          现场技师提交偏航误差；场站须先申请、经值班长放行后写口才解锁，
          后台 worker 认领后给出合格或偏航超差结论。
        </p>
        <section>
          <h2>登录</h2>
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
          <p class="hint">
            演示账号：technician / tech123456（现场技师，可申请、可报送）；
            foreman / boss123456（值班长，可放行）；
            obsboss / obsboss123456（观察员兼值班长，可放行、不可报送）；
            observer / obs123456（只读）。
          </p>
        </section>
      `;
    }

    return html`
      <header class="topbar">
        <div class="brand">风机偏航对中台</div>
        <nav>
          <button
            class=${this.tab === "logs" ? "active" : ""}
            @click=${() => this.switchTab("logs")}
          >
            偏航报送
          </button>
          <button
            class=${this.tab === "release" ? "active" : ""}
            @click=${() => this.switchTab("release")}
          >
            值班长放行台
          </button>
        </nav>
        <div class="who">
          <span
            >${this.session.username}
            ${this.permLabels().map(
              (p) => html`<span class="perm-tag">${p}</span>`
            )}</span
          >
          <button class="secondary" @click=${this.logout}>退出</button>
        </div>
      </header>

      ${this.tab === "logs" ? this.renderLogsTab() : this.renderReleaseTab()}
    `;
  }

  private renderLogsTab() {
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2>提交偏航记录</h2>
              <label>场站（须已放行）</label>
              <select
                .value=${this.stationCode}
                @change=${(e: Event) =>
                  (this.stationCode = (e.target as HTMLSelectElement).value)}
              >
                ${this.stations.map(
                  (s) => html`
                    <option value=${s.code}>
                      ${s.name}（${s.code}）—
                      ${s.request_status === "released"
                        ? "已放行"
                        : s.request_status === "pending"
                          ? "待值班长放行"
                          : "未申请开放"}
                    </option>
                  `
                )}
              </select>
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
              <button ?disabled=${this.loading} @click=${this.submitLog}>
                报送偏航
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
              <p class="hint">
                未放行场站的送单会被服务端当场退回；请先到「值班长放行台」提交开放申请。
              </p>
            </section>
          `
        : html`
            <section>
              <h2>偏航记录</h2>
              <p class="hint">
                当前账号无报送权限
                ${this.isSupervisor
                  ? "（值班长权限只管放行，不能报送偏航）"
                  : ""}。
              </p>
            </section>
          `}

      <section>
        <div class="row-actions">
          <h2 style="margin:0;">对中记录</h2>
          <button
            class="secondary"
            ?disabled=${this.loading}
            @click=${this.refreshLogs}
          >
            刷新列表
          </button>
        </div>
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
                  <td>${this.stationName(row.station_code)}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span
                      class="tag ${row.status === "pending"
                        ? "pending"
                        : "ok"}"
                    >
                      ${row.status === "pending" ? "待处理" : "已完成"}
                    </span>
                  </td>
                  <td>
                    ${row.verdict
                      ? html`<span class="tag ${this.verdictClass(row)}"
                          >${row.verdict}</span
                        >`
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

  private renderReleaseTab() {
    const pending = this.stations.filter(
      (s) => s.request_status === "pending"
    );
    const released = this.stations.filter(
      (s) => s.request_status === "released"
    );
    const unrequested = this.stations.filter((s) => s.request_status === null);

    return html`
      <section>
        <h2>值班长放行台</h2>
        <p class="hint" style="margin-top:-0.4rem;">
          左列等候放行的场站由技师提交开放申请；值班长点「放行」后写口才解锁。
          申请人不能给自己场站放行。
        </p>
        <div class="release-cols">
          <div class="col">
            <h3>等候放行（${pending.length}）</h3>
            ${pending.length === 0
              ? html`<p class="empty">暂无等候放行的场站。</p>`
              : pending.map((s) => {
                  const selfRequested =
                    s.requested_by === this.session?.username;
                  return html`
                    <div class="card">
                      <div class="card-title">
                        ${s.name}
                        <span class="tag pending">待放行</span>
                      </div>
                      <div class="card-meta">
                        ${s.code} · 申请人 ${s.requested_by} ·
                        ${this.fmt(s.requested_at)}
                      </div>
                      ${this.isSupervisor
                        ? html`
                            <button
                              class="warn"
                              ?disabled=${selfRequested}
                              @click=${() => this.releaseStation(s.code)}
                            >
                              放行
                            </button>
                            ${selfRequested
                              ? html`<span class="hint"
                                  >申请人不能给自己场站放行</span
                                >`
                              : null}
                          `
                        : html`<span class="hint">等候值班长放行</span>`}
                    </div>
                  `;
                })}
            ${unrequested.map(
              (s) => html`
                <div class="card">
                  <div class="card-title">
                    ${s.name} <span class="tag locked">未申请</span>
                  </div>
                  <div class="card-meta">${s.code}</div>
                  ${this.isWriter
                    ? html`
                        <button @click=${() => this.requestOpen(s.code)}>
                          提交开放申请
                        </button>
                      `
                    : html`<span class="hint">技师尚未提交开放申请</span>`}
                </div>
              `
            )}
          </div>

          <div class="col">
            <h3>已放开清单（${released.length}）</h3>
            ${released.length === 0
              ? html`<p class="empty">尚无已放行场站。</p>`
              : released.map(
                  (s) => html`
                    <div class="card">
                      <div class="card-title">
                        ${s.name} <span class="tag ok">已放行</span>
                      </div>
                      <div class="card-meta">
                        ${s.code} · 放行人 ${s.released_by} ·
                        ${this.fmt(s.released_at)}
                      </div>
                    </div>
                  `
                )}
          </div>
        </div>
        ${this.releaseError
          ? html`<p class="err">${this.releaseError}</p>`
          : null}
      </section>

      <section>
        <h2>放行流水</h2>
        <div class="feed">
          ${this.events.length === 0
            ? html`<p class="empty">暂无流水。</p>`
            : this.events.map(
                (ev) => html`
                  <div class="feed-item event-${ev.event_type}">
                    <span class="feed-dot">●</span>
                    <span class="feed-time">${this.fmt(ev.created_at)}</span>
                    <span class="feed-note"
                      >${ev.note ??
                      `${ev.event_type} · ${ev.station_code} · ${ev.actor}`}</span
                    >
                  </div>
                `
              )}
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
