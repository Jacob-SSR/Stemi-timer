import { config } from "./config";
import { changeState, readState } from "./store";
import { metrics, thaiDate, thaiTime, type Case } from "./model";
import { randomUUID } from "node:crypto";
import { GoogleSheetsClient } from "./google-sheets";
// Preserve the original column names and idempotent case_id upsert.
export function sheetRow(c: Case) {
  const m = metrics(c);
  const t = (k: keyof Case["times"]) =>
    c.times[k].t
      ? new Date(c.times[k].t! + 7 * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ")
      : "";
  const row: Record<string, string | number | null> = {
    case_id: c.id,
    วันที่: thaiDate(c.times.door_in.t ?? c.created),
    HN: c.hn,
    VN: c.vn,
    ผู้ป่วย: config.sendPii ? c.label : "",
    สิทธิการรักษา: c.patient?.pttype || "",
    ที่อยู่: config.sendPii ? c.patient?.address || "" : "",
    ประวัติปัจจุบัน: config.sendPii ? c.patient?.hpi || "" : "",
    โรคประจำตัว: config.sendPii ? c.patient?.pmh || "" : "",
    แนวทาง: c.path,
    "Door-in": t("door_in"),
    EKG: t("ekg"),
    แพทย์วินิจฉัย: t("dx"),
    Needle: t("needle"),
    "Door-out": t("door_out"),
    ส่งต่อ: c.dest,
    "D2EKG (นาที)": m.ekg,
    "D2N (นาที)": m.needle,
    "DIDO (นาที)": m.dido,
    "Door→ผล Lab (นาที)": m.lab,
    "ผล Lab": c.labs.map((l) => `${l.name}: ${l.result || ""}`).join("; "),
    "อาการเปลี่ยนแปลง / หมายเหตุ": config.sendPii
      ? c.notes.map((n) => `${thaiTime(n.t)} ${n.text}`).join("; ")
      : "",
    "RCA สถานะ": c.rca?.status || "",
    ระดับความรุนแรง: c.rca?.severity || "",
    ปัจจัยที่เกี่ยวข้อง: c.rca ? Object.values(c.rca.factors).join("; ") : "",
    สาเหตุราก: config.sendPii ? c.rca?.root || "" : "",
    มาตรการแก้ไข: c.rca?.actions.map((a) => a.text).join("; ") || "",
    "วินิจฉัยสุดท้าย (ปลายทาง)": c.outcome.final_dx || "",
    การรักษาที่ปลายทาง: c.outcome.tx || "",
    ผลการรักษา: c.outcome.result || "",
    รายละเอียดผลหลังส่งต่อ: config.sendPii ? JSON.stringify(c.outcome) : "",
  };
  const targets = readState().targets;
  for (const [key, col] of [
    ["ekg", "D2EKG ผ่านเป้า"],
    ["needle", "D2N ผ่านเป้า"],
    ["dido", "DIDO ผ่านเป้า"],
  ] as const)
    row[col] =
      m[key] == null ? "" : m[key]! <= targets[key] ? "ผ่าน" : "ไม่ผ่าน";
  return row;
}
const client = new GoogleSheetsClient({
  email: config.sheetEmail,
  privateKey: config.sheetPrivateKey,
  id: config.sheetId,
});
let flushing = false;
export async function flushSheets(force = false) {
  if (!config.sheetEnabled || flushing) return;
  flushing = true;
  const lease = randomUUID();
  try {
    const job = changeState((s) => {
      if (
        !s.pending.length ||
        (s.gsLease && s.gsLease.until > Date.now()) ||
        (!force && Date.now() - s.gsLastTry < 60000)
      )
        return null;
      s.gsLastTry = Date.now();
      s.gsLease = { token: lease, until: Date.now() + 120000 };
      return s.log.filter((c) => s.pending.includes(c.id)).slice(0, 20);
    });
    if (!job?.length) return;
    const saved = await client.upsert(job.map(sheetRow));
    changeState((s) => {
      if (s.gsLease?.token !== lease) return;
      s.pending = s.pending.filter((id) => {
        const current = s.log.find((c) => c.id === id),
          sent = job.find((c) => c.id === id);
        return (
          !saved.includes(id) ||
          JSON.stringify(current) !== JSON.stringify(sent)
        );
      });
      s.gsError = "";
    });
  } catch (e) {
    changeState((s) => {
      if (s.gsLease?.token === lease)
        s.gsError = e instanceof Error ? e.message : "ส่งข้อมูลไม่สำเร็จ";
    });
  } finally {
    changeState((s) => {
      if (s.gsLease?.token === lease) delete s.gsLease;
    });
    flushing = false;
  }
}
