import { test, expect } from "@playwright/test";
import { thaiDate } from "../src/lib/model";
test("ER picker offers dates only, shows arrival timestamps and searches the selected days", async ({
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
  await page
    .getByRole("button", { name: "เลือกผู้ป่วยจาก HOSxP", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "เลือกผู้ป่วยจากห้องฉุกเฉิน",
  });
  await expect(dialog.getByLabel("ตั้งแต่วันที่", { exact: true })).toHaveValue(
    thaiDate(Date.now()),
  );
  await expect(dialog.getByLabel("ถึงวันที่", { exact: true })).toHaveValue(
    thaiDate(Date.now()),
  );
  await expect(
    dialog.locator('input[type="time"],input[type="datetime-local"]'),
  ).toHaveCount(0);
  await expect(dialog.locator(".arrival-time").first()).toContainText(
    /มาถึงโรงพยาบาล.*\d{2}:\d{2}:\d{2}/,
  );
  const before = await (await page.request.get("/api/stemi")).json();
  const future = thaiDate(Date.now() + 7 * 86400000);
  await dialog.getByLabel("ถึงวันที่", { exact: true }).fill(future);
  await dialog.getByLabel("ตั้งแต่วันที่", { exact: true }).fill(future);
  await expect(dialog.locator(".er-list>button")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "ค้นหาตามวันที่", exact: true })
    .click();
  await expect(
    dialog.getByText("ไม่พบผู้ป่วยที่ตรงกับคำค้น", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "วันนี้", exact: true }).click();
  await expect(dialog.locator(".arrival-time").first()).toBeVisible();
  await page.setViewportSize({ width: 375, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog
    .getByRole("button", { name: "ปิดหน้าต่าง", exact: true })
    .click();
  const after = await (await page.request.get("/api/stemi")).json();
  const saved = (state: typeof before) =>
    state.cases.map((c: { id: string; manual: unknown; notes: unknown }) => ({
      id: c.id,
      manual: c.manual,
      notes: c.notes,
    }));
  expect(saved(after)).toEqual(saved(before));
  const bad = await page.request.get(
    "/api/stemi?action=er&from=2026-02-30&to=2026-03-01",
  );
  expect(bad.status()).toBe(400);
});
