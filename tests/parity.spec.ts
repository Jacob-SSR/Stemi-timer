import { test, expect } from "@playwright/test";
import { clockValue, dateRange } from "../src/lib/workflow";
test("Original workflow extras: inline times, SK, all lab rows, quick notes, date presets and guarded history clear", async ({
  page,
}) => {
  await page.goto("/");
  if (process.env.TEST_ACCESS_TOKEN) {
    await page
      .getByLabel("รหัสเข้าใช้งาน", { exact: true })
      .fill(process.env.TEST_ACCESS_TOKEN);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
  }
  await expect(page.locator(".patient-strip")).toBeVisible();
  const api = page.request,
    state = await (await api.get("/api/stemi")).json(),
    c = state.cases.find((x: { vn: string }) => x.vn === "DEMO001");
  await page
    .locator(".case-tab")
    .filter({ hasText: "นายสมชาย ใจดี (ตัวอย่าง)" })
    .click();
  const md = page.getByLabel("เวลา แพทย์ตรวจ", { exact: true });
  await md.fill(clockValue(c.times.door_in.t + 9 * 60000));
  await md.blur();
  await expect(
    page.locator(".timeline-row").first().getByText("กดเอง", { exact: true }),
  ).toBeVisible();
  const sk = page.getByRole("group", { name: "การให้ SK ในลำดับเวลา" });
  await sk.getByRole("button", { name: "ไม่ให้ SK", exact: true }).click();
  await sk
    .getByLabel("เหตุผลที่ไม่ให้ SK ในลำดับเวลา")
    .selectOption("แพทย์พิจารณาไม่ให้");
  await expect(
    page.getByLabel("เวลา เริ่มให้ยาละลายลิ่มเลือด", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator(".lab-panel").getByRole("row").filter({ hasText: "CK-MB" }),
  ).toContainText("ยังไม่สั่ง");
  await expect(
    page.locator(".lab-panel").getByRole("row").filter({ hasText: "Cr" }),
  ).toContainText("ยังไม่สั่ง");
  await expect(
    page.locator(".lab-panel").getByRole("columnheader", { name: "Door → ผล" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "BP ต่ำ / ช็อก", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ญาติตัดสินใจช้า", exact: true })
    .click();
  await expect(page.getByLabel("ข้อความหมายเหตุ")).toHaveValue(
    "BP ต่ำ / ช็อก · ญาติตัดสินใจช้า",
  );
  await expect(
    page
      .locator(".note-form")
      .getByRole("checkbox", { name: "สำคัญ", exact: true }),
  ).toBeChecked();
  await page
    .locator(".note-form")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  const del = page.getByRole("button", {
    name: "ลบหมายเหตุ BP ต่ำ / ช็อก · ญาติตัดสินใจช้า",
    exact: true,
  });
  await expect(del).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await del.click();
  await expect(del).not.toBeVisible();
  const history = page.getByRole("region", {
    name: "เคสที่ปิดแล้ว",
    exact: true,
  });
  await expect(history).toBeVisible();
  await history
    .getByRole("button", { name: "เดือนที่แล้ว", exact: true })
    .click();
  await expect(history.getByLabel("ตั้งแต่", { exact: true })).toHaveValue(
    dateRange("previous").from,
  );
  await history.getByRole("button", { name: "ปีงบนี้", exact: true }).click();
  await expect(history.getByLabel("ตั้งแต่", { exact: true })).toHaveValue(
    dateRange("fiscal").from,
  );
  await history.getByRole("button", { name: "เดือนนี้", exact: true }).click();
  await expect(
    history.getByRole("columnheader", { name: "Door-out", exact: true }),
  ).toBeVisible();
  const created = await (
    await api.post("/api/stemi", { data: { op: "new" } })
  ).json();
  expect(
    (
      await api.post("/api/stemi", {
        data: { op: "close", id: created.cases[0].id },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "อัปเดตข้อมูล", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "ล้างประวัติ", exact: true }),
  ).toBeEnabled();
  const before = await (await api.get("/api/stemi")).json();
  expect(before.log.length).toBeGreaterThan(0);
  await history
    .getByRole("button", { name: "ล้างประวัติ", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "ล้างประวัติเคสที่ปิดแล้วทั้งหมด?",
  });
  await expect(
    dialog.getByRole("button", { name: "ยืนยันล้างประวัติ" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect((await (await api.get("/api/stemi")).json()).log).toEqual(before.log);
  await history
    .getByRole("button", { name: "ล้างประวัติ", exact: true })
    .click();
  await dialog.getByRole("textbox").fill("ล้างประวัติ");
  await dialog.getByRole("button", { name: "ยืนยันล้างประวัติ" }).click();
  await expect(dialog).not.toBeVisible();
  const after = await (await api.get("/api/stemi")).json();
  expect(after.log).toEqual([]);
  expect(after.cases.map((x: { id: string }) => x.id)).toEqual(
    before.cases.map((x: { id: string }) => x.id),
  );
  for (const width of [375, 768, 1440, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() => {
    document.body.dataset.printScope = "history";
  });
  await page.emulateMedia({ media: "print" });
  await expect(history).toBeVisible();
  await expect(page.locator(".patient-strip")).not.toBeVisible();
  await page.evaluate(() => {
    delete document.body.dataset.printScope;
  });
  await page.emulateMedia({ media: "screen" });
});
