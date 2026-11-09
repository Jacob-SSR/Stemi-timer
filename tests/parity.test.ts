import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { dateRange, timestampFromClock } from "../src/lib/workflow";
process.env.STEMI_DEMO = "true";
process.env.STEMI_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "stemi-parity-"),
);
const { operate, snapshot } = await import("../src/lib/service");
const { readState, changeState } = await import("../src/lib/store");

test("Date presets use Thai date, previous-month boundaries and October fiscal year", () => {
  const t = Date.parse("2026-11-09T08:00:00+07:00");
  assert.deepEqual(dateRange("month", t), {
    from: "2026-11-01",
    to: "2026-11-09",
  });
  assert.deepEqual(dateRange("previous", t), {
    from: "2026-10-01",
    to: "2026-10-31",
  });
  assert.deepEqual(dateRange("fiscal", t), {
    from: "2026-10-01",
    to: "2026-11-09",
  });
  assert.deepEqual(
    dateRange("fiscal", Date.parse("2026-09-30T23:00:00+07:00")),
    { from: "2025-10-01", to: "2026-09-30" },
  );
  assert.deepEqual(
    dateRange("previous", Date.parse("2024-03-01T00:00:00+07:00")),
    { from: "2024-02-01", to: "2024-02-29" },
  );
  assert.deepEqual(dateRange("all", t), { from: "", to: "" });
});
test("Clock editing chooses the nearest day across midnight and rejects invalid clocks", () => {
  const t = Date.parse("2026-11-09T00:04:00+07:00");
  assert.equal(
    timestampFromClock("23:59:30", t),
    Date.parse("2026-11-08T23:59:30+07:00"),
  );
  assert.equal(
    timestampFromClock("00:03", t),
    Date.parse("2026-11-09T00:03:00+07:00"),
  );
  assert.equal(timestampFromClock("25:60", t), null);
  assert.equal(timestampFromClock("", t), null);
});
test("Deleting a note uses its stable ID, removes important flags and leaves other notes intact", async () => {
  await operate({ op: "new" });
  const c = readState().cases[0];
  await operate({ op: "note", id: c.id, text: "remove this", important: true });
  await operate({ op: "note", id: c.id, text: "keep this", important: false });
  const note = readState().cases[0].notes[0];
  await operate({ op: "note_remove", id: c.id, noteId: note.id });
  assert.deepEqual(
    readState().cases[0].notes.map((n) => n.text),
    ["keep this"],
  );
  const before = readState();
  await assert.rejects(
    operate({ op: "note_remove", id: c.id, noteId: note.id }),
    /ไม่พบหมายเหตุ/,
  );
  assert.deepEqual(readState(), before);
});
test("Google Sheet resend queues only the requested dates and rejects inverted ranges", async () => {
  for (let i = 0; i < 3; i++) {
    await operate({ op: "new" });
    await operate({ op: "close", id: readState().cases[0].id });
  }
  changeState((s) => {
    s.pending = [];
    for (let i = 0; i < 3; i++) {
      s.log[i].times.door_in.t = Date.parse(
        ["2026-10-31", "2026-11-09", "2026-12-01"][i] + "T12:00:00+07:00",
      );
    }
  });
  await operate({ op: "resend", from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(readState().pending, [readState().log[1].id]);
  const before = readState();
  await assert.rejects(
    operate({ op: "resend", from: "2026-12-01", to: "2026-11-01" }),
    /ช่วงวันที่/,
  );
  assert.deepEqual(readState(), before);
});
test("Clear history requires typed confirmation and unchanged IDs, preserves active cases and suppresses re-add", async () => {
  const auto = (await snapshot()).cases.find((c) => c.vn === "DEMO001")!;
  await operate({ op: "close", id: auto.id });
  const before = readState(),
    ids = before.log.map((c) => c.id);
  await assert.rejects(
    operate({ op: "clear_log", confirm: "wrong", expectedIds: ids }),
  );
  await assert.rejects(
    operate({ op: "clear_log", confirm: "ล้างประวัติ", expectedIds: [] }),
    /ประวัติเปลี่ยน/,
  );
  assert.deepEqual(readState(), before);
  await operate({ op: "clear_log", confirm: "ล้างประวัติ", expectedIds: ids });
  assert.equal(readState().log.length, 0);
  assert.deepEqual(readState().pending, []);
  assert.deepEqual(readState().cases, before.cases);
  assert.equal(
    (await snapshot()).cases.some((c) => c.vn === "DEMO001"),
    false,
  );
});
