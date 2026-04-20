import { test, expect } from "@playwright/test";

test("console boots and renders the prototype shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Atlas 1 \u2014 Life Console");

  // Brand mark is present in the chrome
  await expect(page.locator("#brandMark")).toHaveText("ATLAS\u00B71");

  // Statusline shows the level readout
  const statusline = page.locator("#statusline");
  await expect(statusline).toContainText("LVL");
  await expect(statusline).toContainText("17");

  // Nav tabs present
  const nav = page.locator("#screenNav");
  for (const label of ["boot", "home", "health", "projects", "hobbies", "settings"]) {
    await expect(nav.locator('button[data-scr]:has-text("' + label + '")')).toBeVisible();
  }

  // Home screen is on by default
  await expect(page.locator("#scr-home")).toHaveClass(/on/);

  // Bootstrap log fired
  const messages: string[] = [];
  page.on("console", (msg) => messages.push(msg.text()));
  await page.reload();
  await page.waitForTimeout(500);
  expect(messages.some((m) => m.includes("Atlas 1 \u00B7 v0.1.0 \u00B7 booted"))).toBeTruthy();
});
