import { thaiDate } from "./model";
export interface ErDateRange {
  from: string;
  to: string;
}
export function parseErDates(
  from: string | null,
  to: string | null,
): ErDateRange | undefined {
  if (from == null && to == null) return undefined;
  const valid = (value: string | null): value is string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const t = Date.parse(value + "T00:00:00+07:00");
    return Number.isFinite(t) && thaiDate(t) === value;
  };
  if (!valid(from) || !valid(to))
    throw new Error("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุดให้ถูกต้อง");
  if (from > to) throw new Error("วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด");
  return { from, to };
}
export function erDayMatches(time: number, range: ErDateRange) {
  const day = thaiDate(time);
  return day >= range.from && day <= range.to;
}
