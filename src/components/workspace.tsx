"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  defaults,
  duration,
  inRange,
  metrics,
  steps,
  summary,
  thaiDate,
  thaiTime,
  type Case,
  type Patient,
  type Rca,
  type Snapshot,
  type TargetKey,
  type TimeKey,
} from "@/lib/model";
type Command = Record<string, unknown>;
type Modal =
  "er" | "refer" | "outcome" | "rca" | "summary" | "settings" | "ekg" | null;
const metricNames = {
  ekg: "Door → EKG",
  needle: "Door → Needle",
  dido: "Door-in → Door-out",
  lab: "Door → Troponin",
};
function inputTime(t: number | null) {
  return t == null ? "" : new Date(t + 7 * 3600000).toISOString().slice(0, 19);
}
function parseTime(s: string) {
  return s ? Date.parse(s + "+07:00") : null;
}
async function request(action = "state", body?: Command) {
  const r = await fetch("/api/stemi?action=" + action, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const j = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(j.error || "เชื่อมต่อไม่สำเร็จ"), {
      status: r.status,
    });
  return j;
}
export default function Workspace() {
  const [s, setS] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("timer");
  const [now, setNow] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(false),
    [connected, setConnected] = useState(false);
  const [token, setToken] = useState(""),
    [modal, setModal] = useState<Modal>(null),
    [modalId, setModalId] = useState(""),
    [toast, setToast] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]),
    [search, setSearch] = useState(""),
    [linking, setLinking] = useState(false);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [pathFilter, setPathFilter] = useState("all");
  const [note, setNote] = useState(""),
    [important, setImportant] = useState(false),
    [hide, setHide] = useState(true);
  const offset = useRef(0),
    inFlight = useRef(false),
    frame = useRef<HTMLIFrameElement>(null);
  const update = useCallback((j: Snapshot) => {
    offset.current = j.serverNow - Date.now();
    setNow(Date.now() + offset.current);
    setS(j);
    setConnected(true);
    setLogin(false);
  }, []);
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      update(await request());
    } catch (e) {
      setConnected(false);
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) setLogin(true);
    } finally {
      inFlight.current = false;
    }
  }, [update]);
  useEffect(() => {
    void sync();
    const p = setInterval(() => void sync(), 10000);
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => {
      clearInterval(p);
      clearInterval(t);
    };
  }, [sync]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const op = useCallback(
    async (cmd: Command) => {
      setBusy(true);
      setError("");
      inFlight.current = true;
      try {
        update(await request("op", cmd));
        setToast("บันทึกแล้ว");
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [update],
  );
  const active = s?.cases.find((c) => c.id === selected) || s?.cases[0];
  const mc = [...(s?.cases || []), ...(s?.log || [])].find(
    (c) => c.id === modalId,
  );
  const open = (m: Modal, c?: Case) => {
    setModal(m);
    setModalId(c?.id || "");
    setHide(true);
  };
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (
        e.origin !== location.origin ||
        e.source !== frame.current?.contentWindow ||
        modal !== "ekg" ||
        !mc
      )
        return;
      if (e.data?.type === "stemi-ekg-close") setModal(null);
      if (e.data?.type === "stemi-ekg-result" && e.data.caseId === mc.id) {
        const r = e.data.result;
        if (
          await op({
            op: "ekg",
            id: mc.id,
            value: {
              report: String(r.report || "").slice(0, 4000),
              impression: Array.isArray(r.impression)
                ? r.impression
                    .slice(0, 6)
                    .map((x: unknown) => String(x).slice(0, 300))
                : [],
              urgency: ["critical", "urgent", "routine"].includes(r.urgency)
                ? r.urgency
                : "urgent",
              model: String(r.model || "").slice(0, 100),
            },
          })
        )
          setModal(null);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [modal, mc, op]);
  async function openEr(link = false) {
    setLinking(link);
    setSearch("");
    setModal("er");
    setModalId(active?.id || "");
    try {
      setPatients((await request("er")).list);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addCase() {
    if (await op({ op: "new" })) setSelected("");
  }
  const exportUrl = (action: string, c?: Case, kind?: string) =>
    "/api/stemi?" +
    new URLSearchParams({
      action,
      ...(c ? { id: c.id } : {}),
      ...(kind ? { kind } : {}),
      from,
      to,
      path: pathFilter,
      search,
    });
  const records = (s?.log || []).filter(
    (c) =>
      inRange(c, from, to) &&
      (pathFilter === "all" || c.path === pathFilter) &&
      (!search ||
        `${c.label} ${c.hn} ${c.vn}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const setField = (c: Case, field: string, value: unknown) =>
    op({ op: "set", id: c.id, field, value });
  if (login)
    return (
      <main className="login">
        <div className="brandmark">
          <HeartPulse size={32} />
        </div>
        <h1>STEMI Fast Track</h1>
        <p>เข้าสู่ระบบสำหรับบุคลากรโรงพยาบาล</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request("op", { op: "login", token });
              await sync();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            รหัสเข้าใช้งาน
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary">
            เข้าสู่ระบบ <ArrowRight size={16} />
          </button>
        </form>
        {error && <p className="danger">{error}</p>}
      </main>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brandmark">
            <HeartPulse />
          </span>
          <span>
            STEMI<span className="brand-sub">FAST TRACK</span>
          </span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {[
            ["timer", "Fast Track Timer", Timer],
            ["dashboard", "KPI Dashboard", LayoutDashboard],
            ["history", "เคสที่ปิดแล้ว", FileText],
          ].map(([key, name, Icon]) => (
            <button
              key={String(key)}
              aria-label={String(name)}
              className={tab === key ? "nav active" : "nav"}
              onClick={() => {
                setTab(String(key));
                setSearch("");
              }}
            >
              {typeof Icon !== "string" && <Icon size={19} />}
              <span>{String(name)}</span>
              {key === "timer" && <b>{s?.cases.length || 0}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="read-only">
            <ShieldCheck size={18} />
            <span>
              HOSxP · Read only<small>อ่านข้อมูลจากระบบโรงพยาบาล</small>
            </span>
          </div>
          <button className="nav" onClick={() => open("settings")}>
            <Settings2 size={18} />
            ตั้งค่าระบบ
          </button>
          <div className="hospital-mini">
            ER / EMERGENCY DEPARTMENT
            <small>{s?.hospital || "STEMI Fast Track"}</small>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            ห้องฉุกเฉิน <span>/</span>{" "}
            <b>
              {tab === "timer"
                ? "Fast Track Timer"
                : tab === "dashboard"
                  ? "KPI Dashboard"
                  : "เคสที่ปิดแล้ว"}
            </b>
          </div>
          <div className="top-right">
            <span className={"connection " + (connected ? "" : "offline")}>
              <i />
              {connected ? "ซิงก์ข้อมูลแล้ว" : "ขาดการเชื่อมต่อ"}
            </span>
            <span className="clock">{thaiTime(now)}</span>
            <span className="avatar">ER</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">STEMI CARE COORDINATION</div>
              <h1>
                {tab === "timer"
                  ? "ทุกนาที มีความหมาย"
                  : tab === "dashboard"
                    ? "ภาพรวมคุณภาพการดูแล"
                    : "ทะเบียนเคส STEMI"}
              </h1>
              <p>
                {tab === "timer"
                  ? "ติดตามผู้ป่วยและประสานการดูแล Fast Track แบบเรียลไทม์"
                  : "ติดตามตัวชี้วัดและทบทวนผลการดูแลผู้ป่วย"}
              </p>
            </div>
            <div className="heading-actions">
              <button onClick={() => void sync()} aria-label="ซิงก์ข้อมูล">
                <RefreshCw size={16} />
              </button>
              {tab === "timer" && (
                <button className="primary" onClick={() => void openEr()}>
                  <Plus size={17} />
                  เลือกผู้ป่วยจาก HOSxP
                </button>
              )}
            </div>
          </div>
          {s?.demo && (
            <div className="demo-banner">
              <span>
                <span className="demo-dot" />
                โหมดตัวอย่าง
              </span>
              ข้อมูลผู้ป่วยสมมติ · ยังไม่ได้เชื่อมต่อ HOSxP จริง
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="ปิดข้อความ">
                <X size={16} />
              </button>
            </div>
          )}
          {!s ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h2>กำลังเชื่อมต่อระบบ</h2>
              <button onClick={() => void sync()}>ลองใหม่</button>
            </div>
          ) : tab === "timer" ? (
            <>
              <div className="case-tabs">
                {s.cases.map((c) => (
                  <button
                    key={c.id}
                    className={
                      "case-tab " + (active?.id === c.id ? "selected" : "")
                    }
                    onClick={() => setSelected(c.id)}
                  >
                    <span className="patient-dot" />
                    <span>
                      <b>{c.label}</b>
                      <small>
                        HN {c.hn || "รอลงทะเบียน"} · Door{" "}
                        {duration(
                          (c.times.door_out.t ?? now ?? 0) -
                            (c.times.door_in.t ?? now ?? 0),
                        )}
                      </small>
                    </span>
                    {active?.id === c.id && (
                      <span className="live-pill">กำลังติดตาม</span>
                    )}
                  </button>
                ))}
                <button
                  className="new-case"
                  onClick={() => void addCase()}
                  disabled={busy}
                >
                  <Plus size={18} />
                  มาถึงก่อนลงทะเบียน
                </button>
              </div>
              {!active ? (
                <div className="empty">
                  <HeartPulse size={38} />
                  <h2>พร้อมรับผู้ป่วย Fast Track</h2>
                  <p>เลือกผู้ป่วยจาก HOSxP หรือเริ่มจับเวลาก่อนลงทะเบียน</p>
                </div>
              ) : (
                <>
                  <div className="patient-strip">
                    <div className="patient-icon">
                      <HeartPulse size={25} />
                    </div>
                    <div>
                      <h2>{active.label}</h2>
                      <p>
                        HN {active.hn || "—"} <span>·</span>{" "}
                        {active.patient?.sex || "ยังไม่ระบุเพศ"} <span>·</span>{" "}
                        {active.patient?.age ?? "—"} ปี <span>·</span>{" "}
                        {active.patient?.pttype || "รอลงทะเบียน"}
                      </p>
                    </div>
                    <div className="patient-strip-right">
                      <span className="diagnosis">
                        {active.patient?.dx || "รอยืนยันการวินิจฉัย"}
                      </span>
                      <span className="tag">
                        {active.vn ? "HOSxP" : "บันทึกเอง"}
                      </span>
                    </div>
                  </div>
                  {active.notes.some((n) => n.important) && (
                    <div className="error-banner">
                      <AlertTriangle size={18} />
                      {active.notes
                        .filter((n) => n.important)
                        .map((n) => n.text)
                        .join(" · ")}
                    </div>
                  )}
                  <div className="timers">
                    <div className="timer-card door">
                      <div className="timer-top">
                        <span>
                          <Clock3 size={17} />
                          DOOR → NOW
                        </span>
                        <span className="live-indicator">
                          <i />
                          LIVE
                        </span>
                      </div>
                      <div className="timer-number">
                        {duration(
                          (active.times.door_out.t ?? now ?? 0) -
                            (active.times.door_in.t ?? now ?? 0),
                        )}
                      </div>
                      <div className="timer-footer">
                        {active.times.door_out.t
                          ? "สิ้นสุดที่ Door-out"
                          : "เริ่มรับผู้ป่วย"}{" "}
                        <b>{thaiTime(active.times.door_in.t)}</b>
                        <button
                          onClick={() => {
                            const v = prompt(
                              "Door-in วันที่และเวลา (YYYY-MM-DDTHH:mm:ss)",
                              inputTime(active.times.door_in.t),
                            );
                            if (v)
                              void op({
                                op: "stamp",
                                id: active.id,
                                key: "door_in",
                                t: parseTime(v),
                              });
                          }}
                        >
                          แก้ไขเวลา
                        </button>
                      </div>
                    </div>
                    <div className="timer-card onset">
                      <div className="timer-top">
                        <span>
                          <Activity size={17} />
                          ONSET → NOW
                        </span>
                        <span className="tag">เริ่มมีอาการ</span>
                      </div>
                      <div className="timer-number">
                        {active.onset && !active.onsetUnknown
                          ? duration((now ?? 0) - active.onset)
                          : "— : — : —"}
                      </div>
                      <div className="timer-footer">
                        {active.onsetUnknown
                          ? "ไม่ทราบเวลาเริ่มอาการ"
                          : active.onset
                            ? thaiTime(active.onset, true)
                            : "ระบุเวลาเริ่มอาการในข้อมูลผู้ป่วย"}
                        <span className="muted">แสดงเวลาที่ผ่านไป</span>
                      </div>
                    </div>
                  </div>
                  <div className="metric-grid">
                    {(Object.keys(metricNames) as TargetKey[]).map((key) => {
                      const k = key as keyof typeof metricNames;
                      const value = metrics(active)[k],
                        done = value != null,
                        na = k === "needle" && active.sk === "no";
                      const elapsed = minutesSince(active.times.door_in.t, now);
                      const late = !na && (value ?? elapsed) > s.targets[k];
                      return (
                        <div
                          className={
                            "metric-card " +
                            (late ? "late" : done ? "complete" : "")
                          }
                          key={k}
                        >
                          <div className="metric-title">
                            {metricNames[k]}
                            <span
                              className={
                                "status-icon " + (done && !late ? "good" : "")
                              }
                            >
                              {done ? (
                                <Check size={14} />
                              ) : (
                                <Clock3 size={14} />
                              )}
                            </span>
                          </div>
                          <div className="metric-value">
                            {na
                              ? "N/A"
                              : done
                                ? value.toFixed(1)
                                : Math.floor(elapsed)}
                            <small>{na ? "ไม่ให้ SK" : "นาที"}</small>
                          </div>
                          <div className="progress-track">
                            <div
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    ((value ?? elapsed) / s.targets[k]) * 100,
                                  ) + "%",
                              }}
                            />
                          </div>
                          <div className="metric-caption">
                            <span>เป้า ≤ {s.targets[k]} นาที</span>
                            <b>
                              {na
                                ? "ไม่นำมาคิด"
                                : done
                                  ? late
                                    ? "เกินเป้า"
                                    : "ผ่านเป้า"
                                  : late
                                    ? "เกินเป้า · รอดำเนินการ"
                                    : "กำลังติดตาม"}
                            </b>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="care-grid">
                    <section className="panel patient-panel">
                      <div className="panel-heading">
                        <h2>ข้อมูลผู้ป่วย</h2>
                        <span className="tag">PATIENT DETAILS</span>
                      </div>
                      <div className="panel-body">
                        <div className="detail-block">
                          <label>
                            อาการสำคัญ <span className="source">HOSxP</span>
                          </label>
                          <p>{active.patient?.cc || "ยังไม่มีข้อมูล"}</p>
                        </div>
                        <div className="detail-block">
                          <label>ประวัติปัจจุบัน / โรคประจำตัว</label>
                          <p>{active.patient?.hpi || "—"}</p>
                          <small>{active.patient?.pmh || "—"}</small>
                        </div>
                        {!active.vn && (
                          <>
                            <EditField
                              label="ชื่อ / ป้ายกำกับ"
                              value={active.label}
                              save={(v) => setField(active, "label", v)}
                            />
                            <EditField
                              label="HN"
                              value={active.hn}
                              save={(v) => setField(active, "hn", v)}
                            />
                            <button
                              className="full"
                              onClick={() => void openEr(true)}
                            >
                              ผูกกับ VN ใน HOSxP
                            </button>
                          </>
                        )}
                        <label className="field">
                          เวลาเริ่มมีอาการ (Onset)
                          <input
                            type="datetime-local"
                            step="1"
                            key={active.id + "onset" + active.onset}
                            defaultValue={inputTime(active.onset)}
                            onBlur={(e) => {
                              const v = parseTime(e.target.value);
                              if (v !== active.onset)
                                void setField(active, "onset", v);
                            }}
                          />
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={active.onsetUnknown}
                            onChange={(e) =>
                              void setField(
                                active,
                                "onsetUnknown",
                                e.target.checked,
                              )
                            }
                          />
                          ไม่ทราบเวลาเริ่มอาการ
                        </label>
                        <label className="field">
                          มาโดย
                          <select
                            value={active.arrive}
                            onChange={(e) =>
                              void setField(active, "arrive", e.target.value)
                            }
                          >
                            {["มาเอง", "EMS 1669", "รับส่งต่อ", "อื่น ๆ"].map(
                              (v) => (
                                <option key={v}>{v}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="field">
                          แนวทางการรักษา
                          <select
                            value={active.path}
                            onChange={(e) =>
                              void setField(active, "path", e.target.value)
                            }
                          >
                            <option value="both">พิจารณา Lytic / PCI</option>
                            <option value="lytic">Fibrinolysis</option>
                            <option value="pci">Primary PCI</option>
                            <option value="medical">Medical treatment</option>
                          </select>
                        </label>
                        <EditField
                          label="โรงพยาบาลปลายทาง"
                          value={active.dest}
                          save={(v) => setField(active, "dest", v)}
                          list={s.hospitals}
                        />
                        <div className="detail-block">
                          <label>การให้ยาละลายลิ่มเลือด</label>
                          <div className="segmented">
                            {[
                              ["", "รอประเมิน"],
                              ["yes", "ให้"],
                              ["no", "ไม่ให้"],
                            ].map(([v, n]) => (
                              <button
                                key={v}
                                className={active.sk === v ? "chosen" : ""}
                                onClick={() => void setField(active, "sk", v)}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          {active.sk === "no" && (
                            <EditField
                              label="เหตุผลที่ไม่ให้ SK"
                              value={active.skReason}
                              save={(v) => setField(active, "skReason", v)}
                            />
                          )}
                        </div>
                      </div>
                    </section>
                    <section className="panel timeline-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>ลำดับการดูแล Fast Track</h2>
                          <p>บันทึกเวลาจริงในแต่ละขั้นตอน</p>
                        </div>
                        <span className="tag">
                          {steps.filter(([k]) => active.times[k].t).length} / 10
                          ขั้นตอน
                        </span>
                      </div>
                      <div className="timeline">
                        {steps.map(([key, name], i) => {
                          const t = active.times[key],
                            target =
                              key === "door_out"
                                ? s.targets.dido
                                : s.targets[key],
                            elapsed = minutesSince(
                              active.times.door_in.t,
                              t.t ?? now,
                            ),
                            skip = key === "needle" && active.sk === "no",
                            late = !skip && elapsed > target;
                          return (
                            <div
                              className={
                                "timeline-row " +
                                (t.t ? "done " : "") +
                                (skip ? "skipped " : late ? "overdue" : "")
                              }
                              key={key}
                            >
                              <div className="step-circle">
                                {t.t ? (
                                  <Check size={14} />
                                ) : (
                                  String(i + 1).padStart(2, "0")
                                )}
                              </div>
                              <div className="step-info">
                                <b>{name}</b>
                                <small>
                                  {skip
                                    ? "ไม่ให้ SK · " + active.skReason
                                    : `เป้า ≤ ${target} นาที`}
                                  {t.src && (
                                    <span className="source">
                                      {t.src === "hosxp" ? "HOSxP" : "กดเอง"}
                                    </span>
                                  )}
                                </small>
                                {t.hosxp && t.src === "manual" && (
                                  <small>HOSxP {thaiTime(t.hosxp)}</small>
                                )}
                                {key === "needle" && t.hosxp && (
                                  <small>
                                    เวลาสั่งยา {thaiTime(t.hosxp)} (อ้างอิง)
                                  </small>
                                )}
                              </div>
                              <div className="step-time">
                                {skip ? (
                                  <span className="muted">N/A</span>
                                ) : t.t ? (
                                  <>
                                    <b>{thaiTime(t.t)}</b>
                                    <small
                                      className={late ? "danger" : "success"}
                                    >
                                      {elapsed.toFixed(1)} นาที ·{" "}
                                      {late ? "เกินเป้า" : "ผ่านเป้า"}
                                    </small>
                                  </>
                                ) : (
                                  <small className={late ? "danger" : "muted"}>
                                    {late
                                      ? `เลยเป้า ${Math.ceil(elapsed - target)} นาที`
                                      : `เหลือ ${Math.ceil(target - elapsed)} นาที`}
                                  </small>
                                )}
                              </div>
                              <div className="step-actions">
                                <button
                                  disabled={busy || skip || !connected}
                                  className={
                                    t.t ? "icon-button" : "stamp-button"
                                  }
                                  onClick={() =>
                                    void op({
                                      op: "stamp",
                                      id: active.id,
                                      key,
                                      t: Date.now() + offset.current,
                                    })
                                  }
                                >
                                  {t.t ? (
                                    <RefreshCw size={14} />
                                  ) : (
                                    <>
                                      <Plus size={13} />
                                      ตอนนี้
                                    </>
                                  )}
                                </button>
                                <button
                                  className="icon-button"
                                  title="แก้ไขเวลา"
                                  disabled={busy || skip}
                                  onClick={() => {
                                    const v = prompt(
                                      "วันที่และเวลา (YYYY-MM-DDTHH:mm:ss) · เว้นว่างเพื่อคืนค่าจาก HOSxP",
                                      inputTime(t.t),
                                    );
                                    if (v !== null)
                                      void op({
                                        op: "stamp",
                                        id: active.id,
                                        key,
                                        t: parseTime(v),
                                      });
                                  }}
                                >
                                  <Settings2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                  <div className="bottom-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>ผลตรวจทางห้องปฏิบัติการ</h2>
                        <span className="source">HOSxP</span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>รายการ</th>
                              <th>ผลตรวจ</th>
                              <th>ส่งตรวจ</th>
                              <th>รายงานผล</th>
                            </tr>
                          </thead>
                          <tbody>
                            {active.labs.length ? (
                              active.labs.map((l) => (
                                <tr key={l.name}>
                                  <td>
                                    <b>{l.name}</b>
                                  </td>
                                  <td>
                                    {l.result || (
                                      <span className="waiting">รอผล</span>
                                    )}
                                  </td>
                                  <td>{thaiTime(l.ordered)}</td>
                                  <td>{thaiTime(l.reported)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4}>ยังไม่มีรายการ Lab</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>ผลอ่าน EKG</h2>
                        <button onClick={() => open("ekg", active)}>
                          <Activity size={15} />
                          อ่าน EKG
                        </button>
                      </div>
                      <div className="panel-body">
                        {active.ekgs.length ? (
                          active.ekgs.map((e, i) => (
                            <div key={e.t} className="ekg-result">
                              <p>{e.impression.join("; ")}</p>
                              <small>
                                {e.model} · {thaiTime(e.t)}
                              </small>
                              <p className={e.confirmed ? "success" : "danger"}>
                                {e.confirmed
                                  ? "แพทย์ยืนยันแล้ว"
                                  : "รอแพทย์ยืนยันผล"}
                              </p>
                              {!e.confirmed && (
                                <button
                                  onClick={() =>
                                    void op({
                                      op: "confirmEkg",
                                      id: active.id,
                                      index: i,
                                    })
                                  }
                                >
                                  แพทย์ยืนยันผล
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="muted">
                            แนบภาพ / PDF และอ่านผลด้วย AI ภายในโรงพยาบาล
                            <br />
                            ผล AI ต้องได้รับการยืนยันจากแพทย์
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                  <section className="panel notes-panel">
                    <div className="panel-heading">
                      <h2>อาการเปลี่ยนแปลง / หมายเหตุ</h2>
                      <span className="tag">CARE NOTES</span>
                    </div>
                    <div className="panel-body">
                      {active.notes.length > 0 && (
                        <div className="notes-list">
                          {active.notes.map((n) => (
                            <div
                              className={n.important ? "important-note" : ""}
                              key={n.id}
                            >
                              <time>{thaiTime(n.t)}</time>
                              <span>
                                {n.important && <AlertTriangle size={14} />}{" "}
                                {n.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <form
                        className="note-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await op({
                              op: "note",
                              id: active.id,
                              text: note,
                              important,
                            })
                          ) {
                            setNote("");
                            setImportant(false);
                          }
                        }}
                      >
                        <input
                          placeholder="บันทึกอาการ การดูแล หรือข้อมูลสำคัญ…"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={1000}
                          required
                        />
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={important}
                            onChange={(e) => setImportant(e.target.checked)}
                          />
                          สำคัญ
                        </label>
                        <button disabled={busy} type="submit">
                          <Plus size={16} />
                          บันทึก
                        </button>
                      </form>
                    </div>
                  </section>
                  <section className="case-footer">
                    <div>
                      <h3>สรุปเคส / เอกสาร</h3>
                      <p>บันทึกข้อมูลเพื่อส่งต่อและทบทวนคุณภาพการดูแล</p>
                    </div>
                    <div className="footer-actions">
                      <a className="button" href={exportUrl("docx", active)}>
                        <Download size={15} />
                        Word
                      </a>
                      <button onClick={() => open("summary", active)}>
                        สรุป LINE / HOSxP
                      </button>
                      <button onClick={() => open("refer", active)}>
                        ใบ Refer
                      </button>
                      <button onClick={() => open("outcome", active)}>
                        ผลหลัง Refer
                      </button>
                      <button onClick={() => open("rca", active)}>RCA</button>
                      <button
                        className="primary"
                        disabled={busy || !connected}
                        onClick={async () => {
                          if (
                            confirm("ปิดเคสและเก็บเข้าทะเบียนเคสที่ปิดแล้ว?")
                          ) {
                            if (await op({ op: "close", id: active.id })) {
                              setSelected("");
                              open("rca", active);
                            }
                          }
                        }}
                      >
                        ปิดเคส <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                </>
              )}
            </>
          ) : (
            <>
              <div className="filter-bar">
                <label>
                  ตั้งแต่
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  ถึง
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <label>
                  แนวทาง
                  <select
                    value={pathFilter}
                    onChange={(e) => setPathFilter(e.target.value)}
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="lytic">Fibrinolysis</option>
                    <option value="pci">Primary PCI</option>
                    <option value="both">Lytic / PCI</option>
                    <option value="medical">Medical</option>
                  </select>
                </label>
                <div className="filter-actions">
                  <a className="button" href={exportUrl("xlsx")}>
                    <Download size={15} />
                    Excel
                  </a>
                  <a className="button" href={exportUrl("csv")}>
                    CSV
                  </a>
                  <button onClick={() => window.print()}>พิมพ์ / PDF</button>
                </div>
              </div>
              {tab === "dashboard" && (
                <Dashboard records={records} targets={s.targets} />
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    ทะเบียนเคส <span className="count">{records.length}</span>
                  </h2>
                  <div className="search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ค้นหาชื่อ / HN / VN"
                    />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ผู้ป่วย / HN</th>
                        <th>Door-in</th>
                        <th>EKG</th>
                        <th>Needle</th>
                        <th>DIDO</th>
                        <th>RCA</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length ? (
                        records.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <b>{c.label}</b>
                              <small className="block">HN {c.hn}</small>
                            </td>
                            <td>{thaiTime(c.times.door_in.t, true)}</td>
                            {(["ekg", "needle", "dido"] as const).map((k) => (
                              <td
                                key={k}
                                className={
                                  metrics(c)[k] != null &&
                                  metrics(c)[k]! > s.targets[k]
                                    ? "danger"
                                    : "success"
                                }
                              >
                                {metrics(c)[k]?.toFixed(1) ?? "—"}{" "}
                                <small>นาที</small>
                              </td>
                            ))}
                            <td>
                              <button onClick={() => open("rca", c)}>
                                {c.rca?.status === "done"
                                  ? "RCA เสร็จ"
                                  : c.rca
                                    ? "RCA ร่าง"
                                    : "ทำ RCA"}
                              </button>
                            </td>
                            <td>
                              <div className="row-actions">
                                <a href={exportUrl("docx", c)}>Word</a>
                                <button onClick={() => open("refer", c)}>
                                  Refer
                                </button>
                                <button onClick={() => open("outcome", c)}>
                                  ผลหลังส่งต่อ
                                </button>
                                <button onClick={() => open("summary", c)}>
                                  สรุป
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("เปิดเคสนี้กลับมาติดตาม?"))
                                      void op({ op: "reopen", id: c.id });
                                  }}
                                >
                                  เปิดเคส
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty-cell">
                            ยังไม่มีเคสที่ปิดในช่วงเวลานี้
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              {s.sheetEnabled && (
                <div className="sheet-status">
                  Google Sheet · รอส่ง {s.pending.length} เคส{" "}
                  {s.gsError && <span className="danger">{s.gsError}</span>}
                  <button onClick={() => void op({ op: "resend" })}>
                    ส่งซ้ำ
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              <ShieldCheck size={13} />
              HOSxP อ่านอย่างเดียว · ข้อมูลบันทึกบนเซิร์ฟเวอร์ของโรงพยาบาล
            </span>
            <span>STEMI FAST TRACK · NEXT.JS</span>
          </footer>
        </main>
      </div>
      {busy && (
        <div className="saving">
          <LoaderCircle size={15} className="spin" />
          กำลังบันทึก…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <section
            className={"modal " + (modal === "ekg" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label="แบบฟอร์ม"
          >
            <div className="modal-heading">
              <h2>
                {
                  {
                    er: linking ? "ผูกกับ VN" : "เลือกผู้ป่วย ER",
                    refer: "ใบส่งต่อ STEMI",
                    outcome: "ผลการรักษาหลังส่งต่อ",
                    rca: "Root Cause Analysis",
                    summary: "สรุปส่ง LINE / HOSxP",
                    settings: "ตั้งค่าระบบ",
                    ekg: "อ่าน EKG",
                  }[modal]
                }
              </h2>
              <button aria-label="ปิดหน้าต่าง" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {modal === "er" ? (
              <div className="modal-body">
                <input
                  className="full"
                  placeholder="ค้นหาชื่อ / HN"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="er-list">
                  {patients
                    .filter((p) => (p.name + p.hn).includes(search))
                    .map((p) => (
                      <button
                        key={p.vn}
                        disabled={
                          busy ||
                          [...(s?.cases || []), ...(s?.log || [])].some(
                            (c) => c.vn === p.vn,
                          )
                        }
                        onClick={async () => {
                          if (
                            await op(
                              linking
                                ? { op: "link", id: modalId, vn: p.vn }
                                : { op: "pin", vn: p.vn },
                            )
                          ) {
                            setModal(null);
                            setSelected("");
                          }
                        }}
                      >
                        <span>
                          <b>{p.name}</b>
                          <small>
                            HN {p.hn} · {p.age} ปี · {p.cc}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    ))}
                </div>
              </div>
            ) : modal === "settings" ? (
              <Settings
                targets={s?.targets || defaults}
                save={async (value) => {
                  if (await op({ op: "targets", value })) setModal(null);
                }}
              />
            ) : modal === "summary" && mc ? (
              <div className="modal-body">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={hide}
                    onChange={(e) => setHide(e.target.checked)}
                  />
                  ซ่อนชื่อและ HN
                </label>
                <textarea rows={19} readOnly value={summary(mc, hide)} />
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(summary(mc, hide));
                      setToast("คัดลอกแล้ว");
                    } catch {
                      setError("คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วคัดลอก");
                    }
                  }}
                >
                  คัดลอกข้อความ
                </button>
              </div>
            ) : modal === "ekg" && mc ? (
              <iframe
                ref={frame}
                title="เครื่องมืออ่าน EKG"
                src={
                  "/tools/ekg.html?" +
                  new URLSearchParams({
                    case: mc.id,
                    age: String(mc.patient?.age || ""),
                    sex: mc.patient?.sex === "ชาย" ? "male" : "female",
                    hx: mc.patient?.cc || "",
                  })
                }
              />
            ) : modal === "rca" && mc ? (
              <RcaForm
                key={mc.id}
                c={mc}
                save={async (value) => {
                  const ok = await op({ op: "rca", id: mc.id, value });
                  if (ok) setModal(null);
                  return ok;
                }}
                exportUrl={exportUrl}
              />
            ) : (modal === "refer" || modal === "outcome") && mc ? (
              <RecordForm
                key={mc.id + modal}
                kind={modal}
                c={mc}
                save={async (value) => {
                  const ok = await op({ op: modal, id: mc.id, value });
                  if (ok) setModal(null);
                  return ok;
                }}
                exportUrl={exportUrl}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
function minutesSince(a: number | null, b: number | null) {
  return a != null && b != null ? Math.max(0, (b - a) / 60000) : 0;
}
function EditField({
  label,
  value,
  save,
  list,
}: {
  label: string;
  value: string;
  save: (v: string) => unknown;
  list?: string[];
}) {
  return (
    <label className="field">
      {label}
      <input
        key={value}
        defaultValue={value}
        list={list ? "destinations" : undefined}
        onBlur={(e) => {
          if (e.target.value !== value) save(e.target.value);
        }}
      />
      {list && (
        <datalist id="destinations">
          {list.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </datalist>
      )}
    </label>
  );
}
function Settings({
  targets,
  save,
}: {
  targets: Snapshot["targets"];
  save: (v: Snapshot["targets"]) => unknown;
}) {
  const [value, setValue] = useState({ ...targets }),
    [diag, setDiag] = useState("");
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <p>เป้าหมายเวลานับจาก Door-in (นาที) · ตั้งตามแนวทางที่โรงพยาบาลกำหนด</p>
      <div className="form-grid">
        {Object.entries(targets).map(([k]) => (
          <label className="field" key={k}>
            {k}
            <input
              type="number"
              min={1}
              max={600}
              required
              value={value[k as TargetKey]}
              onChange={(e) =>
                setValue({ ...value, [k]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          onClick={async () => {
            try {
              setDiag(JSON.stringify(await request("diag"), null, 2));
            } catch (e) {
              setDiag((e as Error).message);
            }
          }}
        >
          ตรวจการเชื่อมต่อ HOSxP
        </button>
        <button className="primary">บันทึกเป้าหมาย</button>
      </div>
      {diag && <pre>{diag}</pre>}
      <p className="muted">
        การเชื่อมต่อ HOSxP และ Google Sheet ตั้งใน .env.local ฝั่งเซิร์ฟเวอร์
      </p>
    </form>
  );
}
const referFields: Record<string, string> = {
  dest: "โรงพยาบาลปลายทาง",
  reason: "เหตุผลส่งต่อ",
  wall: "ตำแหน่ง STEMI",
  killip: "Killip class",
  allergy: "ประวัติแพ้ยา",
  ekg_text: "ผล EKG",
  meds: "ยา / ขนาด / เวลาให้",
  lytic_result: "ผลหลังให้ยา",
  bp: "BP",
  hr: "HR",
  rr: "RR",
  spo2: "SpO₂",
  gcs: "GCS",
  dtx: "DTX",
  doctor: "แพทย์ผู้ส่ง",
  nurse: "พยาบาลผู้ส่ง",
  phone: "โทรศัพท์",
  prealert: "Pre-alert",
  note: "หมายเหตุ",
};
const outcomeFields: Record<string, string> = {
  hosp: "โรงพยาบาลปลายทาง",
  fu_date: "วันที่ติดตาม",
  final_dx: "วินิจฉัยสุดท้าย",
  icd: "ICD-10",
  tx: "การรักษา (PCI / CAG / CABG / ยา)",
  cath: "วันเวลาทำ CAG / PCI",
  vessel: "หลอดเลือดที่ตีบ",
  stent: "Stent",
  lvef: "LVEF",
  complication: "ภาวะแทรกซ้อน",
  result: "ผลการรักษา / สถานะ",
  dc_date: "วันจำหน่าย",
  los: "จำนวนวันนอน",
  by: "ผู้ติดตาม",
  note: "หมายเหตุ",
};
function RecordForm({
  kind,
  c,
  save,
  exportUrl,
}: {
  kind: "refer" | "outcome";
  c: Case;
  save: (v: Record<string, string>) => Promise<boolean>;
  exportUrl: (a: string, c: Case, k?: string) => string;
}) {
  const [value, setValue] = useState<Record<string, string>>({
    ...(kind === "refer"
      ? { dest: c.dest, ...c.refer }
      : { hosp: c.dest, ...c.outcome }),
  });
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="modal-body"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await save(value);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p>
        {c.label} · HN {c.hn}
      </p>
      <div className="form-grid">
        {Object.entries(kind === "refer" ? referFields : outcomeFields).map(
          ([k, n]) => (
            <label className="field" key={k}>
              {n}
              {["meds", "note", "ekg_text", "complication"].includes(k) ? (
                <textarea
                  rows={3}
                  value={value[k] || ""}
                  onChange={(e) => setValue({ ...value, [k]: e.target.value })}
                  maxLength={4000}
                />
              ) : (
                <input
                  type={["fu_date", "dc_date"].includes(k) ? "date" : "text"}
                  value={value[k] || ""}
                  onChange={(e) => setValue({ ...value, [k]: e.target.value })}
                  maxLength={4000}
                />
              )}
            </label>
          ),
        )}
      </div>
      <div className="modal-actions">
        {kind === "refer" && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (await save(value))
                  window.location.href = exportUrl("docx", c, "refer");
              } finally {
                setSaving(false);
              }
            }}
          >
            บันทึกและดาวน์โหลด Word
          </button>
        )}
        <button disabled={saving} className="primary">
          บันทึก
        </button>
      </div>
    </form>
  );
}
function RcaForm({
  c,
  save,
  exportUrl,
}: {
  c: Case;
  save: (r: Rca) => Promise<boolean>;
  exportUrl: (a: string, c: Case, k?: string) => string;
}) {
  const [r, setR] = useState<Rca>(
    c.rca || {
      status: "draft",
      severity: "",
      date: thaiDate(Date.now()),
      summary: "",
      root: "",
      team: "",
      cdp: "",
      voices: "",
      factors: { t0: "", t1: "", t2: "", t3: "", t4: "", t5: "" },
      whys: ["", "", "", "", ""],
      actions: [],
    },
  );
  const [saving, setSaving] = useState(false);
  const field = (
    key: "summary" | "root" | "team" | "cdp" | "voices",
    label: string,
  ) => (
    <label className="field">
      {label}
      <textarea
        rows={3}
        value={r[key]}
        maxLength={4000}
        onChange={(e) => setR({ ...r, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="modal-body"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await save(r);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p>ทบทวนเคส · {thaiTime(c.times.door_in.t, true)}</p>
      <div className="form-grid">
        <label className="field">
          วันที่ทบทวน
          <input
            type="date"
            value={r.date}
            onChange={(e) => setR({ ...r, date: e.target.value })}
          />
        </label>
        <label className="field">
          ระดับความรุนแรง
          <select
            value={r.severity}
            onChange={(e) => setR({ ...r, severity: e.target.value })}
          >
            <option value="">เลือก</option>
            {"ABCDEFGHI".split("").map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      {field("summary", "1. สรุปเหตุการณ์")}
      <details>
        <summary>2. Timeline จากระบบ</summary>
        {steps.map(([k, n]) => (
          <p key={k}>
            {n}: {thaiTime(c.times[k].t)}
          </p>
        ))}
      </details>
      {field("cdp", "3. Potential Change / Care Delivery Problems")}
      {field("voices", "Voice of Staff")}
      <h3>4. Contributory Factors</h3>
      {[
        "Active Errors",
        "1st Tier · บุคลากร / ผู้ป่วย",
        "2nd Tier · งาน / ทีม",
        "3rd Tier · สภาพแวดล้อม",
        "4th Tier · องค์กร",
        "5th Tier · ระบบภายนอก",
      ].map((n, i) => (
        <label className="field" key={n}>
          {n}
          <textarea
            rows={2}
            value={r.factors["t" + i] || ""}
            maxLength={4000}
            onChange={(e) =>
              setR({
                ...r,
                factors: { ...r.factors, ["t" + i]: e.target.value },
              })
            }
          />
        </label>
      ))}
      <h3>5. Five Whys</h3>
      {r.whys.map((w, i) => (
        <label className="field" key={i}>
          Why {i + 1}
          <input
            value={w}
            onChange={(e) =>
              setR({
                ...r,
                whys: r.whys.map((v, j) => (j === i ? e.target.value : v)),
              })
            }
            maxLength={4000}
          />
        </label>
      ))}
      {field("root", "สาเหตุราก")}
      <h3>6. มาตรการแก้ไข</h3>
      {r.actions.map((a, i) => (
        <div className="action-card" key={i}>
          <label className="field">
            มาตรการ
            <input
              value={a.text}
              onChange={(e) =>
                setR({
                  ...r,
                  actions: r.actions.map((v, j) =>
                    j === i ? { ...v, text: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          <div className="form-grid">
            {(["strength", "owner", "due", "status"] as const).map((k) => (
              <label className="field" key={k}>
                {
                  {
                    strength: "ความเข้มแข็ง",
                    owner: "ผู้รับผิดชอบ",
                    due: "กำหนดเสร็จ",
                    status: "สถานะ",
                  }[k]
                }
                {k === "strength" || k === "status" ? (
                  <select
                    value={a[k]}
                    onChange={(e) =>
                      setR({
                        ...r,
                        actions: r.actions.map((v, j) =>
                          j === i ? { ...v, [k]: e.target.value } : v,
                        ),
                      })
                    }
                  >
                    {(k === "strength"
                      ? ["strong", "intermediate", "weak"]
                      : ["open", "done"]
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={k === "due" ? "date" : "text"}
                    value={a[k]}
                    onChange={(e) =>
                      setR({
                        ...r,
                        actions: r.actions.map((v, j) =>
                          j === i ? { ...v, [k]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setR({ ...r, actions: r.actions.filter((_, j) => j !== i) })
            }
          >
            ลบมาตรการ
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setR({
            ...r,
            actions: [
              ...r.actions,
              {
                text: "",
                strength: "strong",
                owner: "",
                due: "",
                status: "open",
              },
            ],
          })
        }
      >
        <Plus size={16} />
        เพิ่มมาตรการ
      </button>
      {!r.actions.some((a) => a.strength === "strong") && (
        <p className="danger">ยังไม่มีมาตรการระดับ Strong</p>
      )}
      {field("team", "7. ทีมทบทวน")}
      <label className="field">
        สถานะ
        <select
          value={r.status}
          onChange={(e) =>
            setR({ ...r, status: e.target.value as Rca["status"] })
          }
        >
          <option value="draft">ฉบับร่าง</option>
          <option value="done">เสร็จสิ้น</option>
        </select>
      </label>
      <div className="modal-actions">
        <button
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              if (await save(r))
                window.location.href = exportUrl("docx", c, "rca");
            } finally {
              setSaving(false);
            }
          }}
        >
          Word
        </button>
        <button
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              if (await save(r)) window.location.href = exportUrl("pptx", c);
            } finally {
              setSaving(false);
            }
          }}
        >
          PowerPoint
        </button>
        <button disabled={saving} className="primary">
          บันทึก RCA
        </button>
      </div>
    </form>
  );
}
function Dashboard({
  records,
  targets,
}: {
  records: Case[];
  targets: Snapshot["targets"];
}) {
  const stats = (k: keyof typeof metricNames) => {
    const vs = records
      .map((c) => metrics(c)[k])
      .filter((v): v is number => v != null && v >= 0)
      .sort((a, b) => a - b);
    return {
      count: vs.length,
      rate: vs.length
        ? (vs.filter((v) => v <= targets[k]).length / vs.length) * 100
        : null,
      median: vs.length
        ? (vs[Math.floor((vs.length - 1) / 2)] +
            vs[Math.ceil((vs.length - 1) / 2)]) /
          2
        : null,
    };
  };
  const months = [
    ...new Set(
      records.map((c) => thaiDate(c.times.door_in.t ?? c.created).slice(0, 7)),
    ),
  ].sort();
  return (
    <>
      <div className="dashboard-total">
        <span>
          เคสทั้งหมด <b>{records.length}</b>
        </span>
        <span>
          RCA เสร็จ{" "}
          <b>{records.filter((c) => c.rca?.status === "done").length}</b>
        </span>
        <span>
          มาตรการค้าง{" "}
          <b>
            {records.reduce(
              (n, c) =>
                n +
                (c.rca?.actions.filter((a) => a.status !== "done").length || 0),
              0,
            )}
          </b>
        </span>
      </div>
      <div className="metric-grid">
        {(Object.keys(metricNames) as (keyof typeof metricNames)[]).map((k) => {
          const st = stats(k);
          return (
            <div className="metric-card" key={k}>
              <div className="metric-title">{metricNames[k]}</div>
              <div className="metric-value">
                {st.rate?.toFixed(0) ?? "—"}
                <small>% ผ่านเป้า</small>
              </div>
              <div className="metric-caption">
                Median {st.median?.toFixed(1) ?? "—"} นาที · มีเวลาครบ{" "}
                {st.count} เคส
              </div>
            </div>
          );
        })}
      </div>
      <section className="panel monthly-panel">
        <div className="panel-heading">
          <h2>ร้อยละผ่านเป้ารายเดือน</h2>
          <span className="tag">DOOR → EKG</span>
        </div>
        <div className="panel-body">
          {months.length ? (
            months.map((month) => {
              const vs = records
                .filter((c) =>
                  thaiDate(c.times.door_in.t ?? c.created).startsWith(month),
                )
                .map((c) => metrics(c).ekg)
                .filter((v): v is number => v != null && v >= 0);
              const rate = vs.length
                ? (vs.filter((v) => v <= targets.ekg).length / vs.length) * 100
                : 0;
              return (
                <div className="chart-row" key={month}>
                  <span>{month}</span>
                  <div className="progress-track">
                    <div style={{ width: rate + "%" }} />
                  </div>
                  <b>{vs.length ? rate.toFixed(0) + "%" : "—"}</b>
                </div>
              );
            })
          ) : (
            <p className="muted">กราฟจะแสดงเมื่อมีเคสที่ปิดแล้ว</p>
          )}
        </div>
      </section>
      {records.some((c) => c.rca?.actions.length) && (
        <section className="panel monthly-panel">
          <div className="panel-heading">
            <h2>มาตรการที่ยังไม่เสร็จ</h2>
          </div>
          <div className="panel-body">
            {records.flatMap((c) =>
              (c.rca?.actions || [])
                .filter((a) => a.status !== "done")
                .map((a, i) => (
                  <p
                    key={c.id + i}
                    className={
                      a.due && a.due < thaiDate(Date.now()) ? "danger" : ""
                    }
                  >
                    {a.text} · {a.owner || "ยังไม่ระบุผู้รับผิดชอบ"} ·{" "}
                    {a.due || "ยังไม่กำหนดวัน"}
                  </p>
                )),
            )}
          </div>
        </section>
      )}
    </>
  );
}
