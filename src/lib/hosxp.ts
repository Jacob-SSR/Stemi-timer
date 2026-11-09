import mysql, { type RowDataPacket, type Pool } from "mysql2/promise";
import { config } from "./config";
import { erDayMatches, type ErDateRange } from "./er-dates";
import {
  blankCase,
  type Case,
  type Patient,
  type Lab,
  type TimeKey,
  steps,
} from "./model";
let pool: Pool | undefined;
function connection() {
  pool ??= mysql.createPool({
    host: process.env.HOSXP_HOST,
    port: Number(process.env.HOSXP_PORT || 3306),
    database: process.env.HOSXP_DATABASE,
    user: process.env.HOSXP_USER,
    password: process.env.HOSXP_PASSWORD,
    charset: process.env.HOSXP_CHARSET || "TIS620",
    connectionLimit: 4,
    connectTimeout: 5000,
    dateStrings: true,
    timezone: "+07:00",
    multipleStatements: false,
  });
  return pool;
}
async function select(
  sql: string,
  values: (string | number)[] = [],
): Promise<RowDataPacket[]> {
  // This adapter only exposes SELECT. MySQL account must also have SELECT-only grants.
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Only SELECT is allowed");
  return (await connection().query<RowDataPacket[]>(sql, values))[0];
}
export function epoch(v: unknown): number | null {
  if (!v || String(v).startsWith("0000-")) return null;
  const n = Date.parse(String(v).replace(" ", "T") + "+07:00");
  return Number.isFinite(n) ? n : null;
}
const marks = (a: unknown[]) => a.map(() => "?").join(",");
export async function serverNow() {
  return config.demo
    ? Date.now()
    : (epoch((await select("SELECT NOW() AS n"))[0].n) ?? Date.now());
}
function demoEr(base: number): Patient[] {
  return [
    {
      vn: "DEMO001",
      hn: "0045821",
      name: "นายสมชาย ใจดี (ตัวอย่าง)",
      age: 62,
      sex: "ชาย",
      door_in: base,
      cc: "เจ็บแน่นหน้าอกร้าวไปแขนซ้าย 1 ชั่วโมง",
      dx: "I21.0",
      stemi: true,
      hpi: "เจ็บแน่นกลางอก เหงื่อแตก ใจสั่น",
      pmh: "HT, DM type 2",
      address: "ข้อมูลตัวอย่าง จังหวัดบุรีรัมย์",
      pttype: "บัตรทอง (UC)",
    },
    {
      vn: "DEMO002",
      hn: "0102233",
      name: "นางมาลี สุขใส (ตัวอย่าง)",
      age: 71,
      sex: "หญิง",
      door_in: base + 9 * 60000,
      cc: "เหนื่อย ใจสั่น เหงื่อออก",
      dx: "",
      stemi: false,
      hpi: "30 นาทีก่อนมา เหนื่อยหอบ",
      pmh: "DLP",
      address: "ข้อมูลตัวอย่าง",
      pttype: "ข้าราชการ",
    },
    {
      vn: "DEMO003",
      hn: "0077410",
      name: "นายทดสอบ ระบบ (ตัวอย่าง)",
      age: 45,
      sex: "ชาย",
      door_in: base - 40 * 60000,
      cc: "เจ็บหน้าอก",
      dx: "R07.4",
      stemi: false,
      hpi: "",
      pmh: "",
      address: "",
      pttype: "ประกันสังคม",
    },
  ];
}
async function queryErPatients(
  where: string,
  values: string[] = [],
  limit: 1 | 300 | 301 = 300,
): Promise<Patient[]> {
  const rows = await select(
    `SELECT o.vn,o.hn,CONCAT(p.pname,p.fname,' ',p.lname) AS name,p.sex,
    TIMESTAMPDIFF(YEAR,p.birthday,o.vstdate) AS age,CONCAT(o.vstdate,' ',o.vsttime) AS door_in,
    s.cc,s.hpi,s.pmh,pt.name AS pttype,CONCAT_WS(' ',p.addrpart,CONCAT('ม.',p.moopart),t.full_name) AS address,
    (SELECT GROUP_CONCAT(DISTINCT d.icd10) FROM ovstdiag d WHERE d.vn=o.vn) AS dx
    FROM ovst o JOIN er_regist e ON e.vn=o.vn LEFT JOIN patient p ON p.hn=o.hn
    LEFT JOIN opdscreen s ON s.vn=o.vn LEFT JOIN pttype pt ON pt.pttype=o.pttype
    LEFT JOIN thaiaddress t ON t.addressid=CONCAT(p.chwpart,p.amppart,p.tmbpart)
    WHERE ${where}
    ORDER BY o.vstdate DESC,o.vsttime DESC LIMIT ${limit}`,
    values,
  );
  return rows.map((r) => ({
    vn: String(r.vn),
    hn: String(r.hn),
    name: r.name || "",
    age: r.age == null ? null : Number(r.age),
    sex: String(r.sex) === "1" ? "ชาย" : "หญิง",
    door_in: epoch(r.door_in)!,
    cc: r.cc || "",
    hpi: r.hpi || "",
    pmh: r.pmh || "",
    address: r.address || "",
    pttype: r.pttype || "",
    dx: r.dx || "",
    stemi: /(^|,)\s*I2[12]/i.test(r.dx || ""),
  }));
}
// Default stays 24 hours for automatic STEMI tracking; the picker supplies dates.
export async function erList(
  base: number,
  range?: ErDateRange,
): Promise<Patient[]> {
  if (config.demo) {
    const patients = demoEr(base);
    return range
      ? patients.filter((p) => erDayMatches(p.door_in, range))
      : patients;
  }
  return range
    ? queryErPatients(
        "o.vstdate>=? AND o.vstdate<=?",
        [range.from, range.to],
        301,
      )
    : queryErPatients(
        "TIMESTAMP(o.vstdate,o.vsttime)>=DATE_SUB(NOW(),INTERVAL 24 HOUR)",
      );
}
// A selected historical ER visit must be looked up by VN, independently of the 24h list.
export async function findErPatient(
  base: number,
  vn: string,
): Promise<Patient | null> {
  if (config.demo) return demoEr(base).find((p) => p.vn === vn) ?? null;
  return (await queryErPatients("o.vn=?", [vn], 1))[0] ?? null;
}
interface HosTimes {
  values: Partial<Record<TimeKey, number | null>>;
  labs: Lab[];
  needleOrder: number | null;
}
export async function hydrate(
  cases: Case[],
  patients: Patient[],
  base: number,
): Promise<Case[]> {
  const byVn = new Map<string, HosTimes>();
  const vns = [
    ...new Set(cases.map((c) => c.vn).filter((v): v is string => !!v)),
  ];
  for (const vn of vns)
    byVn.set(vn, {
      values: {
        door_in:
          patients.find((p) => p.vn === vn)?.door_in ??
          cases.find((c) => c.vn === vn)?.patient?.door_in,
      },
      labs: [],
      needleOrder: null,
    });
  if (config.demo) {
    for (const [vn, h] of byVn) {
      if (vn === "DEMO001") {
        const at = (m: number) =>
          base + m * 60000 <= Date.now() ? base + m * 60000 : null;
        h.values.ekg = at(7.2);
        h.values.lab_sent = at(8);
        h.values.door_out = at(41);
        h.needleOrder = at(26.7);
        h.labs = [
          {
            name: "Troponin",
            ordered: at(8),
            reported: at(31),
            result: at(31) ? "1,240 ng/L" : null,
          },
          {
            name: "K",
            ordered: at(8),
            reported: at(19),
            result: at(19) ? "4.1 mmol/L" : null,
          },
        ];
      } else if (vn === "DEMO002") h.values.ekg = base + 12.5 * 60000;
    }
  } else if (vns.length) {
    const timed = async (codes: string[], key: "ekg" | "needle") => {
      if (!codes.length) return;
      for (const r of await select(
        `SELECT vn,MIN(CONCAT(rxdate,' ',rxtime)) AS t FROM opitemrece WHERE vn IN (${marks(vns)}) AND icode IN (${marks(codes)}) GROUP BY vn`,
        [...vns, ...codes],
      )) {
        const h = byVn.get(String(r.vn))!;
        if (key === "needle") h.needleOrder = epoch(r.t);
        else h.values.ekg = epoch(r.t);
      }
    };
    await timed(config.ekgCodes, "ekg");
    await timed(config.lyticCodes, "needle");
    for (const r of await select(
      `SELECT vn,MIN(CONCAT(refer_date,' ',refer_time)) AS t FROM referout WHERE vn IN (${marks(vns)}) GROUP BY vn`,
      vns,
    ))
      byVn.get(String(r.vn))!.values.door_out = epoch(r.t);
    const codes = Object.values(config.labItems).flat();
    if (codes.length)
      for (const r of await select(
        `SELECT h.vn,o.lab_items_code AS code,CONCAT(h.order_date,' ',h.order_time) AS ordered,CONCAT(h.report_date,' ',h.report_time) AS reported,o.lab_order_result AS result,h.confirm_report FROM lab_head h JOIN lab_order o ON o.lab_order_number=h.lab_order_number WHERE h.vn IN (${marks(vns)}) AND o.lab_items_code IN (${marks(codes)}) ORDER BY h.order_date,h.order_time`,
        [...vns, ...codes],
      )) {
        const name = Object.entries(config.labItems).find(([, cs]) =>
          cs.includes(String(r.code)),
        )?.[0];
        const h = byVn.get(String(r.vn))!;
        if (name && !h.labs.some((l) => l.name === name))
          h.labs.push({
            name,
            ordered: epoch(r.ordered),
            reported: r.confirm_report === "N" ? null : epoch(r.reported),
            result: r.confirm_report === "N" ? null : String(r.result ?? ""),
          });
      }
    for (const h of byVn.values()) {
      const ordered = h.labs
        .map((l) => l.ordered)
        .filter((v): v is number => v != null);
      h.values.lab_sent = ordered.length ? Math.min(...ordered) : null;
    }
  }
  return cases.map((c) => {
    const h = c.vn ? byVn.get(c.vn) : undefined;
    const patient = patients.find((p) => p.vn === c.vn) || c.patient;
    const times = Object.fromEntries(
      (["door_in", ...steps.map((s) => s[0])] as TimeKey[]).map((k) => {
        const hx = k === "needle" ? h?.needleOrder : h?.values[k];
        const m = c.manual[k];
        const t = m ?? (k === "needle" ? null : hx) ?? null;
        return [
          k,
          {
            t,
            hosxp: hx ?? null,
            src: m != null ? "manual" : t != null ? "hosxp" : null,
          },
        ];
      }),
    ) as Case["times"];
    return { ...c, patient, times, labs: h?.labs || c.labs };
  });
}
export const tables: Record<string, string[]> = {
  ovst: ["vn", "hn", "vstdate", "vsttime", "pttype"],
  er_regist: ["vn"],
  patient: [
    "hn",
    "pname",
    "fname",
    "lname",
    "birthday",
    "sex",
    "addrpart",
    "moopart",
    "tmbpart",
    "amppart",
    "chwpart",
  ],
  opdscreen: ["vn", "cc", "hpi", "pmh"],
  ovstdiag: ["vn", "icd10"],
  opitemrece: ["vn", "icode", "rxdate", "rxtime"],
  referout: ["vn", "refer_date", "refer_time", "refer_hospcode"],
  lab_head: [
    "vn",
    "lab_order_number",
    "order_date",
    "order_time",
    "report_date",
    "report_time",
    "confirm_report",
  ],
  lab_order: ["lab_order_number", "lab_items_code", "lab_order_result"],
  thaiaddress: ["addressid", "full_name"],
  pttype: ["pttype", "name"],
};
export async function diagnostics(base: number) {
  if (config.demo)
    return {
      demo: true,
      message: "โหมดตัวอย่าง ยังไม่ได้เชื่อม HOSxP",
      nodeNow: Date.now(),
      serverNow: Date.now(),
    };
  const found = await select(
    "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?",
    [process.env.HOSXP_DATABASE || "hos"],
  );
  const checks = Object.entries(tables).map(([table, cols]) => {
    const actual = found
      .filter((r) => r.TABLE_NAME === table)
      .map((r) => r.COLUMN_NAME);
    return {
      table,
      exists: actual.length > 0,
      missing: cols.filter((c) => !actual.includes(c)),
    };
  });
  const patients = await erList(base);
  const cases = await hydrate(
    patients
      .slice(0, 20)
      .map((p) => ({ ...blankCase(Date.now()), vn: p.vn, manual: {} })),
    patients,
    base,
  );
  return {
    demo: false,
    tables: checks,
    nodeNow: Date.now(),
    serverNow: await serverNow(),
    erCount: patients.length,
    sample: {
      count: cases.length,
      ekg: cases.filter((c) => c.times.ekg.t).length,
      labs: cases.reduce((n, c) => n + c.labs.length, 0),
    },
    thaiNameSample: patients[0]?.name,
  };
}
