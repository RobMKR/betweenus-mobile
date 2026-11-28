// Saved People UI + storage/API boundaries. All external requests intercepted or blocked.
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const offlineURL = process.env.PEOPLE_OFFLINE_URL || "http://localhost:8095",
  accountURL = process.env.PEOPLE_ACCOUNT_URL || "http://localhost:8096";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } }),
    external = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(offlineURL).origin)
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const legacy = {
    version: 1,
    records: [
      {
        id: "old",
        name: "Sam",
        direction: "lent",
        amountMinor: 10000,
        date: "2020-02-29",
        note: "Legacy loan",
        payments: [],
      },
    ],
    vaults: [
      {
        id: "old-vault",
        title: "Legacy archive",
        kind: "temporary",
        archived: true,
        events: [],
      },
    ],
  };
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem("seed")) {
      localStorage.setItem("betweenus.mode.v1", "offline");
      localStorage.setItem("betweenus.offline-ledger.v1", JSON.stringify(data));
      sessionStorage.setItem("seed", "1");
    }
  }, legacy);
  const tab = async (name) => {
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("tab", { name, exact: true }).click();
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(offlineURL);
  await expect(page.getByLabel("Offline receivable")).toHaveText("—");
  await expect(
    page.getByText("Incomplete total · Rate needed for AED"),
  ).toBeVisible();
  await expect(page.getByText("AED 100.00", { exact: true })).toBeVisible();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")).version,
    ),
    1,
    "loading legacy does not eagerly rewrite",
  );
  await tab("People");
  await button("+ Add person").click();
  await button("Choose phone contact").click();
  await page
    .getByText(
      /Phone Contacts.*unavailable|Phone contact selection.*available|custom entry/i,
    )
    .first()
    .waitFor();
  await page.getByLabel("Person name", { exact: true }).fill("Sam");
  await page
    .getByLabel("Email · optional", { exact: true })
    .fill("SAM@example.com");
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "betweenus.offline-ledger.v1") throw Error("Device full");
      return window.__setItem.call(this, key, value);
    };
  });
  await button("Save person").click();
  await page
    .getByText(/Not saved:/)
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")).version,
    ),
    1,
  );
  await page.evaluate(() => (Storage.prototype.setItem = window.__setItem));
  await button("Save person").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("sam@example.com", { exact: true }).waitFor();
  await button("Add debt for this person").click();
  await expect(page.getByLabel("Person's name", { exact: true })).toHaveValue(
    "Sam",
  );
  await page.getByLabel("Amount · USD", { exact: true }).fill("10");
  await page
    .getByLabel("Note · optional", { exact: true })
    .fill("Explicitly linked loan");
  await button("Save personal record").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Explicitly linked loan", { exact: true }).click();
  await button("Record repayment").click();
  await page.getByLabel("Payment amount · USD", { exact: true }).fill("5");
  await button("Save payment").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await button("‹ Back to person").click();
  await page.getByText("Owed to you · USD 5.00", { exact: true }).waitFor();
  await button("‹ Back to People").click();
  await button("+ Add person").click();
  await page.getByLabel("Person name", { exact: true }).fill("Sam");
  await button("Save person").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Owed to you · USD 0.00", { exact: true }).waitFor();
  await tab("People");
  await expect(button("+ Add person")).toBeVisible();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `/tmp/betweenus-saved-people-${width}.png`,
      fullPage: false,
    });
  }
  await page.reload();
  const disk = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")),
  );
  assert.equal(disk.version, 4);
  assert.equal(disk.people.length, 2);
  assert.notEqual(disk.people[0].id, disk.people[1].id);
  assert.deepEqual(
    disk.records.find((r) => r.id === "old"),
    { ...legacy.records[0], currency: "AED" },
  );
  assert.equal(disk.records.filter((r) => r.personId).length, 1);
  assert.equal(disk.vaults[0].archived, true);
  assert.deepEqual(external, []);
  const account = await browser.newPage({
    viewport: { width: 430, height: 932 },
  });
  account.on("pageerror", (e) => errors.push(e.message));
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  const jwt = (id) =>
    [
      Buffer.from('{"alg":"HS256"}').toString("base64url"),
      Buffer.from(
        JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url"),
      "sig",
    ].join(".");
  const session = (email) => ({
    access_token: jwt(email.startsWith("alice") ? owner : other),
    refresh_token: "mock-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: email.startsWith("alice") ? owner : other,
      email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01",
    },
  });
  await account.addInitScript((data) => {
    localStorage.setItem("betweenus.mode.v1", "account");
    if (!sessionStorage.getItem("seed")) {
      localStorage.setItem("betweenus-auth-session", JSON.stringify(data));
      sessionStorage.setItem("seed", "1");
    }
  }, session("alice@example.com"));
  const people = [];
  let heldCreate = null;
  let holdCreate = true;
  let hold = false,
    held = null,
    fail = false;
  await account.route("https://auth-test.supabase.co/auth/v1/**", (route) => {
    const url = route.request().url(),
      body = route.request().postDataJSON() || {};
    const result = url.includes("/verify") ? session(body.email) : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await account.route("https://api-test.invalid/v1/**", (route) => {
    const req = route.request(),
      url = req.url(),
      id = JSON.parse(
        Buffer.from(
          req.headers().authorization.split(".")[1],
          "base64url",
        ).toString(),
      ).sub;
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.endsWith("/me"))
      return json({
        id,
        email: id === owner ? "alice@example.com" : "bob@example.com",
      });
    if (url.endsWith("/debts")) return json({ debts: [] });
    if (url.endsWith("/currency-settings"))
      return json({ mainCurrency: "USD", rates: [] });
    if (url.endsWith("/vault-balances")) return json({ balances: [] });
    if (url.endsWith("/balances")) return json({ balances: [] });
    if (url.endsWith("/people")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), ["email", "name", "source"]);
        assert.equal(body.email, "borrower@example.com");
        const person = {
          id: "33333333-3333-4333-8333-333333333333",
          ...body,
          phone: null,
          createdAt: new Date().toISOString(),
        };
        people.push(person);
        if (holdCreate) {
          heldCreate = { route, person };
          return;
        }
        return json({ person }, 201);
      }
      if (id === owner && hold) {
        held = route;
        return;
      }
      if (fail)
        return json({ error: { message: "Directory unavailable" } }, 503);
      return json({ people: id === owner ? people : [] });
    }
    throw Error("Unexpected API request " + url);
  });
  const ab = (name) => account.getByRole("button", { name, exact: true });
  const at = async (name) => {
    await account.getByRole("dialog").waitFor({ state: "hidden" });
    await account.getByRole("tab", { name, exact: true }).click();
  };
  let refreshNumber = 0;
  const refreshSameOwner = async () => {
    const next = session("alice@example.com");
    next.access_token += `refresh${++refreshNumber}`;
    await account.evaluate(async (data) => {
      const channel = new BroadcastChannel("betweenus-auth-session");
      channel.postMessage({ event: "TOKEN_REFRESHED", session: data });
      await new Promise((resolve) => setTimeout(resolve, 150));
      channel.close();
    }, next);
  };
  await account.goto(accountURL);
  await at("People");
  await ab("+ Add person").click();
  await account.getByLabel("Person name", { exact: true }).fill("Account Sam");
  await account
    .getByLabel("Email · optional", { exact: true })
    .fill("BORROWER@example.com");
  await refreshSameOwner();
  await expect(account.getByLabel("Person name", { exact: true })).toHaveValue(
    "Account Sam",
  );
  await expect(
    account.getByLabel("Email · optional", { exact: true }),
  ).toHaveValue("BORROWER@example.com");
  await ab("Save person").click();
  await expect.poll(() => !!heldCreate).toBe(true);
  await refreshSameOwner();
  await heldCreate.route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ person: heldCreate.person }),
  });
  holdCreate = false;
  await account.getByRole("dialog").waitFor({ state: "hidden" });
  await account.getByText("borrower@example.com", { exact: true }).waitFor();
  await ab("Add debt for this person").click();
  await expect(
    account.getByLabel("Borrower email", { exact: true }),
  ).toHaveValue("borrower@example.com");
  await account.getByLabel("Close", { exact: true }).click();
  await account.getByRole("dialog").waitFor({ state: "hidden" });
  await at("Home");
  await ab("Add debt").click();
  await expect(
    account.getByLabel("Borrower email", { exact: true }),
  ).toHaveValue("");
  await account.getByLabel("Close", { exact: true }).click();
  await at("People");
  await expect(ab("+ Add person")).toBeVisible();
  await ab("Open saved person Account Sam, borrower@example.com").click();
  await at("People");
  await expect(ab("+ Add person")).toBeVisible();
  await account.screenshot({
    path: "/tmp/betweenus-saved-people-account.png",
    fullPage: false,
  });
  fail = true;
  await account.reload();
  await at("People");
  await account.getByText("Directory unavailable", { exact: true }).waitFor();
  fail = false;
  await ab("Retry saved people").click();
  await ab("Open saved person Account Sam, borrower@example.com").waitFor();
  hold = true;
  await account.reload();
  await expect.poll(() => !!held).toBe(true);
  await at("Settings");
  await ab("Sign out").click();
  await account
    .getByLabel("Email address", { exact: true })
    .fill("bob@example.com");
  await account.getByText("Email me a code", { exact: true }).click();
  await account.getByLabel("Email code", { exact: true }).fill("123456");
  await account.getByText("Verify & sign in", { exact: true }).click();
  await at("People");
  await held.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ people }),
  });
  await account.waitForTimeout(150);
  assert.equal(
    await account.getByText("Account Sam", { exact: true }).count(),
    0,
    "late prior-owner directory response is isolated",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS saved People offline/account: v1migrationdurability, same-nameIDs, legacyseparation, explicitdebtlink/payment, contactwebfallback, failedwrite/retry, APIprivacy/ownerretry/stalesessionisolation,320/430. Nativecontactsphysicaluntested.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
