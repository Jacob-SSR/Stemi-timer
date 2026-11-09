import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseErDates, erDayMatches } from "../src/lib/er-dates";
process.env.STEMI_DEMO = "true";
process.env.STEMI_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "stemi-er-dates-"),
);
const { erList, findErPatient } = await import("../src/lib/hosxp");
const { operate, snapshot } = await import("../src/lib/service");
const { readState, changeState } = await import("../src/lib/store");
test("ER date validation rejects invalid calendar days, partial and reversed ranges", () => {
  assert.equal(parseErDates(null, null), undefined);
  assert.deepEqual(parseErDates("2024-02-29", "2024-02-29"), {
    from: "2024-02-29",
    to: "2024-02-29",
  });
  for (const [a, b] of [
    ["2026-02-29", "2026-03-01"],
    ["2026-11-31", "2026-12-01"],
    ["2026-11-09", null],
    ["", ""],
    ["2026-11-10", "2026-11-09"],
  ])
    assert.throws(() => parseErDates(a, b));
});
test("Date filtering includes full Thai days on both boundaries, independent of UTC day", () => {
  const r = { from: "2026-11-09", to: "2026-11-09" };
  assert.equal(erDayMatches(Date.parse("2026-11-09T00:00:00+07:00"), r), true);
  assert.equal(
    erDayMatches(Date.parse("2026-11-09T23:59:59.999+07:00"), r),
    true,
  );
  assert.equal(
    erDayMatches(Date.parse("2026-11-08T23:59:59.999+07:00"), r),
    false,
  );
  assert.equal(erDayMatches(Date.parse("2026-11-10T00:00:00+07:00"), r), false);
});
test("ER search selects only visits on requested days, including visits across midnight", async () => {
  const base = Date.parse("2026-11-08T23:58:00+07:00");
  assert.deepEqual(
    (await erList(base, { from: "2026-11-08", to: "2026-11-08" })).map(
      (p) => p.vn,
    ),
    ["DEMO001", "DEMO003"],
  );
  assert.deepEqual(
    (await erList(base, { from: "2026-11-09", to: "2026-11-09" })).map(
      (p) => p.vn,
    ),
    ["DEMO002"],
  );
  assert.equal(
    (await erList(base, { from: "2026-11-08", to: "2026-11-09" })).length,
    3,
  );
  assert.equal(
    (await erList(base, { from: "2026-11-10", to: "2026-11-10" })).length,
    0,
  );
});
test("Older ER visits can be pinned and linked by authoritative VN with arrival time preserved", async () => {
  const base = Date.now() - 4 * 86400000;
  changeState((s) => {
    s.demoBase = base;
  });
  const p = await findErPatient(base, "DEMO002");
  assert.ok(p);
  await operate({ op: "pin", vn: p.vn, label: "untrusted name" });
  const c = (await snapshot()).cases.find((c) => c.vn === p.vn)!;
  assert.equal(c.label, p.name);
  assert.equal(c.times.door_in.t, p.door_in);
  await operate({ op: "discard", id: c.id });
  await operate({ op: "new" });
  const manual = readState().cases[0];
  await operate({ op: "link", id: manual.id, vn: p.vn });
  assert.equal(
    readState().cases.find((c) => c.id === manual.id)!.patient!.door_in,
    p.door_in,
  );
  assert.equal(await findErPatient(base, "UNKNOWN"), null);
  await assert.rejects(operate({ op: "pin", vn: "UNKNOWN" }), /ไม่พบ VN/);
});
