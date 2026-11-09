import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { config } from "@/lib/config";
import { readState } from "@/lib/store";
import { snapshot, operate } from "@/lib/service";
import { erList, diagnostics } from "@/lib/hosxp";
import { flushSheets } from "@/lib/sheets";
import { csv, xlsx, word, powerpoint } from "@/lib/export";
import { inRange } from "@/lib/model";
import { parseErDates } from "@/lib/er-dates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(req: NextRequest) {
  if (!config.demo && !config.accessToken)
    throw new Error("กรุณาตั้ง STEMI_ACCESS_TOKEN ก่อนเปิดใช้ข้อมูลจริง");
  return (
    !config.accessToken ||
    same(req.cookies.get("stemi_session")?.value || "", config.accessToken)
  );
}
function file(data: string | Buffer, type: string, name: string) {
  return new Response(
    new Uint8Array(typeof data === "string" ? Buffer.from(data) : data),
    {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
function fail(e: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error:
        e instanceof ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : e instanceof Error
            ? e.message
            : "เกิดข้อผิดพลาด",
    },
    { status: 400 },
  );
}
export async function GET(req: NextRequest) {
  try {
    if (!authorized(req))
      return NextResponse.json(
        { error: "กรุณาใส่รหัสเข้าใช้งาน" },
        { status: 401 },
      );
    const q = req.nextUrl.searchParams,
      action = q.get("action") || "state";
    if (action === "diag")
      return NextResponse.json(await diagnostics(readState().demoBase));
    if (action === "er") {
      const range = parseErDates(q.get("from"), q.get("to"));
      const list = await erList(readState().demoBase, range);
      return NextResponse.json({
        list: list.slice(0, 300),
        hasMore: list.length > 300,
        range,
      });
    }
    if (action === "state") {
      await flushSheets();
      return NextResponse.json(await snapshot());
    }
    const s = await snapshot(),
      cases = s.log.filter(
        (c) =>
          inRange(c, q.get("from") || "", q.get("to") || "") &&
          (!q.get("path") ||
            q.get("path") === "all" ||
            c.path === q.get("path")) &&
          (!q.get("search") ||
            `${c.label} ${c.hn} ${c.vn}`
              .toLowerCase()
              .includes(q.get("search")!.toLowerCase())),
      );
    if (action === "csv")
      return file(csv(cases), "text/csv; charset=utf-8", "stemi-report.csv");
    if (action === "xlsx")
      return file(
        await xlsx(cases, s.targets),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "stemi-report.xlsx",
      );
    const c = [...s.cases, ...s.log].find((c) => c.id === q.get("id"));
    if (!c) throw new Error("ไม่พบเคส");
    if (action === "docx")
      return file(
        await word(c, q.get("kind") || "summary"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "stemi-" + (q.get("kind") || "summary") + ".docx",
      );
    if (action === "pptx")
      return file(
        await powerpoint(c),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "stemi-rca.pptx",
      );
    return NextResponse.json({ error: "ไม่พบคำสั่ง" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    // Next may canonicalize req.nextUrl to localhost; validate the browser origin against
    // the actual Host header instead. Reverse proxy must preserve Host (see deploy config).
    if (origin && new URL(origin).host !== req.headers.get("host"))
      return NextResponse.json({ error: "Origin ไม่ถูกต้อง" }, { status: 403 });
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 256000) throw new Error("ข้อมูลใหญ่เกินไป");
    const body = JSON.parse(raw);
    if (body.op === "login") {
      if (!config.demo && !config.accessToken)
        throw new Error("กรุณาตั้ง STEMI_ACCESS_TOKEN");
      if (
        typeof body.token !== "string" ||
        !same(body.token, config.accessToken)
      )
        return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 401 });
      const res = NextResponse.json({ ok: true });
      res.cookies.set("stemi_session", config.accessToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 12 * 3600,
      });
      return res;
    }
    if (!authorized(req))
      return NextResponse.json(
        { error: "กรุณาใส่รหัสเข้าใช้งาน" },
        { status: 401 },
      );
    await operate(body);
    if (body.op === "close" || body.op === "resend") await flushSheets(true);
    return NextResponse.json(await snapshot());
  } catch (e) {
    return fail(e);
  }
}
