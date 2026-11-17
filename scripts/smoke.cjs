// Run against the local-demo API and a demo-enabled web build on localhost:8081.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8081");
  await page.getByText("LOCAL DEMO · VIEW AS").waitFor();
  await page.getByText("Add debt", { exact: true }).click();
  const description = `Browser dinner ${Date.now()}`;
  await page
    .getByLabel("Borrower email", { exact: true })
    .fill("john@example.com");
  await page.getByLabel("Amount in AED", { exact: true }).fill("500.00");
  await page.getByLabel("Description", { exact: true }).fill(description);
  await page.getByText("Send for confirmation", { exact: true }).click();
  await page.getByText(description, { exact: true }).waitFor();
  await page.getByText("John · borrower", { exact: true }).click();
  await page.getByText(description, { exact: true }).click();
  await page.getByText("Confirm debt", { exact: true }).click();
  await page.getByText("Confirmed by borrower", { exact: true }).waitFor();
  await page.getByLabel("Close", { exact: true }).click();
  await page
    .getByText("Debt details", { exact: true })
    .waitFor({ state: "hidden" });
  await page.getByText("Alex · lender", { exact: true }).click();
  await page.getByText(description, { exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "/tmp/betweenus-mobile-overview.png",
    fullPage: true,
  });
  const lender = await fetch("http://localhost:3001/v1/debts", {
    headers: { Authorization: "Bearer demo-lender" },
  }).then((r) => r.json());
  const created = lender.debts.find((d) => d.description === description);
  assert.equal(created.status, "accepted");
  assert.equal(created.amountMinor, 50000);
  await page.getByText("Add debt", { exact: true }).click();
  const disputedDescription = `Browser groceries ${Date.now()}`;
  await page
    .getByLabel("Borrower email", { exact: true })
    .fill("john@example.com");
  await page.getByLabel("Amount in AED", { exact: true }).fill("27.50");
  await page
    .getByLabel("Description", { exact: true })
    .fill(disputedDescription);
  await page.getByText("Send for confirmation", { exact: true }).click();
  await page.getByText(disputedDescription, { exact: true }).waitFor();
  await page.getByText("John · borrower", { exact: true }).click();
  await page.getByText(disputedDescription, { exact: true }).click();
  await page
    .getByLabel("Dispute reason", { exact: true })
    .fill("We split this equally; please check the amount.");
  await page.getByText("Flag for resolution", { exact: true }).click();
  await page.getByText("Flagged for resolution", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser create AED 500, borrower confirmation, lender overview, second debt dispute, no page errors. Screenshot /tmp/betweenus-mobile-overview.png",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
