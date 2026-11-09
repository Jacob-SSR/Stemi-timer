import { test, expect } from "@playwright/test";

test("Mint UI stays readable across phone, tablet and desktop; dialogs support keyboard and restore focus", async ({
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
  await expect(
    page.getByRole("heading", { name: "ติดตามการดูแลผู้ป่วย" }),
  ).toBeVisible();
  await expect(page.locator(".patient-strip")).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `width ${width}`,
    ).toBe(true);
    for (const target of [".step-info>b", ".field input", ".detail-block p"]) {
      expect(
        await page
          .locator(target)
          .first()
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(15);
    }
    const button = page.locator(".stamp-button").first();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(
      width <= 700 ? 44 : 40,
    );
    await expect(
      page.getByRole("button", { name: "ติดตามผู้ป่วย", exact: true }),
    ).toBeVisible();
  }
  const opener = page.getByRole("button", {
    name: "แก้เวลา แพทย์ตรวจ",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "แก้ไขเวลาที่บันทึก" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "เลือกผู้ป่วยจาก HOSxP", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "เลือกผู้ป่วยจากห้องฉุกเฉิน" }),
  ).toBeVisible();
  await expect(page.getByLabel("ค้นหาผู้ป่วยด้วยชื่อหรือ HN")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
