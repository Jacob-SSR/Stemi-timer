import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { blankCase } from "../src/lib/model";
import { SHEET_HEADERS } from "../src/lib/google-sheets";
process.env.STEMI_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "stemi-sheets-"),
);
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL =
  "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();
process.env.GOOGLE_SHEET_ID = "test-sheet";
let fail = false,
  writes = 0,
  duringWrite: (() => void) | undefined;
global.fetch = (async (input) => {
  const url = String(input);
  if (url.includes("oauth2"))
    return Response.json({ access_token: "mock", expires_in: 3600 });
  if (fail) return Response.json({}, { status: 503 });
  if (url.includes("?fields="))
    return Response.json({
      sheets: [
        {
          properties: {
            sheetId: 1,
            title: "STEMI_FastTrack",
            gridProperties: { rowCount: 1000, columnCount: 35 },
          },
        },
      ],
    });
  if (url.endsWith("/values:batchUpdate")) {
    writes++;
    duringWrite?.();
    return Response.json({});
  }
  if (url.endsWith(":batchUpdate")) return Response.json({});
  return Response.json({ values: [[...SHEET_HEADERS]] });
}) as typeof fetch;
const { changeState, readState } = await import("../src/lib/store");
const { flushSheets, sheetRow } = await import("../src/lib/sheets");
function reset() {
  const c = blankCase(Date.now());
  c.closed = Date.now();
  c.label = "private name";
  c.hn = "0001";
  changeState((s) => {
    s.log = [c];
    s.pending = [c.id];
    s.gsError = "";
    s.gsLastTry = 0;
    delete s.gsLease;
  });
  fail = false;
  writes = 0;
  duringWrite = undefined;
  return c;
}
test("queue retries failures, acknowledges success and preserves default privacy", async () => {
  const c = reset();
  assert.equal(sheetRow(c).ผู้ป่วย, "");
  assert.equal(sheetRow(c).HN, "0001");
  fail = true;
  await flushSheets(true);
  assert.deepEqual(readState().pending, [c.id]);
  assert.match(readState().gsError, /503/);
  assert.equal(readState().gsLease, undefined);
  fail = false;
  await flushSheets(true);
  assert.deepEqual(readState().pending, []);
  assert.equal(readState().gsError, "");
});
test("active cross-worker lease blocks even forced resend, expired lease recovers", async () => {
  reset();
  changeState((s) => {
    s.gsLease = { token: "another-worker", until: Date.now() + 60000 };
  });
  await flushSheets(true);
  assert.equal(writes, 0);
  changeState((s) => {
    s.gsLease!.until = Date.now() - 1;
  });
  await flushSheets(true);
  assert.equal(writes, 1);
});
test("edits during delivery stay pending for an updated upsert", async () => {
  const c = reset();
  duringWrite = () => {
    changeState((s) => {
      s.log[0].dest = "changed";
    });
  };
  await flushSheets(true);
  assert.deepEqual(readState().pending, [c.id]);
  duringWrite = undefined;
  await flushSheets(true);
  assert.deepEqual(readState().pending, []);
});
