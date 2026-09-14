import { test, expect } from "@playwright/test";
import { loginAdmin, HAS_ADMIN } from "./helpers";

/**
 * Evidence only (not a gate): the orders list takes the window width and the
 * ITEMS cell is no longer clamped. Shot at the three DoD widths — 1280 is where
 * the change bites, 768 and 375 are there to prove nothing moved below md,
 * where the table is `hidden md:block` and the mobile card never clamped.
 */
test.skip(!HAS_ADMIN, "needs ADMIN_EMAIL/ADMIN_PASSWORD");

const DIR = "docs/evidence/r4-admin-wide";

test("orders list: wide shell, unclamped items", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAdmin(page);
  await page.goto("/admin");
  await page.getByTestId("admin-orders").waitFor();

  // the shell no longer caps the main column at 1040
  const mainWidth = await page
    .locator("main")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(mainWidth, "main should exceed the old 1040 cap at 1280").toBeGreaterThan(1040);

  // nothing in the ITEMS cells is cut off any more
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="order-row"] td:nth-child(3)')]
      .filter((td) => td.scrollHeight > td.clientHeight + 1).length
  );
  expect(clipped, "no ITEMS cell may be vertically clipped").toBe(0);

  await page.screenshot({ path: `${DIR}/orders-1280.png`, fullPage: false });

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    await page.getByTestId("admin-orders").waitFor();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${width}px: horizontal overflow`).toBeLessThanOrEqual(clientWidth);
    await page.screenshot({ path: `${DIR}/orders-${width}.png`, fullPage: false });
  }
});
