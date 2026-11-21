// Web fallback/calendar contract only. Does not claim native picker gesture verification.
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const origin = process.env.EVENT_DATE_TEST_URL || "http://localhost:8094";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    timezoneId: "Asia/Dubai",
  });
  const page = await context.newPage();
  const external = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(origin).origin)
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.clock.setFixedTime(new Date("2026-11-21T22:30:00Z"));
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(origin);
  await button("Use offline — free").click();
  await button("Create vault").click();
  await page.getByLabel("Vault name", { exact: true }).fill("Calendar test");
  await button("Permanent").click();
  await button("Save vault").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await button("Add event expense").click();
  const input = page.getByLabel("Event date", { exact: true });
  await expect(input).toHaveAttribute("type", "date");
  await expect(input).toHaveValue("2026-11-22");
  await input.click();
  await input.press("Escape");
  await expect(input).toHaveValue("2026-11-22");
  await expect(page.getByLabel("Event title", { exact: true })).toBeVisible();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    const bounds = await input.boundingBox();
    assert.ok(bounds.height >= 44);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `/tmp/betweenus-event-date-form-${width}.png`,
      fullPage: false,
    });
  }
  await input.fill("2020-03-29");
  await input.press("Escape");
  await expect(input).toHaveValue("2020-03-29");
  await page.getByLabel("Event title", { exact: true }).fill("Past event");
  await page.getByLabel("Total amount (AED)", { exact: true }).fill("10");
  await button("Next").click();
  await button("Next").click();
  await button("Save event").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("2020-03-29 · Paid by You", { exact: true }).waitFor();
  await button("‹ Back to vault").click();
  await button("Add event expense").click();
  await expect(input).toHaveValue("2026-11-22");
  await input.fill("2028-02-29");
  await page.getByLabel("Event title", { exact: true }).fill("Future event");
  await page.getByLabel("Total amount (AED)", { exact: true }).fill("10");
  await button("Next").click();
  await button("Next").click();
  await button("Save event").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("2028-02-29 · Paid by You", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("tab", { name: "Vaults", exact: true }).click();
  await page.getByText("Calendar test", { exact: true }).click();
  await page.getByText("Past event", { exact: true }).waitFor();
  const ledger = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")),
  );
  assert.deepEqual(
    ledger.vaults[0].events.map((e) => e.date),
    ["2020-03-29", "2028-02-29"],
  );
  assert.equal(Object.hasOwn(ledger.vaults[0], "date"), false);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS event date web: localDubai today differs fromUTC, dateinput>=44pt at320/430, dismiss/no-submit, past/future/leap persistence, independent new-event default, no vaultdate or externalcalls. Native picker interaction remains untested.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
