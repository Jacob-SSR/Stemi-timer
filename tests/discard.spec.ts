import { test, expect } from "@playwright/test";

test("Mistaken patient can be dismissed only after confirmation, without history or KPI entries", async ({
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
  const api = page.request;
  const start = await (await api.get("/api/stemi")).json();
  await page
    .getByRole("button", { name: "มาถึงก่อนลงทะเบียน", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ผู้ป่วยยังไม่ลงทะเบียน", exact: true }),
  ).toBeVisible();
  const current = await (await api.get("/api/stemi")).json();
  const c = current.cases.find(
    (x: { id: string }) =>
      !start.cases.some((a: { id: string }) => a.id === x.id),
  );
  const opener = page.getByRole("button", {
    name: "นำ ผู้ป่วยยังไม่ลงทะเบียน ออกจากหน้าติดตาม",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "ปิดรายการที่เลือกผิด?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("ผู้ป่วยยังไม่ลงทะเบียน · HN รอลงทะเบียน", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "กลับไปหน้าติดตาม", exact: true })
    .click();
  expect(
    (await (await api.get("/api/stemi")).json()).cases.some(
      (x: { id: string }) => x.id === c.id,
    ),
  ).toBe(true);
  await opener.click();
  await dialog
    .getByRole("button", { name: "ยืนยันนำออก", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).not.toBeVisible();
  const after = await (await api.get("/api/stemi")).json();
  expect(after.cases.some((x: { id: string }) => x.id === c.id)).toBe(false);
  expect(after.log).toEqual(start.log);
  expect(after.pending).toEqual(start.pending);
  await page.setViewportSize({ width: 375, height: 844 });
  const remove = page.locator(".remove-case-button").first();
  const box = await remove.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
