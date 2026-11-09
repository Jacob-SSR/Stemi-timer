import {
  metrics,
  thaiDate,
  type Case,
  type State,
  type TimeKey,
} from "./model";

export const stepDetails: Record<Exclude<TimeKey, "door_in">, string> = {
  md: "ซักประวัติ ตรวจร่างกาย · กดบันทึกบนจอ",
  ekg: "EKG 12 lead · ดึงเวลาคีย์รายการจาก HOSxP หรือบันทึกเวลาจริง",
  dx: "แพทย์อ่าน EKG / วินิจฉัย STEMI · กดบันทึกบนจอ",
  lab_sent: "ดึงเวลาสั่ง Lab จาก HOSxP ให้เอง",
  asa: "ASA 300 mg เคี้ยว · Clopidogrel loading · กดบันทึกบนจอ",
  needle: "กดบันทึกเมื่อเริ่มให้ยาจริง · เวลาสั่งยาใช้เพื่ออ้างอิง",
  consult: "แจ้ง STEMI Fast Track และประสานโรงพยาบาลปลายทาง",
  accept: "โรงพยาบาลปลายทางตอบรับส่งต่อ · กดบันทึกบนจอ",
  ambu: "พยาบาล อุปกรณ์ และ Defibrillator ครบ",
  door_out: "ใช้เวลารถออกจริง · เวลาใบ Refer จาก HOSxP แสดงไว้อ้างอิง",
};
export const skReasons = [
  "ส่งทำ Primary PCI ได้ทันเวลา",
  "มีข้อห้ามใช้ยาละลายลิ่มเลือด",
  "เริ่มเจ็บอกเกิน 12 ชม.",
  "ผู้ป่วย/ญาติไม่ยินยอม",
  "แพทย์พิจารณาไม่ให้",
];
export const symptomPresets = [
  "BP ต่ำ / ช็อก",
  "VT / VF",
  "Cardiac arrest → CPR",
  "Bradycardia / AV block",
  "เจ็บอกมากขึ้น",
  "เหนื่อย / SpO2 ต่ำ",
  "ซึม / สับสน",
  "เลือดออกหลังให้ SK",
  "แพ้ยา SK / BP ตกขณะให้ยา",
  "เจ็บอกลดลง (reperfusion)",
  "ST ลดลง > 50%",
];
export const delayPresets = [
  "ญาติตัดสินใจช้า",
  "EKG ไม่ชัด รอปรึกษาแพทย์",
  "มีข้อห้ามใช้ SK",
  "รอรถ Refer",
  "ผู้ป่วยไม่ยินยอม",
  "รอผล Lab ก่อนให้ยา",
];
export function dateRange(
  kind: "month" | "previous" | "fiscal" | "all",
  now = Date.now(),
) {
  const today = thaiDate(now),
    [year, month] = today.split("-").map(Number);
  if (kind === "all") return { from: "", to: "" };
  if (kind === "fiscal")
    return { from: `${month >= 10 ? year : year - 1}-10-01`, to: today };
  if (kind === "month") return { from: today.slice(0, 7) + "-01", to: today };
  const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  return { from: end.slice(0, 7) + "-01", to: end };
}
export function clockValue(t: number | null) {
  return t == null ? "" : new Date(t + 7 * 3600000).toISOString().slice(11, 19);
}
// Clock-only editing follows the nearest day to the existing event (or current time).
// The server still checks future times and Door-in ordering.
export function timestampFromClock(value: string, reference: number) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const [h, m, s = 0] = value.split(":").map(Number);
  if (h > 23 || m > 59 || s > 59) return null;
  const t = Date.parse(
    thaiDate(reference) +
      "T" +
      value +
      (value.length === 5 ? ":00" : "") +
      "+07:00",
  );
  return [t - 86400000, t, t + 86400000].sort(
    (a, b) => Math.abs(a - reference) - Math.abs(b - reference),
  )[0];
}
export function rcaLabel(c: Case, targets: State["targets"]) {
  if (c.rca?.status === "done") return "RCA เสร็จ";
  if (c.rca) return "RCA ร่าง";
  const late = Object.entries(metrics(c)).some(
    ([k, v]) => v != null && v > targets[k as keyof ReturnType<typeof metrics>],
  );
  return late || c.notes.some((n) => n.important) ? "ต้องทำ RCA" : "ทบทวน RCA";
}
