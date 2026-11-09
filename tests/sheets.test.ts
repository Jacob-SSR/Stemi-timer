import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  GoogleSheetsClient,
  SHEET_HEADERS,
  sheetValues,
} from "../src/lib/google-sheets";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const credentials = {
  email: "test@example.iam.gserviceaccount.com",
  privateKey: pem.replace(/\n/g, "\\n"),
  id: "test-sheet",
};
function fake(
  initial: (string | number)[][] = [[...SHEET_HEADERS]],
  options = { missing: false, rowCount: 1000, columnCount: 35 },
) {
  let rows = structuredClone(initial),
    auth = 0,
    batches = 0,
    fail = false,
    now = Date.parse("2026-11-09T03:00:00Z");
  const writes: { range: string; values: (string | number)[][] }[] = [];
  const formats: unknown[] = [];
  const request = (async (input, init) => {
    const url = String(input);
    if (url.includes("oauth2")) {
      auth++;
      const jwt = new URLSearchParams(String(init?.body)).get("assertion")!;
      const [head, claims, signature] = jwt.split(".");
      const verify = createVerify("RSA-SHA256");
      verify.update(`${head}.${claims}`);
      assert(verify.verify(publicKey, signature, "base64url"));
      assert.deepEqual(
        JSON.parse(Buffer.from(claims, "base64url").toString()),
        {
          iss: credentials.email,
          scope: "https://www.googleapis.com/auth/spreadsheets",
          aud: "https://oauth2.googleapis.com/token",
          iat: now / 1000,
          exp: now / 1000 + 3600,
        },
      );
      return Response.json({ access_token: "mock-token", expires_in: 3600 });
    }
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer mock-token",
    );
    if (fail)
      return Response.json(
        { error: "must not expose server details" },
        { status: 403 },
      );
    if (url.includes("?fields="))
      return Response.json({
        sheets: options.missing
          ? []
          : [
              {
                properties: {
                  sheetId: 7,
                  title: "STEMI_FastTrack",
                  gridProperties: {
                    rowCount: options.rowCount,
                    columnCount: options.columnCount,
                  },
                },
              },
            ],
      });
    if (url.endsWith("/values:batchUpdate")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.valueInputOption, "RAW");
      for (const d of body.data) {
        writes.push(d);
        const at = Number(d.range.match(/!A(\d+)/)[1]);
        rows[at - 1] = d.values[0];
      }
      batches++;
      return Response.json({});
    }
    if (url.endsWith(":batchUpdate")) {
      const requests = JSON.parse(String(init?.body)).requests;
      formats.push(...requests);
      if (requests[0]?.addSheet)
        return Response.json({
          replies: [
            {
              addSheet: {
                properties: {
                  sheetId: 7,
                  title: "STEMI_FastTrack",
                  gridProperties: { rowCount: 1000, columnCount: 35 },
                },
              },
            },
          ],
        });
      return Response.json({});
    }
    return Response.json({ values: rows });
  }) as typeof fetch;
  return {
    client: new GoogleSheetsClient(credentials, request, () => now),
    writes,
    formats,
    auth: () => auth,
    batches: () => batches,
    setFail: () => {
      fail = true;
    },
    advance: () => {
      now += 3600000;
    },
  };
}
test("service-account JWT signature, escaped PEM, token cache and refresh", async () => {
  const f = fake();
  await f.client.upsert([{ case_id: "a" }]);
  await f.client.upsert([{ case_id: "b" }]);
  assert.equal(f.auth(), 1);
  f.advance();
  await f.client.upsert([{ case_id: "c" }]);
  assert.equal(f.auth(), 2);
});
test("resend upserts by case_id; RAW preserves identifiers and literal formulas", async () => {
  const f = fake();
  await f.client.upsert([
    { case_id: "a", HN: "000123", VN: "0099", ผู้ป่วย: "=1+1" },
  ]);
  await f.client.upsert([
    { case_id: "a", HN: "000123", VN: "0099", ผู้ป่วย: "updated" },
  ]);
  assert.equal(f.writes[0].range, "'STEMI_FastTrack'!A2:AI2");
  assert.equal(f.writes[1].range, f.writes[0].range);
  assert.deepEqual(f.writes[0].values[0].slice(2, 5), [
    "000123",
    "0099",
    "=1+1",
  ]);
});
test("blank tab initializes the exact 35-column schema and formatting", async () => {
  const f = fake([]);
  await f.client.upsert([{ case_id: "a" }]);
  assert.deepEqual(f.writes[0].values[0], SHEET_HEADERS);
  assert(f.formats.some((r) => "repeatCell" in (r as object)));
  assert(f.formats.some((r) => "updateSheetProperties" in (r as object)));
});
test("missing tab is created without changing other tabs; a small blank grid is expanded", async () => {
  const missing = fake([], { missing: true, rowCount: 1000, columnCount: 35 });
  await missing.client.upsert([{ case_id: "a" }]);
  assert(missing.formats.some((r) => "addSheet" in (r as object)));
  const small = fake([], { missing: false, rowCount: 1, columnCount: 26 });
  await small.client.upsert([{ case_id: "a" }]);
  assert(
    small.formats.some((r) =>
      JSON.stringify(r).includes('"rowCount":2,"columnCount":35'),
    ),
  );
});
test("mismatched headers and duplicate IDs stop without rewriting data", async () => {
  const bad = fake([["other data"]]);
  await assert.rejects(bad.client.upsert([{ case_id: "a" }]), /หัวตาราง/);
  assert.equal(bad.batches(), 0);
  const duplicate = fake([[...SHEET_HEADERS], ["a"], ["a"]]);
  await assert.rejects(duplicate.client.upsert([{ case_id: "a" }]), /ซ้ำ/);
  assert.equal(duplicate.batches(), 0);
});
test("new rows follow all existing content, including rows with no case_id", async () => {
  const f = fake([[...SHEET_HEADERS], ["a"], ["", "manual content"]]);
  await f.client.upsert([{ case_id: "b" }]);
  assert.equal(f.writes[0].range, "'STEMI_FastTrack'!A4:AI4");
});
test("dates are numeric Bangkok wall time; absent values stay blank", () => {
  const values = sheetValues(
    { case_id: "a", วันที่: "2026-11-09", "Door-in": "2026-11-09 10:30:00" },
    Date.parse("2026-11-09T03:00:00Z"),
  );
  assert.equal(
    values[1],
    Date.parse("2026-11-09T00:00:00Z") / 86400000 + 25569,
  );
  assert.equal(values[10], Number(values[1]) + 10.5 / 24);
  assert.equal(values[11], "");
  assert(Math.abs(Number(values[25]) - (Number(values[1]) + 10 / 24)) < 1e-9);
});
test("permission failures report setup action without response contents", async () => {
  const f = fake();
  f.setFail();
  await assert.rejects(
    f.client.upsert([{ case_id: "a" }]),
    (error) =>
      error instanceof Error &&
      /แชร์ชีต/.test(error.message) &&
      !error.message.includes("server details"),
  );
});
