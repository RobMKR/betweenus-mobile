// Run against a locally served npm run export:auth-test build.
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const url = process.env.APPEARANCE_URL || "http://localhost:8132";
const output =
  process.env.APPEARANCE_SCREENSHOTS || "/tmp/betweenus-appearance";
const appearanceKey = "betweenus.appearance.v1";
const ledgerKey = "betweenus.offline-ledger.v1";
const authKey = "betweenus-auth-session";
const localData = {
  version: 2,
  people: ["Alex", "Blake"].map((name) => ({
    id: name.toLowerCase(),
    name,
    source: "custom",
    email: null,
    phone: null,
    createdAt: "2026-01-01T00:00:00Z",
  })),
  records: [],
  vaults: [
    {
      id: "training",
      title: "Training",
      kind: "permanent",
      archived: false,
      memberIds: ["alex", "blake"],
      events: [],
    },
  ],
};
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: "11111111-1111-4111-8111-111111111111",
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "test-signature",
  ].join("."),
  refresh_token: "test-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "sample@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 780 },
      colorScheme: "dark",
      isMobile: true,
      hasTouch: true,
    });
    const unexpected = [];
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", async (route) => {
      const target = new URL(route.request().url());
      if (target.origin === new URL(url).origin) return route.continue();
      const fulfill = (data) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (target.origin === "https://auth-test.supabase.co") {
        return fulfill(
          target.pathname.endsWith("/user") ? session.user : session,
        );
      }
      if (target.origin === "https://api-test.invalid") {
        const payloads = {
          "/v1/me": { id: session.user.id, email: session.user.email },
          "/v1/people": { people: [] },
          "/v1/debts": { debts: [] },
          "/v1/currency-settings": { mainCurrency: "USD", rates: [] },
          "/v1/balances": { balances: [] },
          "/v1/vault-balances": { balances: [] },
          "/v1/vaults": { vaults: [] },
        };
        if (route.request().method() === "OPTIONS") return fulfill({});
        if (target.pathname in payloads)
          return fulfill(payloads[target.pathname]);
      }
      unexpected.push(target.href);
      return route.abort();
    });
    await page.addInitScript(
      ({ key, seed }) => {
        if (!sessionStorage.getItem("appearance-test-seeded")) {
          localStorage.setItem(key, JSON.stringify(seed));
          sessionStorage.setItem("appearance-test-seeded", "1");
        }
      },
      { key: ledgerKey, seed: localData },
    );

    const button = (name) => page.getByRole("button", { name, exact: true });
    const field = (name) => page.getByLabel(name, { exact: true });
    const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
    const stored = (key) =>
      page.evaluate((key) => localStorage.getItem(key), key);
    const sheet = page.getByRole("dialog");
    async function scheme(value) {
      await expect(page.locator("html")).toHaveCSS("color-scheme", value);
      await expect(page.locator("html")).toHaveCSS(
        "background-color",
        value === "dark" ? "rgb(16, 27, 23)" : "rgb(247, 248, 243)",
      );
    }
    const appearance = (name) =>
      page
        .getByRole("group", { name: "Appearance" })
        .getByRole("button", { name, exact: true });
    async function selected(label) {
      await expect(appearance(label)).toHaveAttribute("aria-pressed", "true");
    }
    async function screenshot(name) {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Horizontal overflow in ${name}`,
      );
      await page.screenshot({
        path: join(output, name + ".png"),
        animations: "disabled",
      });
    }

    await page.goto(url);
    await expect(button("Use offline — free")).toBeVisible();
    await scheme("dark");
    await screenshot("selector-dark-320");
    await button("Use offline — free").click();
    await tab("Settings");
    await selected("System");
    await tab("People");
    await button("+ Add person").click();
    await expect(sheet).toBeVisible();
    await screenshot("offline-person-dark-320");
    await button("Close details").click();
    await tab("Vaults");
    await page.getByText("Training", { exact: true }).click();
    await button("Manage members").click();
    await expect(sheet).toBeVisible();
    await screenshot("offline-roster-dark-320");
    await button("Close details").click();
    await button("Add event expense").click();
    await field("Event title").fill("Practice");
    await field("Event date").fill("2028-02-29");
    await field("Total amount (AED)").fill("100");
    await page.getByRole("switch", { name: "Partial payments" }).check();
    await page.emulateMedia({ colorScheme: "light" });
    await scheme("light");
    await expect(field("Event title")).toHaveValue("Practice");
    await expect(field("Event date")).toHaveValue("2028-02-29");
    await expect(field("Total amount (AED)")).toHaveValue("100");
    await expect(field("Event date")).toHaveCSS("color-scheme", "light");
    await screenshot("offline-event-date-light-320");
    await button("Next").click();
    await page.getByRole("switch", { name: "Include me" }).uncheck();
    await expect(
      page.getByRole("checkbox", { name: "Alex", exact: true }),
    ).toBeChecked();
    await button("Next").click();
    await screenshot("offline-equal-light-320");
    await page.getByRole("radio", { name: "Manual", exact: true }).click();
    await field("Alex share (AED)").fill("40");
    await field("Blake share (AED)").fill("60");
    await page.emulateMedia({ colorScheme: "dark" });
    await scheme("dark");
    await expect(field("Alex share (AED)")).toHaveValue("40");
    await expect(field("Blake share (AED)")).toHaveValue("60");
    await screenshot("offline-manual-dark-320");
    await button("Save event").click();
    await expect(sheet).toBeHidden();
    await page
      .getByRole("button", { name: "Record payment · Alex", exact: true })
      .click();
    await field("Payment amount · AED").fill("10");
    await screenshot("offline-payment-dark-320");
    await button("Save payment").click();
    await expect(sheet).toBeHidden();
    const savedLedger = await stored(ledgerKey);
    assert.equal(JSON.parse(savedLedger).vaults[0].events[0].title, "Practice");
    assert.equal(
      JSON.parse(savedLedger).vaults[0].events[0].payments.alex[0].amountMinor,
      1000,
    );
    await tab("Settings");
    await appearance("Light").click();
    await selected("Light");
    await scheme("light");
    await screenshot("offline-settings-light-320");
    assert.equal(await stored(appearanceKey), "light");

    await page.evaluate((key) => {
      const setItem = Storage.prototype.setItem;
      window.restoreAppearanceWrite = () => {
        Storage.prototype.setItem = setItem;
      };
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new Error("Storage unavailable");
        return setItem.call(this, name, value);
      };
    }, appearanceKey);
    await appearance("Dark").click();
    await expect(page.getByRole("alert")).toHaveText(
      /Appearance could not be saved/,
    );
    await selected("Light");
    await scheme("light");
    assert.equal(await stored(appearanceKey), "light");
    assert.equal(await stored(ledgerKey), savedLedger);
    await screenshot("offline-storage-failure-light-320");
    await page.evaluate(() => window.restoreAppearanceWrite());
    await appearance("Dark").focus();
    await page.keyboard.press("Space");
    await selected("Dark");
    await scheme("dark");
    await page.reload();
    await scheme("dark");
    await tab("Settings");
    await selected("Dark");
    await button("Switch mode").click();

    await page.setViewportSize({ width: 430, height: 932 });
    await button("Use account mode").click();
    await expect(field("Email address")).toBeVisible();
    await screenshot("account-signin-dark-430");
    await page.evaluate(
      ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key: authKey, session },
    );
    await page.reload();
    await tab("Settings");
    await selected("Dark");
    const savedAuth = await stored(authKey);
    assert.ok(savedAuth);
    await appearance("System").click();
    await selected("System");
    await scheme("dark");
    await screenshot("account-settings-dark-430");
    await tab("People");
    await tab("Vaults");
    await tab("Home");
    await button("Add debt").click();
    await field("Borrower email").fill("friend@example.com");
    await page.emulateMedia({ colorScheme: "light" });
    await scheme("light");
    await expect(field("Borrower email")).toHaveValue("friend@example.com");
    await screenshot("account-debt-light-430");
    await page.emulateMedia({ colorScheme: "dark" });
    await scheme("dark");
    await expect(field("Borrower email")).toHaveValue("friend@example.com");
    await screenshot("account-debt-dark-430");
    await button("Close").click();
    await tab("Settings");
    await appearance("Light").click();
    await scheme("light");
    await screenshot("account-settings-light-430");
    assert.equal(await stored(authKey), savedAuth);
    assert.equal(await stored(ledgerKey), savedLedger);
    await page.evaluate(
      (key) => localStorage.setItem(key, "invalid"),
      appearanceKey,
    );
    await page.reload();
    await scheme("dark");
    await tab("Settings");
    await selected("System");
    assert.equal(await stored(appearanceKey), "invalid");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "Appearance smoke passed at 320px offline and 430px mock account.",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
