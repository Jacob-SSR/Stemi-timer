import { createSign } from "node:crypto";

export const SHEET_NAME = "STEMI_FastTrack";
export const SHEET_HEADERS = [
  "case_id",
  "วันที่",
  "HN",
  "VN",
  "ผู้ป่วย",
  "สิทธิการรักษา",
  "ที่อยู่",
  "ประวัติปัจจุบัน",
  "โรคประจำตัว",
  "แนวทาง",
  "Door-in",
  "EKG",
  "แพทย์วินิจฉัย",
  "Needle",
  "Door-out",
  "ส่งต่อ",
  "D2EKG (นาที)",
  "D2N (นาที)",
  "DIDO (นาที)",
  "Door→ผล Lab (นาที)",
  "ผล Lab",
  "D2EKG ผ่านเป้า",
  "D2N ผ่านเป้า",
  "DIDO ผ่านเป้า",
  "อาการเปลี่ยนแปลง / หมายเหตุ",
  "ส่งเข้าชีตเมื่อ",
  "RCA สถานะ",
  "ระดับความรุนแรง",
  "ปัจจัยที่เกี่ยวข้อง",
  "สาเหตุราก",
  "มาตรการแก้ไข",
  "วินิจฉัยสุดท้าย (ปลายทาง)",
  "การรักษาที่ปลายทาง",
  "ผลการรักษา",
  "รายละเอียดผลหลังส่งต่อ",
] as const;
export type SheetRow = Record<string, string | number | null>;
export interface SheetCredentials {
  email: string;
  privateKey: string;
  id: string;
}
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const dateColumns = new Set([
  "วันที่",
  "Door-in",
  "EKG",
  "แพทย์วินิจฉัย",
  "Needle",
  "Door-out",
  "ส่งเข้าชีตเมื่อ",
]);
export function sheetValues(row: SheetRow, now: number) {
  return SHEET_HEADERS.map((header) => {
    const value =
      header === "ส่งเข้าชีตเมื่อ"
        ? new Date(now + 7 * 3600000).toISOString().slice(0, 19)
        : (row[header] ?? "");
    if (!dateColumns.has(header) || value === "") return value;
    // Store Bangkok wall-clock dates as spreadsheet serials, independent of host timezone.
    const ms = Date.parse(
      String(value).replace(" ", "T") +
        (String(value).length === 10 ? "T00:00:00Z" : "Z"),
    );
    if (!Number.isFinite(ms))
      throw new Error(`วันที่ในคอลัมน์ ${header} ไม่ถูกต้อง`);
    return ms / 86400000 + 25569;
  });
}
export class GoogleSheetsClient {
  private token?: { value: string; expires: number };
  constructor(
    private credentials: SheetCredentials,
    private request: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  private async accessToken(signal: AbortSignal) {
    if (this.token && this.token.expires > this.now() + 60000)
      return this.token.value;
    const issued = Math.floor(this.now() / 1000);
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: this.credentials.email, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 })}`;
    let assertion: string;
    try {
      const sign = createSign("RSA-SHA256");
      sign.update(unsigned);
      assertion = `${unsigned}.${sign.sign(this.credentials.privateKey.replace(/\\n/g, "\n"), "base64url")}`;
    } catch {
      throw new Error(
        "GOOGLE_PRIVATE_KEY ไม่ถูกต้อง ตรวจคีย์จากไฟล์ Service Account",
      );
    }
    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal,
    });
    if (!response.ok)
      throw new Error(
        "ยืนยัน Service Account ไม่สำเร็จ ตรวจอีเมล คีย์ และเวลาเครื่องเซิร์ฟเวอร์",
      );
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token)
      throw new Error("Google ไม่ได้ส่ง Access Token กลับมา");
    this.token = {
      value: body.access_token,
      expires: this.now() + (body.expires_in || 3600) * 1000,
    };
    return this.token.value;
  }
  private async api(
    path: string,
    token: string,
    signal: AbortSignal,
    body?: unknown,
  ) {
    const response = await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.credentials.id)}${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      },
    );
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      const reason =
        response.status === 403
          ? "แชร์ชีตให้ Service Account เป็นผู้แก้ไข และเปิด Google Sheets API"
          : response.status === 404
            ? "ตรวจ GOOGLE_SHEET_ID และสิทธิ์เข้าถึงชีต"
            : `Google Sheets ตอบกลับ ${response.status} ระบบจะลองส่งใหม่`;
      throw new Error(reason);
    }
    return response.json();
  }
  async upsert(rows: SheetRow[]) {
    if (!rows.length) return [];
    const signal = AbortSignal.timeout(55000);
    const token = await this.accessToken(signal);
    const api = (path: string, body?: unknown) =>
      this.api(path, token, signal, body);
    type Tab = {
      sheetId: number;
      title: string;
      gridProperties: { rowCount: number; columnCount: number };
    };
    const meta = (await api("?fields=sheets(properties)")) as {
      sheets: { properties: Tab }[];
    };
    let tab = meta.sheets.find(
      (s) => s.properties.title === SHEET_NAME,
    )?.properties;
    if (!tab) {
      const result = await api(":batchUpdate", {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAME,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 35,
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      });
      tab = result.replies[0].addSheet.properties as Tab;
    }
    const range = (r: string) => encodeURIComponent(`'${SHEET_NAME}'!${r}`);
    const lastColumn = (n: number): string =>
      n <= 26
        ? String.fromCharCode(64 + n)
        : lastColumn(Math.floor((n - 1) / 26)) +
          String.fromCharCode(65 + ((n - 1) % 26));
    const values = (await api(
      `/values/${range(`A1:${lastColumn(Math.min(35, tab.gridProperties.columnCount))}${tab.gridProperties.rowCount}`)}`,
    )) as { values?: (string | number)[][] };
    const existing = values.values || [];
    const blank = !existing.length;
    if (
      !blank &&
      (existing[0].length !== SHEET_HEADERS.length ||
        SHEET_HEADERS.some((h, i) => existing[0][i] !== h))
    )
      throw new Error(
        "หัวตาราง STEMI_FastTrack ไม่ตรงกับโปรแกรม กรุณาใช้ชีตแม่แบบหรือแท็บใหม่ที่ว่าง",
      );
    const ids = new Map<string, number>();
    existing.slice(1).forEach((r, i) => {
      const id = String(r[0] ?? "");
      if (id && ids.has(id))
        throw new Error("พบ case_id ซ้ำในชีต กรุณาตรวจแถวซ้ำก่อนส่งใหม่");
      if (id) ids.set(id, i + 2);
    });
    let next = Math.max(2, existing.length + 1);
    const data: { range: string; values: (string | number)[][] }[] = blank
      ? [{ range: `'${SHEET_NAME}'!A1:AI1`, values: [[...SHEET_HEADERS]] }]
      : [];
    for (const row of rows) {
      const id = String(row.case_id || "");
      if (!id) throw new Error("ไม่มี case_id สำหรับส่ง Google Sheet");
      const at = ids.get(id) ?? next++;
      ids.set(id, at);
      data.push({
        range: `'${SHEET_NAME}'!A${at}:AI${at}`,
        values: [sheetValues(row, this.now())],
      });
    }
    const requests: unknown[] = [];
    if (
      next - 1 > tab.gridProperties.rowCount ||
      tab.gridProperties.columnCount < 35
    )
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: tab.sheetId,
            gridProperties: {
              rowCount: Math.max(next - 1, tab.gridProperties.rowCount),
              columnCount: Math.max(35, tab.gridProperties.columnCount),
            },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      });
    if (blank) {
      requests.push(
        {
          updateSheetProperties: {
            properties: {
              sheetId: tab.sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: tab.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 35,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.93, green: 0.95, blue: 0.94 },
                wrapStrategy: "WRAP",
              },
            },
            fields: "userEnteredFormat",
          },
        },
      );
    }
    // Apply formats only to the rows being written; never restyle unrelated tabs.
    for (const row of data.filter((d) => !d.range.endsWith("AI1"))) {
      const at = Number(row.range.match(/!A(\d+)/)![1]);
      for (const [start, end, type, pattern] of [
        [1, 2, "DATE", "dd/mm/yyyy"],
        [2, 4, "TEXT", "@"],
        [10, 15, "DATE_TIME", "dd/mm/yyyy hh:mm:ss"],
        [25, 26, "DATE_TIME", "dd/mm/yyyy hh:mm:ss"],
      ] as const)
        requests.push({
          repeatCell: {
            range: {
              sheetId: tab.sheetId,
              startRowIndex: at - 1,
              endRowIndex: at,
              startColumnIndex: start,
              endColumnIndex: end,
            },
            cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
            fields: "userEnteredFormat.numberFormat",
          },
        });
    }
    if (requests.length) await api(":batchUpdate", { requests });
    // RAW preserves leading-zero identifiers and makes free text literal, including '=...'.
    await api("/values:batchUpdate", { valueInputOption: "RAW", data });
    return rows.map((row) => String(row.case_id));
  }
}
