"use client";
import { Download, Search } from "lucide-react";
import { dateRange, rcaLabel } from "@/lib/workflow";
import { metrics, thaiTime, type Case, type Snapshot } from "@/lib/model";
type Action = "rca" | "refer" | "outcome" | "summary";
export default function HistoryPanel({
  s,
  records,
  from,
  to,
  path,
  search,
  busy,
  setFrom,
  setTo,
  setPath,
  setSearch,
  exportUrl,
  onOpen,
  onClear,
  onResend,
  onReopen,
}: {
  s: Snapshot;
  records: Case[];
  from: string;
  to: string;
  path: string;
  search: string;
  busy: boolean;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  setPath: (v: string) => void;
  setSearch: (v: string) => void;
  exportUrl: (a: string, c?: Case, k?: string) => string;
  onOpen: (a: Action, c: Case) => void;
  onClear: () => void;
  onResend: () => void;
  onReopen: (c: Case) => void;
}) {
  const pending = records.filter((c) => s.pending.includes(c.id)).length;
  const print = () => {
    document.body.dataset.printScope = "history";
    try {
      window.print();
    } finally {
      delete document.body.dataset.printScope;
    }
  };
  return (
    <section className="history-section" aria-label="เคสที่ปิดแล้ว">
      <div className="history-heading">
        <div>
          <h2>
            เคสที่ปิดแล้ว <span className="count">{records.length}</span>
          </h2>
          <p>
            เก็บที่เซิร์ฟเวอร์ · ทุกจอเห็นตรงกัน ·{" "}
            {from ? from.split("-").reverse().join("/") : "ทุกวัน"} ถึง{" "}
            {to ? to.split("-").reverse().join("/") : "ปัจจุบัน"}
          </p>
        </div>
        <button
          className="danger"
          disabled={busy || !s.log.length}
          onClick={onClear}
        >
          ล้างประวัติ
        </button>
      </div>
      <div className="filter-bar">
        <label>
          ตั้งแต่
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          ถึง
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="date-presets" aria-label="เลือกช่วงวันที่">
          {(
            [
              ["month", "เดือนนี้"],
              ["previous", "เดือนที่แล้ว"],
              ["fiscal", "ปีงบนี้"],
              ["all", "ทั้งหมด"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => {
                const r = dateRange(kind);
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          แนวทาง
          <select value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="all">ทั้งหมด</option>
            <option value="lytic">Fibrinolysis</option>
            <option value="pci">Primary PCI</option>
            <option value="both">Lytic / PCI</option>
            <option value="medical">Medical</option>
          </select>
        </label>
        <div className="filter-actions">
          <a className="button" href={exportUrl("xlsx")}>
            <Download size={16} />
            Excel (.xlsx)
          </a>
          <button onClick={print}>PDF / พิมพ์</button>
          <a className="button" href={exportUrl("csv")}>
            CSV
          </a>
        </div>
      </div>
      <div className="history-summary" aria-label="สรุป KPI ตามช่วงวันที่">
        {(
          [
            ["ekg", "Door → EKG"],
            ["needle", "Door → Needle"],
            ["dido", "DIDO"],
            ["lab", "Door → ผล Troponin"],
          ] as const
        ).map(([key, label]) => {
          const values = records
            .map((c) => metrics(c)[key])
            .filter((v): v is number => v != null)
            .sort((a, b) => a - b);
          const median = values.length
            ? (values[Math.floor((values.length - 1) / 2)] +
                values[Math.ceil((values.length - 1) / 2)]) /
              2
            : null;
          const pass = values.filter((v) => v <= s.targets[key]).length;
          return (
            <span key={key}>
              <b>{label}</b>{" "}
              {median == null
                ? "—"
                : `${median.toFixed(1)} นาที · ผ่าน ${pass}/${values.length}`}
              <small>ค่ามัธยฐาน (median)</small>
            </span>
          );
        })}
      </div>
      <div className="sheet-status">
        <span>Google Sheet:</span>
        <b className={s.gsError ? "danger" : pending ? "muted" : "success"}>
          {!s.sheetEnabled
            ? "ยังไม่เปิดใช้งาน"
            : s.gsError
              ? "ส่งไม่สำเร็จ"
              : pending
                ? `รอส่ง ${pending} เคสในช่วงนี้`
                : "ส่งครบแล้วในช่วงนี้"}
        </b>
        {s.gsError && <span className="danger">{s.gsError}</span>}
        <button
          disabled={busy || !s.sheetEnabled || !records.length}
          onClick={onResend}
        >
          ส่งเคสช่วงวันที่นี้เข้า Google Sheet อีกครั้ง
        </button>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h3>ทะเบียนเคสตามช่วงวันที่</h3>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="ค้นหาเคสด้วยชื่อ HN หรือ VN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / HN / VN"
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>วันที่ / Door-in</th>
                <th>HN / ผู้ป่วย</th>
                <th>D2EKG</th>
                <th>D2N</th>
                <th>Door-out</th>
                <th>DIDO</th>
                <th>Door → ผล Troponin</th>
                <th>หมายเหตุ</th>
                <th>ผลหลังส่งต่อ / RCA</th>
                <th>เอกสาร / จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {records.length ? (
                records.map((c) => (
                  <tr key={c.id}>
                    <td>{thaiTime(c.times.door_in.t, true)}</td>
                    <td>
                      <b>{c.label}</b>
                      <small className="block">HN {c.hn || "—"}</small>
                    </td>
                    {(["ekg", "needle"] as const).map((k) => (
                      <td
                        key={k}
                        className={
                          metrics(c)[k] == null
                            ? "muted"
                            : metrics(c)[k]! > s.targets[k]
                              ? "danger"
                              : "success"
                        }
                      >
                        {metrics(c)[k]?.toFixed(1) ?? "—"} นาที
                      </td>
                    ))}
                    <td>{thaiTime(c.times.door_out.t, true)}</td>
                    {(["dido", "lab"] as const).map((k) => (
                      <td
                        key={k}
                        className={
                          metrics(c)[k] == null
                            ? "muted"
                            : metrics(c)[k]! > s.targets[k]
                              ? "danger"
                              : "success"
                        }
                      >
                        {metrics(c)[k]?.toFixed(1) ?? "—"} นาที
                      </td>
                    ))}
                    <td className="history-notes">
                      {c.notes.length
                        ? c.notes.map((n) => (
                            <p
                              key={n.id}
                              className={n.important ? "danger" : ""}
                            >
                              {thaiTime(n.t)} {n.important ? "สำคัญ · " : ""}
                              {n.text}
                            </p>
                          ))
                        : "—"}
                    </td>
                    <td>
                      <div className="history-followup">
                        <button
                          disabled={busy}
                          onClick={() => onOpen("outcome", c)}
                        >
                          {c.outcome.result ||
                            c.outcome.final_dx ||
                            "ผลหลังส่งต่อ"}
                        </button>
                        <button
                          disabled={busy}
                          className={
                            rcaLabel(c, s.targets) === "ต้องทำ RCA"
                              ? "danger"
                              : ""
                          }
                          onClick={() => onOpen("rca", c)}
                        >
                          {rcaLabel(c, s.targets)}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <a href={exportUrl("docx", c)}>Word</a>
                        <button onClick={() => onOpen("refer", c)}>
                          ใบส่งต่อ
                        </button>
                        <button onClick={() => onOpen("summary", c)}>
                          สรุป
                        </button>
                        <button disabled={busy} onClick={() => onReopen(c)}>
                          เปิดเคส
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    ยังไม่มีเคสที่ปิดในช่วงเวลานี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
