import { test, expect } from "@playwright/test";

/** F04 — config code: save / load / share. */

const KRABBE = "/no/configurator?design=krabbe&step=2";
const B1 = "/no/configurator?design=blomster-1&step=2";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("AC2/AC4: the code reflects the design and starts with MK-", async ({
  page,
}) => {
  await page.goto(B1);
  await expect(page.getByTestId("config-code-bar")).toBeVisible();
  await expect(page.getByTestId("config-code")).toHaveText(/^MK-A(-[A-Z2-9]+)+$/);
});

test("AC4: copy code → change config → paste → identical reconstruction", async ({
  page,
}) => {
  await page.goto(KRABBE);
  await page.getByTestId("category-colors").getByRole("radio").nth(5).click();
  await expect(page).toHaveURL(/opt_colors=/);
  const code = await page.getByTestId("config-code").innerText();
  expect(code).toMatch(/^MK-D-/);

  // go to a different design (config differs), then paste the saved code
  await page.goto(B1);
  await expect(page.getByTestId("config-code")).not.toHaveText(code);
  await page.getByTestId("paste-input").fill(code);
  await page.getByTestId("paste-apply").click();

  await expect(page).toHaveURL(/design=krabbe/);
  await expect(page.getByTestId("config-code")).toHaveText(code); // identical
});

test("AC4: copy buttons write to the clipboard", async ({ page }) => {
  await page.goto(B1);
  await page.getByTestId("copy-code").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^MK-A-/);

  await page.getByTestId("copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/configurator");
  expect(link).toContain("design=");
});

test("AC3: an invalid code shows a gentle error, no crash", async ({ page }) => {
  await page.goto(B1);
  await page.getByTestId("paste-input").fill("MK-ZZZ-9-9");
  await page.getByTestId("paste-apply").click();
  await expect(page.getByTestId("paste-error")).toBeVisible();
  // the page is still alive and the code bar still renders
  await expect(page.getByTestId("config-code")).toBeVisible();
});

test("AC4: deep link reconstructs the configuration", async ({ page }) => {
  // pick a colour, capture the URL, reopen it fresh
  await page.goto(KRABBE);
  await page.getByTestId("category-colors").getByRole("radio").nth(4).click();
  await expect(page).toHaveURL(/opt_colors=/);
  const code = await page.getByTestId("config-code").innerText();
  const url = page.url();

  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("config-code")).toHaveText(code);
});

test("AC5/AC6 (mobile): code bar usable, no overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto(B1);
  await expect(page.getByTestId("config-code-bar")).toBeVisible();
  await page.getByTestId("paste-input").fill("MK-A-C-D");
  await page.getByTestId("paste-apply").click();
  await expect(page).toHaveURL(/opt_/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
