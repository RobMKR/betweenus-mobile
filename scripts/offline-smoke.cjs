// External network is blocked. Local preview assets remain reachable (no service worker claim).
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const origin = process.env.OFFLINE_TEST_URL || "http://localhost:8083";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const external = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(origin).origin)
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(
        "betweenus-auth-session",
        JSON.stringify({
          access_token: "expired",
          refresh_token: "must-not-be-used",
          expires_at: 1,
        }),
      );
      sessionStorage.setItem("seeded", "1");
    }
  });
  const tab = async (name) => {
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(origin);
  await button("Use offline — free").click();
  for (const name of ["Home", "People", "Vaults", "Settings"]) {
    const box = await page
      .getByRole("tab", { name, exact: true })
      .boundingBox();
    assert.ok(box.height >= 44 && box.y + box.height <= 932);
  }
  await button("Create vault").click();
  await page.getByLabel("Vault name", { exact: true }).fill("Friday football");
  await button("Permanent").click();
  await button("Save vault").click();
  await button("Add event expense").click();
  await page.getByLabel("Event title", { exact: true }).fill("Pitch booking");
  await page.getByLabel("Event date", { exact: true }).fill("2026-11-21");
  await page.getByLabel("Event total · AED", { exact: true }).fill("630");
  const roster = [
    "You",
    ...Array.from({ length: 13 }, (_, i) => `Player ${i + 1}`),
  ].join("\n");
  await page
    .getByLabel("Participants · one name per line", { exact: true })
    .fill(roster);
  await button("You (me)").click();
  await button("You paid").click();
  await button("Save event expense").click();
  await page.getByText("Owed to you · AED 585.00", { exact: true }).waitFor();
  await page.getByText(/14 equal shares. Your own share AED 45.00/).waitFor();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "/tmp/betweenus-tabs-event.png",
    fullPage: false,
  });
  await tab("Home");
  await tab("Vaults");
  await expect(button("Active vaults")).toBeVisible();
  await expect(page.getByText("Pitch booking", { exact: true })).toHaveCount(0);
  await page.getByText("Friday football", { exact: true }).click();
  await page.getByText("Pitch booking", { exact: true }).click();
  await tab("Vaults");
  await expect(button("Active vaults")).toBeVisible();
  await expect(button("‹ Back to vault")).toHaveCount(0);
  await page.getByText("Friday football", { exact: true }).click();
  await page.getByText("Pitch booking", { exact: true }).click();
  await button("Record payment · Player 1").click();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("46");
  await button("Save payment").click();
  await page.getByText(/Payment cannot exceed/).waitFor();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("20");
  await button("Save payment").click();
  await page.getByText("Owed to you · AED 565.00", { exact: true }).waitFor();
  await button("Record payment · Player 1").click();
  await button("Use full remaining · AED 25.00").click();
  await button("Save payment").click();
  await page.getByText("Owed to you · AED 540.00", { exact: true }).waitFor();
  await button("Undo payment").last().click();
  await page.getByText("Owed to you · AED 565.00", { exact: true }).waitFor();
  await button("Record payment · Player 1").click();
  await button("Use full remaining · AED 25.00").click();
  await button("Save payment").click();
  await page.getByText("Owed to you · AED 540.00", { exact: true }).waitFor();
  await button("‹ Back to vault").click();
  await button("Archive vault").click();
  await button("Reactivate vault").waitFor();
  await button("‹ Back to Vaults").click();
  await tab("Home");
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 540.00" })
    .waitFor();
  await tab("Vaults");
  await button("Archived vaults").click();
  await expect(
    page.getByText("Friday football", { exact: true }),
  ).toBeVisible();
  await tab("Vaults");
  await expect(page.getByText("Friday football", { exact: true })).toHaveCount(
    0,
  );
  await button("Archived vaults").click();
  await page.getByText("Friday football", { exact: true }).click();
  await button("Reactivate vault").click();
  await button("Add event expense").click();
  assert.equal(
    await page
      .getByLabel("Participants · one name per line", { exact: true })
      .inputValue(),
    roster,
  );
  await page.getByLabel("Event title", { exact: true }).fill("Next week");
  await page.getByLabel("Event total · AED", { exact: true }).fill("70");
  await button("Save event expense").click();
  await page.getByText("Owed to you · AED 65.00", { exact: true }).waitFor();
  await button("‹ Back to vault").click();
  await page.getByText("Event expenses · 2", { exact: true }).waitFor();
  await tab("Home");
  await button("+ Add debt").click();
  await button("I borrowed money").click();
  await page.getByLabel("Person's name", { exact: true }).fill("Sam");
  await page.getByLabel("Amount · AED", { exact: true }).fill("120.50");
  await page
    .getByLabel("Note · optional", { exact: true })
    .fill("A little help");
  await button("Save personal record").click();
  await tab("People");
  await page.getByText("Sam", { exact: true }).click();
  await page.getByText("You owe · AED 120.50", { exact: true }).waitFor();
  await page.getByText("A little help", { exact: true }).click();
  await button("Record repayment").click();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("20.25");
  await button("Save payment").click();
  await page.getByText("AED 100.25", { exact: true }).waitFor();
  await tab("Settings");
  await tab("People");
  await expect(button("Record repayment")).toHaveCount(0);
  await page.getByText("Sam", { exact: true }).click();
  await page.getByText("A little help", { exact: true }).click();
  await tab("People");
  await expect(button("‹ Back to person")).toHaveCount(0);
  await page.getByText("Sam", { exact: true }).click();
  await page.getByText("A little help", { exact: true }).click();
  await page.evaluate(() => {
    window.__restoreStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "betweenus.offline-ledger.v1")
        throw new DOMException("Device full", "QuotaExceededError");
      return window.__restoreStorageSetItem.call(this, key, value);
    };
  });
  await button("Undo payment").click();
  await page
    .getByText(/Not saved:.*Your last saved records are unchanged/)
    .waitFor();
  await page.getByText("AED 100.25", { exact: true }).waitFor();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__restoreStorageSetItem;
  });
  await button("Undo payment").click();
  await page.getByText("AED 120.50", { exact: true }).waitFor();
  await button("Record repayment").click();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("20.25");
  await button("Save payment").click();
  await button("‹ Back to person").click();
  await page.getByText("Personal records · 1", { exact: true }).waitFor();
  await button("‹ Back to People").click();
  await button("+ Add debt").click();
  await page.getByLabel("Person's name", { exact: true }).fill(" sam ");
  await page.getByLabel("Amount · AED", { exact: true }).fill("10");
  await button("Save personal record").click();
  await expect(page.getByText("sam", { exact: true })).toHaveCount(1);
  await page.getByText("sam", { exact: true }).click();
  await page.getByText("Personal records · 2", { exact: true }).waitFor();
  await page.getByText("Owed to you · AED 10.00", { exact: true }).waitFor();
  await page.getByText("You owe · AED 100.25", { exact: true }).waitFor();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "/tmp/betweenus-tabs-people.png",
    fullPage: false,
  });
  await tab("Home");
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 615.00" })
    .waitFor();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `no horizontal overflow ${width}`,
    );
    await page.screenshot({
      path: `/tmp/betweenus-tabs-home-${width}.png`,
      fullPage: false,
    });
  }
  await tab("Settings");
  await page.getByText("Storage & privacy", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/betweenus-tabs-settings.png",
    fullPage: false,
  });
  await button("Switch mode").click();
  await button("Use offline — free").click();
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 615.00" })
    .waitFor();
  await page.reload();
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 615.00" })
    .waitFor();
  await tab("People");
  await page.getByText("sam", { exact: true }).click();
  await page.getByText("Personal records · 2", { exact: true }).waitFor();
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS offline four tabs: football split/payments/undo, archive balances, multiple events, name grouping/directions, People and Vaults root taps and detail back, mode/reload persistence, failed-write retry, 320/430 no overflow, no external requests.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
