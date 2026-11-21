// Local web assets remain reachable; every external request is blocked and counted.
// This tests offline product behavior, not a service worker/browser cold offline boot.
const { chromium } = require("@playwright/test");
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
    if (!sessionStorage.getItem("test-seeded")) {
      localStorage.setItem(
        "betweenus-auth-session",
        JSON.stringify({
          access_token: "expired-account-token",
          refresh_token: "should-not-be-used",
          expires_at: 1,
        }),
      );
      sessionStorage.setItem("test-seeded", "1");
    }
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Use offline — free", exact: true })
    .click();
  await page
    .getByText("OFFLINE · FREE · DEVICE ONLY", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Vaults & events", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Create vault", exact: true })
    .click();
  await page.getByLabel("Vault name", { exact: true }).fill("Friday football");
  await page.getByRole("button", { name: "Permanent", exact: true }).click();
  await page.getByRole("button", { name: "Save vault", exact: true }).click();
  await page
    .getByRole("button", { name: "Add event expense", exact: true })
    .click();
  await page.getByLabel("Event title", { exact: true }).fill("Pitch booking");
  await page
    .getByLabel("Event date · YYYY-MM-DD", { exact: true })
    .fill("2026-11-21");
  await page.getByLabel("Event total · AED", { exact: true }).fill("630");
  const roster = [
    "You",
    ...Array.from({ length: 13 }, (_, i) => `Player ${i + 1}`),
  ].join("\n");
  await page
    .getByLabel("Participants · one name per line", { exact: true })
    .fill(roster);
  await page.getByRole("button", { name: "You (me)", exact: true }).click();
  await page.getByRole("button", { name: "You paid", exact: true }).click();
  await page
    .getByRole("button", { name: "Save event expense", exact: true })
    .click();
  await page.getByText("Owed to you · AED 585.00", { exact: true }).waitFor();
  await page.getByText(/14 equal shares. Your own share AED 45.00/).waitFor();
  assert.equal(
    await page
      .getByText("Share AED 45.00 · remaining to payer", { exact: true })
      .count(),
    13,
  );
  await page
    .getByText("Event details", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "/tmp/betweenus-football-event.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Record payment · Player 1", exact: true })
    .click();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("46");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await page.getByText(/Payment cannot exceed the remaining amount/).waitFor();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await page.getByText("Owed to you · AED 565.00", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Record payment · Player 1", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Use full remaining · AED 25.00",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await page.getByText("Owed to you · AED 540.00", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Undo payment", exact: true })
    .last()
    .click();
  await page.getByText("Owed to you · AED 565.00", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Record payment · Player 1", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Use full remaining · AED 25.00",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await page.getByText("Owed to you · AED 540.00", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 540.00" })
    .waitFor();
  await page
    .getByRole("button", { name: "Vaults & events", exact: true })
    .click();
  await page.getByText("Friday football", { exact: true }).click();
  await page
    .getByRole("button", { name: "Archive vault", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reactivate vault", exact: true })
    .waitFor();
  await page.getByLabel("Close details", { exact: true }).click();
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 540.00" })
    .waitFor();
  await page
    .getByRole("button", { name: "Archived vaults", exact: true })
    .click();
  await page.getByText("Friday football", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reactivate vault", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add event expense", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Participants · one name per line", { exact: true })
      .inputValue(),
    roster,
  );
  await page.getByLabel("Event title", { exact: true }).fill("Next week");
  await page
    .getByLabel("Event date · YYYY-MM-DD", { exact: true })
    .fill("2026-11-28");
  await page.getByLabel("Event total · AED", { exact: true }).fill("70");
  await page
    .getByRole("button", { name: "Save event expense", exact: true })
    .click();
  await page.getByText("Owed to you · AED 65.00", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "‹ Back to vault", exact: true })
    .click();
  await page.getByText("Event expenses · 2", { exact: true }).waitFor();
  await page.getByLabel("Close details", { exact: true }).click();
  await page
    .getByRole("button", { name: "Personal records", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add record", exact: true }).click();
  await page
    .getByRole("button", { name: "I borrowed money", exact: true })
    .click();
  await page.getByLabel("Person's name", { exact: true }).fill("Sam");
  await page.getByLabel("Amount · AED", { exact: true }).fill("120.50");
  await page
    .getByLabel("Note · optional", { exact: true })
    .fill("A little help");
  await page
    .getByRole("button", { name: "Save personal record", exact: true })
    .click();
  await page.getByText("Sam", { exact: true }).click();
  await page
    .getByRole("button", { name: "Record repayment", exact: true })
    .click();
  await page.getByLabel("Payment amount · AED", { exact: true }).fill("20.25");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await page.getByText("AED 100.25", { exact: true }).last().waitFor();
  await page.getByLabel("Close details", { exact: true }).click();
  await page.reload();
  await page.getByText("Sam", { exact: true }).waitFor();
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 605.00" })
    .waitFor();
  assert.ok((await page.getByText("AED 100.25", { exact: true }).count()) > 0);
  assert.deepEqual(
    external,
    [],
    "offline mode must not initialize auth or call external services",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: "/tmp/betweenus-offline-overview.png",
    fullPage: true,
  });
  console.log(
    "PASS: external network blocked; no auth requests; football630/14 own45 others585; overpay rejected; partial/full/undo persisted; archive retains balances; reusable vault multiple events; personal borrowing/repayment survives reload.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
