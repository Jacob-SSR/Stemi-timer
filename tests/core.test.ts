import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { blankCase, defaults, metrics, thaiDate } from "../src/lib/model";
process.env.STEMI_DEMO = "true";
process.env.STEMI_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "stemi-test-"));
const { hydrate, epoch, erList } = await import("../src/lib/hosxp");
const { operate, snapshot, operation } = await import("../src/lib/service");
const { readState, changeState } = await import("../src/lib/store");
const { csv, xlsx, word, powerpoint } = await import("../src/lib/export");
test("Thai dates and HOSxP timestamps do not depend on host timezone", () => {
  assert.equal(
    epoch("2026-11-09 00:00:00"),
    Date.parse("2026-11-08T17:00:00Z"),
  );
  assert.equal(thaiDate(Date.parse("2026-11-08T18:00:00Z")), "2026-11-09");
  assert.equal(epoch("0000-00-00 00:00:00"), null);
});
test("Needle uses actual manual administration, never the medication order timestamp", async () => {
  const base = Date.now() - 35 * 60000;
  const c = blankCase(Date.now());
  c.vn = "DEMO001";
  c.manual = {};
  let [h] = await hydrate([c], await erList(base), base);
  assert.notEqual(h.times.needle.hosxp, null);
  assert.equal(h.times.needle.t, null);
  assert.equal(metrics(h).needle, null);
  c.manual.needle = base + 29 * 60000;
  [h] = await hydrate([c], await erList(base), base);
  assert.equal(h.times.needle.src, "manual");
  assert.equal(metrics(h).needle, 29);
  h.sk = "no";
  assert.equal(metrics(h).needle, null);
});
test("Manual overrides preserve the HOSxP reference, clearing reverts to HOSxP", async () => {
  const base = Date.now() - 18 * 60000,
    c = blankCase(Date.now());
  c.vn = "DEMO001";
  c.manual = { ekg: base + 9 * 60000 };
  let [h] = await hydrate([c], await erList(base), base);
  assert.equal(h.times.ekg.t, c.manual.ekg);
  assert.notEqual(h.times.ekg.hosxp, c.manual.ekg);
  delete c.manual.ekg;
  [h] = await hydrate([c], await erList(base), base);
  assert.equal(h.times.ekg.src, "hosxp");
});
test("Server operations persist, validate, deduplicate, close authoritative data and reopen", async () => {
  const initial = await snapshot();
  assert.equal(initial.cases.length, 1);
  await assert.rejects(operate({ op: "pin", vn: "DEMO001" }), /มีเคสอยู่แล้ว/);
  await operate({ op: "new" });
  let s = await snapshot();
  const c = s.cases.find((c) => !c.vn)!;
  assert.ok(c.times.door_in.t);
  await assert.rejects(
    operate({ op: "stamp", id: c.id, key: "needle", t: Date.now() + 120000 }),
    /อนาคต/,
  );
  await assert.rejects(
    operate({
      op: "stamp",
      id: c.id,
      key: "ekg",
      t: c.times.door_in.t! - 60000,
    }),
    /ก่อน Door-in/,
  );
  await operate({ op: "link", id: c.id, vn: "DEMO002" });
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      operate({ op: "note", id: c.id, text: "note " + i, important: i === 0 }),
    ),
  );
  assert.equal(readState().cases.find((x) => x.id === c.id)?.notes.length, 8);
  await operate({ op: "set", id: c.id, field: "sk", value: "no" });
  await assert.rejects(operate({ op: "close", id: c.id }), /เหตุผล/);
  await operate({
    op: "set",
    id: c.id,
    field: "skReason",
    value: "แพทย์บันทึกเหตุผลตัวอย่าง",
  });
  await operate({ op: "close", id: c.id, snapshot: { label: "tampered" } });
  s = await snapshot();
  assert.equal(s.log.length, 1);
  assert.notEqual(s.log[0].label, "tampered");
  assert.equal(s.log[0].notes.length, 8);
  await assert.rejects(operate({ op: "close", id: c.id }), /ปิดแล้ว/);
  await operate({ op: "outcome", id: c.id, value: { result: "จำหน่าย" } });
  assert.equal(readState().log[0].outcome.result, "จำหน่าย");
  await operate({ op: "reopen", id: c.id });
  assert.equal(readState().log.length, 0);
  assert.ok(readState().cases.find((x) => x.id === c.id));
});
test("RCA completion requires root cause and an action; invalid targets cannot enter storage", () => {
  assert.equal(
    operation.safeParse({
      op: "rca",
      id: crypto.randomUUID(),
      value: {
        status: "done",
        severity: "A",
        date: "2026-11-09",
        summary: "",
        root: "",
        team: "",
        cdp: "",
        voices: "",
        factors: {},
        whys: [],
        actions: [],
      },
    }).success,
    false,
  );
  assert.equal(
    operation.safeParse({ op: "targets", value: { ekg: -1 } }).success,
    false,
  );
});
test("SQLite rolls back failed transactions", () => {
  const before = readState();
  assert.throws(() =>
    changeState((s) => {
      s.targets.ekg = 999;
      throw Error("rollback");
    }),
  );
  assert.deepEqual(readState(), before);
});

test("Active visits retain Door-in after leaving the 24-hour ER list", async () => {
  const base = Date.now() - 26 * 3600000;
  const [patient] = await erList(base);
  const c = blankCase(base);
  c.vn = patient.vn;
  c.patient = patient;
  c.manual = {};
  const [h] = await hydrate([c], [], base);
  assert.equal(h.times.door_in.t, patient.door_in);
  h.times.ekg.t = patient.door_in - 60000;
  assert.equal(metrics(h).ekg, null);
});
test("Exports create real Office packages, preserve Thai and guard CSV formula injection", async () => {
  const s = await snapshot(),
    c = s.cases[0];
  c.label = '=HYPERLINK("bad")';
  const text = csv([c]);
  assert.ok(text.startsWith("\ufeff"));
  assert.ok(text.includes("'=HYPERLINK"));
  for (const b of [
    await xlsx([c], defaults),
    await word(c, "refer"),
    await word(c, "rca"),
    await powerpoint(c),
  ]) {
    assert.equal(b.subarray(0, 2).toString(), "PK");
    assert.ok(b.length > 2000);
  }
});
