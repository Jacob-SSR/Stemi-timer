import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import PptxGenJS from "pptxgenjs";
import { config } from "./config";
import {
  metrics,
  steps,
  summary,
  thaiTime,
  type Case,
  type State,
} from "./model";
export function reportRows(cases: Case[]) {
  return cases.map((c) => ({
    case_id: c.id,
    ผู้ป่วย: c.label,
    HN: c.hn,
    VN: c.vn || "",
    อายุ: c.patient?.age ?? "",
    เพศ: c.patient?.sex || "",
    สิทธิ: c.patient?.pttype || "",
    "Door-in": thaiTime(c.times.door_in.t, true),
    ...Object.fromEntries(
      steps.map(([k, n]) => [n, thaiTime(c.times[k].t, true)]),
    ),
    ...Object.fromEntries(
      Object.entries(metrics(c)).map(([k, v]) => [
        k + " (นาที)",
        v == null ? "" : Number(v.toFixed(2)),
      ]),
    ),
    แนวทาง: c.path,
    ปลายทาง: c.dest,
    "ไม่ให้ SK": c.sk === "no" ? c.skReason : "",
    RCA: c.rca?.status || "",
    สาเหตุราก: c.rca?.root || "",
    มาตรการ:
      c.rca?.actions
        .map((a) => `${a.text} / ${a.owner} / ${a.due} / ${a.status}`)
        .join("\n") || "",
    วินิจฉัยสุดท้าย: c.outcome.final_dx || "",
    การรักษาปลายทาง: c.outcome.tx || "",
    ผลการรักษา: c.outcome.result || "",
    ผลหลังส่งต่อ: JSON.stringify(c.outcome),
    หมายเหตุ: c.notes.map((n) => n.text).join("\n"),
  }));
}
export function csv(cases: Case[]) {
  const rows = reportRows(cases);
  const keys = Object.keys(rows[0] || { case_id: "" });
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\ufeff" +
    [keys, ...rows.map((r) => keys.map((k) => r[k as keyof typeof r]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
export async function xlsx(cases: Case[], targets: State["targets"]) {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet("รายเคส");
  const rows = reportRows(cases);
  if (rows.length) {
    sh.columns = Object.keys(rows[0]).map((key) => ({
      header: key,
      key,
      width: 24,
    }));
    sh.addRows(rows);
    sh.autoFilter = {
      from: "A1",
      to: { row: rows.length + 1, column: sh.columnCount },
    };
  }
  sh.views = [{ state: "frozen", ySplit: 1 }];
  sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sh.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" },
  };
  const kpi = wb.addWorksheet("สรุป KPI");
  kpi.addRow(["ตัวชี้วัด", "เป้า (นาที)", "มีเวลาครบ", "ผ่านเป้า", "ร้อยละ"]);
  (["ekg", "needle", "dido", "lab"] as const).forEach((key, i) => {
    const col = sh.columns.findIndex((c) => c.key === `${key} (นาที)`) + 1;
    const r = i + 2;
    if (!col) {
      kpi.addRow([key, targets[key], 0, 0, 0]);
      return;
    }
    const letter = sh.getColumn(col).letter,
      range = `'รายเคส'!${letter}2:${letter}${cases.length + 1}`;
    kpi.addRow([
      key,
      targets[key],
      { formula: `COUNT(${range})` },
      { formula: `COUNTIFS(${range},">=0",${range},"<="&B${r})` },
      { formula: `IFERROR(D${r}/C${r}*100,0)` },
    ]);
    sh.addConditionalFormatting({
      ref: `${letter}2:${letter}${cases.length + 1}`,
      rules: [
        {
          type: "cellIs",
          operator: "greaterThan",
          formulae: [targets[key]],
          priority: 1,
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFEE2E2" },
            },
          },
        },
      ],
    });
  });
  kpi.columns.forEach((c) => (c.width = 22));
  kpi.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function word(c: Case, kind: string) {
  let lines = summary(c, false).split("\n");
  if (kind === "refer")
    lines.push(
      "\nข้อมูลใบส่งต่อ",
      ...Object.entries(c.refer).map(([k, v]) => `${k}: ${v}`),
    );
  if (kind === "rca")
    lines = [
      `รหัสเคส: ${c.id}`,
      `ระดับ: ${c.rca?.severity || "—"}`,
      `สรุป: ${c.rca?.summary || ""}`,
      `Care Delivery Problems: ${c.rca?.cdp || ""}`,
      `Voice of Staff: ${c.rca?.voices || ""}`,
      ...Object.entries(c.rca?.factors || {}).map(([k, v]) => `${k}: ${v}`),
      ...(c.rca?.whys || []).map((v, i) => `Why ${i + 1}: ${v}`),
      `สาเหตุราก: ${c.rca?.root || ""}`,
      ...(c.rca?.actions || []).map(
        (a) =>
          `${a.text} | ${a.strength} | ${a.owner} | ${a.due} | ${a.status}`,
      ),
      `ทีม: ${c.rca?.team || ""}`,
    ];
  const doc = new Document({
    styles: { default: { document: { run: { font: "Tahoma", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, bottom: 720, left: 850, right: 850 },
          },
        },
        children: [
          new Paragraph({
            text: config.hospital,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text:
              kind === "refer"
                ? "ใบส่งต่อ STEMI (เอกสารประกอบ)"
                : kind === "rca"
                  ? "Root Cause Analysis"
                  : "สรุป STEMI Fast Track",
            heading: HeadingLevel.HEADING_2,
          }),
          ...lines.map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line)],
                spacing: { after: 90 },
              }),
          ),
          new Paragraph("แพทย์ __________________ พยาบาล __________________"),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
export async function powerpoint(c: Case) {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.author = config.hospital;
  p.subject = "RCA";
  const pages = [
    [
      "Root Cause Analysis",
      `รหัสเคส ${c.id}\nระดับ ${c.rca?.severity || "—"} · ${c.rca?.date || ""}`,
    ],
    ["สรุปเหตุการณ์", c.rca?.summary || ""],
    [
      "Timeline",
      steps.map(([k, n]) => `${n}: ${thaiTime(c.times[k].t)}`).join("\n"),
    ],
    ["Care Delivery Problems", c.rca?.cdp || ""],
    ["Voice of Staff", c.rca?.voices || ""],
    ...Object.entries(c.rca?.factors || {}).map(([k, v]) => [k, v]),
    ["5 Whys", (c.rca?.whys || []).map((v, i) => `${i + 1}. ${v}`).join("\n")],
    ["สาเหตุราก", c.rca?.root || ""],
    [
      "มาตรการแก้ไข",
      (c.rca?.actions || [])
        .map(
          (a) =>
            `${a.text}\n${a.strength} · ${a.owner} · ${a.due} · ${a.status}`,
        )
        .join("\n\n"),
    ],
    ["ทีมทบทวน", c.rca?.team || ""],
  ];
  for (const [title, body] of pages) {
    const s = p.addSlide();
    s.background = { color: "F5F8F8" };
    s.addText(title, {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.7,
      fontFace: "Tahoma",
      fontSize: 28,
      bold: true,
      color: "0F766E",
    });
    s.addText(body || "—", {
      x: 0.6,
      y: 1.5,
      w: 12,
      h: 5.4,
      fontFace: "Tahoma",
      fontSize: 18,
      color: "183B40",
      breakLine: false,
      fit: "shrink",
    });
  }
  return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}
