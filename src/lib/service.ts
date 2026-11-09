import { z } from "zod";
import { config } from "./config";
import { changeState, readState } from "./store";
import { erList, hydrate, serverNow, findErPatient } from "./hosxp";
import {
  blankCase,
  steps,
  type Case,
  type Snapshot,
  type TimeKey,
  inRange,
} from "./model";
const text = z.string().trim().max(4000);
const time = z.number().finite().min(0).max(4102444800000);
const timeKey = z.enum(["door_in", ...steps.map((s) => s[0])]);
const id = z.string().uuid();
const rca = z
  .object({
    status: z.enum(["draft", "done"]),
    severity: z.string().regex(/^[A-I]?$/),
    date: z.string().max(10),
    summary: text,
    root: text,
    team: text,
    cdp: text,
    voices: text,
    factors: z.record(z.string().max(30), text),
    whys: z.array(text).max(5),
    actions: z
      .array(
        z.object({
          text,
          owner: text,
          due: z.string().max(10),
          strength: z.enum(["strong", "intermediate", "weak"]),
          status: z.enum(["open", "done"]),
        }),
      )
      .max(30),
  })
  .refine(
    (r) =>
      r.status !== "done" ||
      (r.root.length > 0 && r.actions.some((a) => a.text.trim())),
    { message: "RCA เสร็จสิ้นต้องมีสาเหตุรากและมาตรการอย่างน้อย 1 ข้อ" },
  );
export const operation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("new") }),
  z.object({ op: z.literal("pin"), vn: z.string().min(1).max(30) }),
  z.object({ op: z.literal("link"), id, vn: z.string().min(1).max(30) }),
  z.object({ op: z.literal("stamp"), id, key: timeKey, t: time.nullable() }),
  z.object({
    op: z.literal("set"),
    id,
    field: z.enum([
      "label",
      "hn",
      "onset",
      "onsetUnknown",
      "arrive",
      "path",
      "dest",
      "sk",
      "skReason",
    ]),
    value: z.union([text, time, z.boolean(), z.null()]),
  }),
  z.object({
    op: z.literal("note"),
    id,
    text: z.string().trim().min(1).max(1000),
    important: z.boolean(),
  }),
  z.object({ op: z.literal("close"), id }),
  z.object({ op: z.literal("discard"), id }),
  z.object({ op: z.literal("note_remove"), id, noteId: id }),
  z.object({
    op: z.literal("clear_log"),
    confirm: z.literal("ล้างประวัติ"),
    expectedIds: z.array(id).max(50000),
  }),
  z.object({ op: z.literal("reopen"), id }),
  z.object({
    op: z.literal("refer"),
    id,
    value: z.record(z.string().max(50), text),
  }),
  z.object({
    op: z.literal("outcome"),
    id,
    value: z.record(z.string().max(50), text),
  }),
  z.object({ op: z.literal("rca"), id, value: rca }),
  z.object({
    op: z.literal("ekg"),
    id,
    value: z.object({
      report: text,
      impression: z.array(z.string().max(300)).max(6),
      urgency: z.enum(["critical", "urgent", "routine"]),
      model: z.string().max(100),
    }),
  }),
  z.object({
    op: z.literal("confirmEkg"),
    id,
    index: z.number().int().min(0).max(3),
  }),
  z.object({
    op: z.literal("targets"),
    value: z.record(z.string(), z.number().int().min(1).max(600)),
  }),
  z.object({
    op: z.literal("resend"),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
]);
export async function snapshot(): Promise<Snapshot> {
  const before = readState();
  const patients = await erList(before.demoBase);
  const now = await serverNow();
  changeState((s) => {
    for (const p of patients)
      if (
        p.stemi &&
        !s.dismissed.includes(p.vn) &&
        ![...s.cases, ...s.log].some((c) => c.vn === p.vn)
      ) {
        const c = blankCase(now);
        c.vn = p.vn;
        c.hn = p.hn;
        c.label = p.name;
        c.manual = {};
        c.patient = p;
        c.dest = config.hospitals[0];
        s.cases.push(c);
      }
  });
  const state = readState();
  return {
    ...state,
    cases: await hydrate(state.cases, patients, state.demoBase),
    demo: config.demo,
    serverNow: now,
    hospital: config.hospital,
    hospitals: config.hospitals,
    sheetEnabled: config.sheetEnabled,
    labNames: Object.keys(config.labItems),
  };
}
export async function operate(input: unknown) {
  const cmd = operation.parse(input);
  const before = readState();
  const selecting = cmd.op === "pin" || cmd.op === "link";
  const patients = selecting ? [] : await erList(before.demoBase);
  const chosenPatient = selecting
    ? await findErPatient(before.demoBase, cmd.vn)
    : null;
  const now = await serverNow();
  const hydrated =
    cmd.op === "close" || cmd.op === "stamp"
      ? await hydrate(before.cases, patients, before.demoBase)
      : [];
  changeState((s) => {
    if (cmd.op === "new") {
      const c = blankCase(now);
      c.dest = config.hospitals[0];
      s.cases.unshift(c);
      return;
    }
    if (cmd.op === "targets") {
      for (const [k, v] of Object.entries(cmd.value))
        if (k in s.targets) s.targets[k as keyof typeof s.targets] = v;
      return;
    }
    if (cmd.op === "resend") {
      if (cmd.from && cmd.to && cmd.from > cmd.to)
        throw new Error("ช่วงวันที่ไม่ถูกต้อง");
      s.pending = [
        ...new Set([
          ...s.pending,
          ...s.log
            .filter((c) => inRange(c, cmd.from || "", cmd.to || ""))
            .map((c) => c.id),
        ]),
      ];
      s.gsLastTry = 0;
      return;
    }
    if (cmd.op === "clear_log") {
      const expected = [...cmd.expectedIds].sort(),
        actual = s.log.map((c) => c.id).sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        throw new Error("ประวัติเปลี่ยนจากอีกจอ กรุณาตรวจสอบแล้วลองใหม่");
      s.dismissed = [
        ...new Set([
          ...s.dismissed,
          ...s.log.map((c) => c.vn).filter((v): v is string => !!v),
        ]),
      ];
      s.log = [];
      s.pending = [];
      s.gsError = "";
      return;
    }
    if (cmd.op === "pin") {
      const p = chosenPatient;
      if (!p) throw new Error("ไม่พบ VN ใน ER");
      if ([...s.cases, ...s.log].some((c) => c.vn === p.vn))
        throw new Error("VN นี้มีเคสอยู่แล้ว");
      const c = blankCase(now);
      Object.assign(c, {
        vn: p.vn,
        hn: p.hn,
        label: p.name,
        manual: {},
        patient: p,
        dest: config.hospitals[0],
      });
      s.cases.unshift(c);
      s.dismissed = s.dismissed.filter((vn) => vn !== p.vn);
      return;
    }
    const c = [...s.cases, ...s.log].find((c) => c.id === cmd.id);
    if (!c) throw new Error("ไม่พบเคส");
    if (
      c.closed &&
      !["reopen", "refer", "outcome", "rca", "ekg", "confirmEkg"].includes(
        cmd.op,
      )
    )
      throw new Error("เคสปิดแล้ว");
    if (cmd.op === "discard") {
      // Mistaken selections are removed, never archived as completed care.
      // Suppress automatic ICD re-addition until staff explicitly select this VN again.
      if (c.vn && !s.dismissed.includes(c.vn)) s.dismissed.push(c.vn);
      s.cases = s.cases.filter((x) => x.id !== c.id);
      s.pending = s.pending.filter((id) => id !== c.id);
    } else if (cmd.op === "note_remove") {
      if (!c.notes.some((n) => n.id === cmd.noteId))
        throw new Error("ไม่พบหมายเหตุ");
      c.notes = c.notes.filter((n) => n.id !== cmd.noteId);
    } else if (cmd.op === "link") {
      const p = chosenPatient;
      if (!p) throw new Error("ไม่พบ VN");
      if ([...s.cases, ...s.log].some((x) => x.id !== c.id && x.vn === cmd.vn))
        throw new Error("VN นี้ผูกเคสแล้ว");
      c.vn = p.vn;
      c.hn = p.hn;
      c.label = p.name;
      c.patient = p;
      s.dismissed = s.dismissed.filter((vn) => vn !== p.vn);
    } else if (cmd.op === "stamp") {
      if (cmd.t == null) {
        if (cmd.key === "door_in" && !c.patient)
          throw new Error("ผู้ป่วยยังไม่ผูก VN ต้องมีเวลา Door-in");
        delete c.manual[cmd.key];
      } else {
        if (cmd.t > now + 60000) throw new Error("ไม่สามารถบันทึกเวลาในอนาคต");
        const door = c.manual.door_in ?? c.patient?.door_in;
        if (cmd.key !== "door_in" && door && cmd.t < door)
          throw new Error("เวลาต้องไม่ก่อน Door-in");
        if (
          cmd.key === "door_in" &&
          steps.some(([k]) => {
            const t = hydrated.find((h) => h.id === c.id)?.times[k].t;
            return t != null && t < cmd.t!;
          })
        )
          throw new Error("Door-in ต้องไม่หลังขั้นตอนที่บันทึกแล้ว");
        c.manual[cmd.key] = cmd.t;
      }
    } else if (cmd.op === "set") {
      const f = cmd.field,
        v = cmd.value;
      if (f === "onset") {
        if (v !== null && typeof v !== "number")
          throw new Error("เวลาไม่ถูกต้อง");
        if (typeof v === "number" && v > now)
          throw new Error("Onset ต้องไม่อยู่ในอนาคต");
        c.onset = v;
      } else if (f === "onsetUnknown") {
        if (typeof v !== "boolean") throw new Error("ค่าไม่ถูกต้อง");
        c.onsetUnknown = v;
      } else {
        if (typeof v !== "string") throw new Error("ข้อความไม่ถูกต้อง");
        if (f === "path" && !["both", "lytic", "pci", "medical"].includes(v))
          throw new Error("แนวทางไม่ถูกต้อง");
        if (f === "sk" && !["", "yes", "no"].includes(v))
          throw new Error("ค่า SK ไม่ถูกต้อง");
        c[f] = v;
      }
    } else if (cmd.op === "note")
      c.notes.push({
        id: crypto.randomUUID(),
        t: now,
        text: cmd.text,
        important: cmd.important,
      });
    else if (cmd.op === "refer" || cmd.op === "outcome" || cmd.op === "rca") {
      if (cmd.op === "refer") c.refer = cmd.value;
      else if (cmd.op === "outcome") c.outcome = cmd.value;
      else c.rca = cmd.value;
      if (c.closed && config.sheetEnabled && !s.pending.includes(c.id))
        s.pending.push(c.id);
    } else if (cmd.op === "ekg") {
      c.ekgs.unshift({ ...cmd.value, t: now, confirmed: null });
      c.ekgs = c.ekgs.slice(0, 4);
      c.notes.push({
        id: crypto.randomUUID(),
        t: now,
        text: "AI อ่าน EKG (รอแพทย์ยืนยัน): " + cmd.value.impression.join("; "),
        important: cmd.value.urgency === "critical",
      });
    } else if (cmd.op === "confirmEkg") {
      if (!c.ekgs[cmd.index]) throw new Error("ไม่พบผล EKG");
      c.ekgs[cmd.index].confirmed = now;
      c.notes.push({
        id: crypto.randomUUID(),
        t: now,
        text: "แพทย์ยืนยันผล EKG",
        important: false,
      });
    } else if (cmd.op === "close") {
      const h = hydrated.find((x) => x.id === c.id);
      if (!h) throw new Error("เคสถูกเปลี่ยน กรุณาลองใหม่");
      // Reject stale snapshot rather than closing over another terminal's intervening edit.
      if (
        JSON.stringify(c) !==
        JSON.stringify(before.cases.find((x) => x.id === c.id))
      )
        throw new Error("ข้อมูลเปลี่ยนจากอีกจอ กรุณาลองใหม่");
      if (c.sk === "no" && !c.skReason.trim())
        throw new Error("กรุณาระบุเหตุผลที่ไม่ให้ SK");
      s.log.unshift({ ...h, closed: now });
      s.cases = s.cases.filter((x) => x.id !== c.id);
      if (config.sheetEnabled) s.pending.push(c.id);
    } else if (cmd.op === "reopen") {
      if (!c.closed) throw new Error("เคสยังเปิดอยู่");
      delete c.closed;
      s.log = s.log.filter((x) => x.id !== c.id);
      s.cases.unshift(c);
      s.pending = s.pending.filter((x) => x !== c.id);
    }
  });
}
