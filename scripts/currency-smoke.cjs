// Exercise the auth-test export while blocking real network traffic.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium, expect } = require("@playwright/test");

const origin = process.env.CURRENCY_TEST_URL || "http://localhost:8134";
const output = process.env.CURRENCY_SCREENSHOTS || "/tmp/betweenus-currency";
const ledgerKey = "betweenus.offline-ledger.v1";
const owner = "11111111-1111-4111-8111-111111111111";
const now = "2026-11-28T00:00:00.000Z";
const reference = {
  baseCurrency: "USD",
  quoteCurrency: "AED",
  rate: "3.6725",
  source: "suggested",
  asOf: now,
};
const person = {
  id: "pat",
  name: "Pat",
  source: "custom",
  email: null,
  phone: null,
  createdAt: now,
};
const old = {
  id: "legacy",
  name: "Casey",
  direction: "lent",
  date: "2026-11-27",
  amountMinor: 40000,
  note: "Original train fare",
  payments: [{ id: "legacy-payment", amountMinor: 3275, createdAt: now }],
};

const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url"),
    "test-signature",
  ].join("."),
  refresh_token: "test-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: owner,
    email: "owner@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: now,
  },
};

function controls(page) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const field = (name) => page.getByLabel(name, { exact: true });
  return {
    button,
    field,
    tab: async (name) => {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("tab", { name, exact: true }).click();
    },
    async select(label, code) {
      await page
        .getByRole("button", { name: new RegExp(`^${label}, `) })
        .click();
      await field("Search currencies").fill(code);
      await page
        .getByRole("button", { name: new RegExp(`^${code} · `) })
        .click();
    },
    async screenshot(name, width, scheme) {
      await page.setViewportSize({ width, height: 884 });
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator("html")).toHaveCSS("color-scheme", scheme);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: join(output, `${name}-${scheme}-${width}.png`),
      });
    },
  };
}

async function offline(browser) {
  const page = await browser.newPage({
    viewport: { width: 320, height: 884 },
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });
  const denied = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    denied.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(
    ({ ledgerKey, old, person }) => {
      if (!localStorage.getItem(ledgerKey))
        localStorage.setItem(
          ledgerKey,
          JSON.stringify({
            version: 3,
            people: [person],
            records: [old],
            vaults: [],
          }),
        );
    },
    { ledgerKey, old, person },
  );

  const { button, field, tab, select, screenshot } = controls(page);
  await page.goto(origin);
  await button("Use offline — free").click();
  await expect(
    page.getByText("Incomplete total · Rate needed for AED"),
  ).toBeVisible();
  await expect(page.getByLabel("Offline receivable")).toHaveText("—");
  await expect(page.getByText("AED 367.25", { exact: true })).toBeVisible();
  await tab("Settings");
  await expect(button("Main currency, USD US Dollar")).toBeVisible();
  await button("Use USD/AED suggestion").click();
  await expect(field("1 USD = how many AED?")).toHaveValue("3.6725");
  await field("1 USD = how many AED?").fill("0");
  await button("Save rate").click();
  await expect(
    page.getByRole("alert").filter({ hasText: /positive rate/ }),
  ).toBeVisible();
  await field("1 USD = how many AED?").fill("3.6725");
  await button("Save rate").click();
  await expect(page.getByText("Suggested · As of 2026-11-28")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await screenshot("offline-settings", 320, "dark");
  await tab("Home");
  await expect(page.getByLabel("Offline receivable")).toHaveText("USD 100.00");

  await button("+ Add debt").click();
  await field("Person's name").fill("Jordan");
  await field("Amount · USD").fill("100");
  await button("Save personal record").click();
  await tab("Settings");
  await select("Main currency", "AED");
  await tab("Home");
  await expect(page.getByLabel("Offline receivable")).toHaveText("AED 734.50");
  await expect(page.getByText("≈ AED 367.25")).toBeVisible();
  await screenshot("offline-home", 390, "light");

  await tab("Settings");
  await select("Main currency", "RUB");
  await button("Add exchange rate").click();
  await field("1 USD = how many RUB?").fill("100");
  await button("Save rate").click();
  await button("Add exchange rate").click();
  await select("Base currency", "AED");
  await field("1 AED = how many RUB?").fill("25");
  await button("Save rate").click();
  await tab("Home");
  await expect(page.getByLabel("Offline receivable")).toHaveText(
    "RUB 19,181.25",
  );
  await expect(page.getByText("≈ RUB 9,181.25")).toBeVisible();
  await expect(page.getByText("≈ RUB 10,000.00")).toBeVisible();

  await button("Create vault").click();
  await field("Vault name").fill("Dinner");
  await select("Vault currency", "JPY");
  await page.getByRole("checkbox", { name: /^Pat/ }).click();
  await button("Save vault").click();
  await expect(page.getByText("Vault currency · JPY")).toBeVisible();
  await button("Change vault currency").click();
  await select("Vault currency", "BHD");
  await button("Save currency").click();
  await expect(page.getByText("Vault currency · BHD")).toBeVisible();
  await button("Add event expense").click();
  await field("Event title").fill("Dessert");
  await field("Total amount (BHD)").fill("1.001");
  await button("Next").click();
  await button("Next").click();
  await button("Save event").click();
  await expect(page.getByText("Owed to you · BHD 0.500")).toBeVisible();
  await button("‹ Back to vault").click();
  await expect(button("Change vault currency")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Offline receivable")).toHaveText(
    "RUB 19,181.25",
  );
  await expect(
    page.getByText("Incomplete total · Rate needed for BHD"),
  ).toBeVisible();
  const ledger = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ledgerKey,
  );
  assert.equal(ledger.version, 4);
  assert.deepEqual(
    ledger.records.find((record) => record.id === old.id),
    { ...old, currency: "AED" },
  );
  assert.equal(ledger.vaults[0].currency, "BHD");
  assert.equal(ledger.vaults[0].events[0].currency, "BHD");
  assert.deepEqual(denied, []);
  assert.deepEqual(errors, []);
  await page.close();
}

async function account(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 884 },
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });
  const errors = [],
    unexpected = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let settings = { mainCurrency: "USD", rates: [reference] };
  let failSave = false,
    failRead = false;
  const debt = {
    id: "existing-aed",
    lenderId: owner,
    borrowerId: "other",
    lenderEmail: "owner@example.com",
    borrowerEmail: "guest@example.com",
    amountMinor: 36725,
    currency: "AED",
    description: "Confirmed transport",
    status: "accepted",
    createdAt: now,
    history: [{ id: "accepted", action: "accepted", createdAt: now }],
  };
  const debts = [debt];
  let vault = {
    id: "vault",
    title: "Trip",
    kind: "permanent",
    archived: false,
    memberIds: [],
    eventCount: 0,
    currency: "JPY",
  };
  await page.addInitScript(
    ({ session, owner }) => {
      if (!sessionStorage.getItem("currency-test-seeded")) {
        localStorage.setItem("betweenus-auth-session", JSON.stringify(session));
        localStorage.setItem("betweenus.mode.v1", "account");
        localStorage.setItem(
          `betweenus.account-currency.v1.${owner}-other`,
          JSON.stringify({ mainCurrency: "BHD", rates: [] }),
        );
        sessionStorage.setItem("currency-test-seeded", "1");
      }
    },
    { session, owner },
  );
  await page.route("**/*", async (route) => {
    const target = new URL(route.request().url());
    const method = route.request().method();
    if (target.origin === origin) return route.continue();
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(data),
      });
    if (target.origin === "https://auth-test.supabase.co")
      return json(target.pathname.endsWith("/user") ? session.user : session);
    if (target.origin === "https://api-test.invalid") {
      if (method === "OPTIONS") return json({});
      switch (target.pathname) {
        case "/v1/me":
          return json({ id: owner, email: session.user.email });
        case "/v1/people":
          return json({ people: [person] });
        case "/v1/balances":
          return json({
            balances: [
              {
                currency: "AED",
                receivableMinor: 36725,
                payableMinor: 0,
                netMinor: 36725,
              },
            ],
          });
        case "/v1/vault-balances":
          return json({
            balances: [
              {
                currency: "USD",
                receivableMinor: 10000,
                payableMinor: 0,
                netMinor: 10000,
              },
            ],
          });
        case "/v1/currency-settings":
          if (method === "PUT") {
            if (failSave)
              return json({ error: "Temporary settings failure" }, 503);
            settings = route.request().postDataJSON();
          } else if (failRead) return json({ error: "Unavailable" }, 503);
          return json(settings);
        case "/v1/debts":
          if (method === "POST") {
            const input = route.request().postDataJSON();
            assert.equal(input.currency, "JPY");
            assert.equal(input.amountMinor, 120);
            debts.push({
              ...debt,
              ...input,
              id: "new-jpy",
              status: "pending",
              history: [],
            });
          }
          return json({ debts });
        case "/v1/vaults":
          return json({ vaults: [vault] });
        case "/v1/vaults/vault":
          return json({ vault, members: [], history: [] });
        case "/v1/vaults/vault/events":
          return json({ events: [] });
        case "/v1/vaults/vault/currency":
          assert.equal(method, "PATCH");
          vault = { ...vault, ...route.request().postDataJSON() };
          return json({ vault, members: [], history: [] });
      }
    }
    unexpected.push(target.href);
    return route.abort();
  });

  const { button, field, tab, select, screenshot } = controls(page);
  await page.goto(origin);
  await expect(page.getByText("≈ USD 100.00")).toBeVisible();
  await expect(page.getByLabel("Private vault receivable")).toHaveText(
    "Owed to you · USD 100.00",
  );
  await screenshot("account-home", 390, "light");
  await tab("Settings");
  failSave = true;
  await select("Main currency", "AED");
  await expect(page.getByText("Temporary settings failure")).toBeVisible();
  await expect(button("Main currency, USD US Dollar")).toBeVisible();
  failSave = false;
  await select("Main currency", "AED");
  await expect(button("Main currency, AED UAE Dirham")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await screenshot("account-settings", 320, "dark");

  await tab("Home");
  await button("Add debt").click();
  await field("Borrower email").fill("guest@example.com");
  await select("Debt currency", "JPY");
  await field("Amount in JPY").fill("120");
  await field("Description").fill("Original yen");
  await button("Send for confirmation").click();
  await expect(page.getByText("JPY 120")).toBeVisible();
  await expect(page.getByText("Rate needed for JPY → AED")).toBeVisible();
  await expect(
    page.getByText("Incomplete total · Rate needed for JPY"),
  ).toHaveCount(0);

  await tab("Vaults");
  await button("Open Trip").click();
  await expect(page.getByText("Vault currency · JPY")).toBeVisible();
  await button("Change vault currency").click();
  await select("Vault currency", "BHD");
  await button("Save currency").click();
  await expect(page.getByText("Vault currency · BHD")).toBeVisible();
  assert.equal(vault.currency, "BHD");

  failRead = true;
  await page.reload();
  await expect(
    page.getByText(
      "Account settings unavailable. Showing the last saved currency and rates on this device.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Private vault receivable")).toHaveText(
    "Owed to you · AED 367.25",
  );
  await tab("Settings");
  await expect(button("Main currency, AED UAE Dirham")).toBeDisabled();
  assert.deepEqual(settings, { mainCurrency: "AED", rates: [reference] });
  assert.deepEqual(debts[0], debt);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    await offline(browser);
    await account(browser);
    console.log(
      `PASS local currency persistence, precise converted totals, locked vault currency, account cache, failed saves, and four phone screenshots in ${output}`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
