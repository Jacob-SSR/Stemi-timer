import { test, expect } from "@playwright/test";
test("ER can stamp, save notes, close a case, record follow-up and download Office exports", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  const label = "ผู้ป่วยทดสอบ Browser " + Date.now();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  if (process.env.TEST_ACCESS_TOKEN) {
    expect((await request.get("/api/stemi")).status()).toBe(401);
    await page
      .getByLabel("รหัสเข้าใช้งาน", { exact: true })
      .fill(process.env.TEST_ACCESS_TOKEN);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
  }
  const api = page.request;
  await expect(
    page.getByRole("heading", { name: "ติดตามการดูแลผู้ป่วย" }),
  ).toBeVisible();
  await expect(
    page.getByText("กรุณาใส่รหัสเข้าใช้งาน", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("นายสมชาย ใจดี (ตัวอย่าง)").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "มาถึงก่อนลงทะเบียน", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ผู้ป่วยยังไม่ลงทะเบียน", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "ชื่อ / ป้ายกำกับ", exact: true })
    .fill(label);
  await page
    .getByRole("textbox", { name: "ชื่อ / ป้ายกำกับ", exact: true })
    .blur();
  await expect(
    page.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "บันทึกตอนนี้", exact: true })
    .first()
    .click();
  await expect(
    page.locator(".timeline-row").first().getByText("กดเอง", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "แก้เวลา แพทย์ตรวจ", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "แก้ไขเวลาที่บันทึก" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "บันทึกเวลา", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByPlaceholder("บันทึกอาการ การดูแล หรือข้อมูลสำคัญ…")
    .fill("ทดสอบจากเบราว์เซอร์");
  await page
    .locator(".note-form")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await expect(
    page.getByText("ทดสอบจากเบราว์เซอร์", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ปิดเคส", exact: true }).click();
  await page.getByRole("button", { name: "ยืนยันปิดเคส", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "ทบทวนสาเหตุและการดูแล (RCA)" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await page
    .getByRole("button", { name: "เคสที่ปิดแล้ว", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "ผลหลังส่งต่อ", exact: true }).click();
  await page
    .getByRole("textbox", { name: "วินิจฉัยสุดท้าย", exact: true })
    .fill("STEMI");
  await page
    .getByRole("textbox", { name: "ผลการรักษา / สถานะ", exact: true })
    .fill("จำหน่าย");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const state = await (await api.get("/api/stemi")).json();
  const c = state.log.find((c: { label: string }) => c.label === label);
  expect(c.outcome.result).toBe("จำหน่าย");
  for (const action of ["xlsx", "docx", "pptx", "csv"]) {
    const res = await api.get(`/api/stemi?action=${action}&id=${c.id}`);
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(100);
  }
  await page
    .getByRole("button", { name: "สรุปผลการดูแล", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมคุณภาพการดูแล" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "ติดตามผู้ป่วย", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(
    (
      await api.post("/api/stemi", {
        headers: { Origin: "https://untrusted.example" },
        data: { op: "new" },
      })
    ).status(),
  ).toBe(403);
});
