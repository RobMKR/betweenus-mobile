// Browser auth is mocked; every ledger operation uses an isolated loopback demo API.
// Never point this at production: it creates ephemeral sample records.
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const pageURL = process.env.WIZARD_ACCOUNT_URL || "http://localhost:8100";
const apiURL = process.env.WIZARD_DEMO_API_URL || "http://127.0.0.1:3002";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(apiURL).hostname))
  throw Error("Test API must be loopback");
const api = async (path, body, token = "demo-lender") => {
  const response = await fetch(apiURL + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
  return result;
};
const money = (value) =>
  `AED ${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
(async () => {
  const health = await api("/health");
  assert.equal(health.mode, "local-demo");
  assert.equal(health.storage, "ephemeral-memory");
  const run = Date.now(),
    title = `Account football ${run}`,
    people = [];
  for (let i = 1; i <= 13; i++)
    people.push(
      (
        await api("/v1/people", {
          name: `Player ${i}`,
          source: "custom",
          email: `player${i}.${run}@example.com`,
        })
      ).person,
    );
  const { vault } = await api("/v1/vaults", {
    title,
    kind: "permanent",
    memberIds: people.map((p) => p.id),
  });
  const { debt } = await api("/v1/debts", {
    borrowerEmail: "john@example.com",
    amountMinor: 5000,
    currency: "AED",
    description: `Confirmed baseline ${run}`,
  });
  await api(`/v1/debts/${debt.id}/accept`, {}, "demo-borrower");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } }),
    errors = [],
    external = [],
    nonces = { event: [], payment: [], undo: [] };
  page.on("pageerror", (error) => errors.push(error.message));
  const session = (email = "alex@example.com", suffix = "") => {
    const id = email.startsWith("john") ? "demo-john" : "demo-alex";
    return {
      access_token: [
        Buffer.from('{"alg":"HS256"}').toString("base64url"),
        Buffer.from(
          JSON.stringify({
            sub: id,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
        "sig" + suffix,
      ].join("."),
      refresh_token: "fake-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: {
        id,
        email,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      },
    };
  };
  await page.addInitScript((data) => {
    localStorage.setItem("betweenus.mode.v1", "account");
    if (!sessionStorage.getItem("seed")) {
      localStorage.setItem("betweenus-auth-session", JSON.stringify(data));
      sessionStorage.setItem("seed", "1");
    }
  }, session());
  let failEvent = true,
    failPayment = true,
    failBeforePayment = false,
    failUndo = true,
    holdList = false,
    heldList = null;
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === new URL(pageURL).origin) return route.continue();
    const fulfill = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization,content-type",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify(body),
      });
    if (url.origin === "https://auth-test.supabase.co") {
      const body = request.postDataJSON() || {};
      return fulfill(
        url.pathname.endsWith("/verify") ? session(body.email) : {},
      );
    }
    if (url.origin !== "https://api-test.invalid") {
      external.push(url.href);
      return route.abort();
    }
    if (request.method() === "OPTIONS") return fulfill({});
    const token = request.headers().authorization || "",
      id = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ).sub,
      persona = id === "demo-john" ? "demo-borrower" : "demo-lender",
      body = request.postDataJSON(),
      path = url.pathname;
    if (request.method() === "POST" && /\/payments$/.test(path)) {
      nonces.payment.push(body.clientRequestId);
      if (failBeforePayment) {
        failBeforePayment = false;
        return fulfill(
          { error: { message: "Simulated failure before payment commit" } },
          503,
        );
      }
    }
    const response = await fetch(apiURL + path, {
      method: request.method(),
      headers: {
        Authorization: `Bearer ${persona}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (
      holdList &&
      persona === "demo-lender" &&
      path === "/v1/vaults" &&
      request.method() === "GET"
    ) {
      heldList = { route, result, status: response.status };
      return;
    }
    if (
      request.method() === "POST" &&
      path === `/v1/vaults/${vault.id}/events`
    ) {
      nonces.event.push(body.clientRequestId);
      if (failEvent && response.ok) {
        failEvent = false;
        return fulfill(
          { error: { message: "Simulated event response loss after commit" } },
          503,
        );
      }
    }
    if (request.method() === "POST" && /\/payments$/.test(path)) {
      if (failPayment && response.ok) {
        failPayment = false;
        return fulfill(
          {
            error: { message: "Simulated payment response loss after commit" },
          },
          503,
        );
      }
    }
    if (request.method() === "POST" && path.endsWith("/undo")) {
      nonces.undo.push(body.clientRequestId);
      if (failUndo && response.ok) {
        failUndo = false;
        return fulfill(
          { error: { message: "Simulated undo response loss after commit" } },
          503,
        );
      }
    }
    return fulfill(result, response.status);
  });
  const b = (name) => page.getByRole("button", { name, exact: true }),
    field = (name) => page.getByLabel(name, { exact: true }),
    tab = async (name) => {
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("tab", { name, exact: true }).click();
    };
  await page.goto(pageURL);
  await tab("Vaults");
  await b(`Open ${title}`).click();
  async function draftPitchBooking() {
    await b("Add event expense").click();
    await field("Event title").fill("Pitch booking");
    await field("Event date").fill("2026-11-20");
    await field("Total amount (AED)").fill("630");
    await b("Next").click();
    await page.getByText("14 participants", { exact: true }).waitFor();
    await b("Next").click();
  }
  await draftPitchBooking();
  await page.evaluate(
    async (data) => {
      const channel = new BroadcastChannel("betweenus-auth-session");
      channel.postMessage({ event: "TOKEN_REFRESHED", session: data });
      await new Promise((resolve) => setTimeout(resolve, 150));
      channel.close();
    },
    session("alex@example.com", "refreshed"),
  );
  await page.getByText("Pitch booking", { exact: true }).waitFor();
  await b("Save event").click();
  await page
    .getByRole("dialog")
    .getByText(/Simulated event response loss/)
    .waitFor();
  await b("Cancel").click();
  await b("Refresh expenses").click();
  await b("Open event Pitch booking").waitFor();
  await expect(b("Add event expense")).toBeDisabled();
  await page.getByText("Expense save unconfirmed", { exact: true }).waitFor();
  await b("Retry event save").click();
  await b("Back to events").waitFor();
  let events = (await api(`/v1/vaults/${vault.id}/events`)).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].balance.receivableMinor, 58500);
  assert.equal(nonces.event.length, 2);
  assert.equal(nonces.event[0], nonces.event[1]);
  assert.match(nonces.event[0], /^[0-9a-f-]{36}$/);
  const eventId = events[0].id;
  await page.getByText(/Receivable AED 585.00 · Payable AED 0.00/).waitFor();
  await b("Record payment for Player 1").click();
  await field("Payment amount · AED").fill("46");
  await b("Save payment").click();
  await page
    .getByRole("dialog")
    .getByText(/positive amount no greater|remaining|cannot exceed/i)
    .last()
    .waitFor();
  await field("Payment amount · AED").fill("20");
  await b("Save payment").click();
  await page
    .getByRole("dialog")
    .getByText(/Simulated payment response loss/)
    .waitFor();
  await b("Close details").click();
  await b("Reload event").click();
  await page.getByText(/Receivable AED 565.00 · Payable AED 0.00/).waitFor();
  await page.getByText("Payment save unconfirmed", { exact: true }).waitFor();
  await expect(b("Record payment for Player 1")).toBeDisabled();
  await tab("Home");
  await tab("Vaults");
  await b(`Open ${title}`).click();
  await b("Open event Pitch booking").click();
  await b("Retry payment").click();
  await expect(b("Record payment for Player 1")).toBeEnabled();
  events = (await api(`/v1/vaults/${vault.id}/events`)).events;
  assert.equal(events[0].balance.receivableMinor, 56500);
  assert.equal(events[0].payments.length, 1);
  assert.equal(nonces.payment[0], nonces.payment[1]);
  assert.match(nonces.payment[0], /^[0-9a-f-]{36}$/);

  failBeforePayment = true;
  await b("Record payment for Player 1").click();
  await field("Payment amount · AED").fill("20");
  await b("Save payment").click();
  await page
    .getByRole("dialog")
    .getByText(/Simulated failure before payment commit/)
    .waitFor();
  assert.equal((await api(`/v1/events/${eventId}`)).event.payments.length, 1);
  await b("Retry payment").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.notEqual(nonces.payment[1], nonces.payment[2]);
  assert.equal(nonces.payment[2], nonces.payment[3]);
  events = (await api(`/v1/vaults/${vault.id}/events`)).events;
  assert.equal(events[0].payments.length, 2);
  assert.equal(events[0].balance.receivableMinor, 54500);

  await b("Record payment for Player 1").click();
  await b("Use full remaining").click();
  await expect(field("Payment amount · AED")).toHaveValue("5.00");
  await b("Save payment").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.notEqual(nonces.payment[3], nonces.payment[4]);
  let current = (await api(`/v1/events/${eventId}`)).event;
  assert.equal(current.balance.receivableMinor, 54000);
  const paymentId = current.payments[2].id;
  await b(`Undo payment ${paymentId}`).click();
  await page.getByText(/Simulated undo response loss/).waitFor();
  await b(`Undo payment ${paymentId}`).click();
  await expect(b(`Undo payment ${paymentId}`)).toHaveCount(0);
  current = (await api(`/v1/events/${eventId}`)).event;
  assert.equal(current.payments.length, 4);
  assert.equal(current.balance.receivableMinor, 54500);
  assert.equal(nonces.undo[0], nonces.undo[1]);
  await b("Back to events").scrollIntoViewIfNeeded();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `/tmp/betweenus-wizard-account-${width}.png`,
      fullPage: false,
    });
  }
  await page.reload();
  await tab("Vaults");
  await b(`Open ${title}`).click();
  await b("Open event Pitch booking").click();
  await page.getByText(/Receivable AED 545.00 · Payable AED 0.00/).waitFor();
  await b("Back to events").click();
  await b("Archive vault").click();
  await b("Reactivate vault").waitFor();
  assert.equal((await api(`/v1/vaults/${vault.id}`)).vault.archived, true);
  await expect(b("Add event expense")).toBeDisabled();
  await tab("Home");
  const privateBalance = (await api("/v1/vault-balances")).balances[0],
    confirmed = (await api("/v1/balances")).balances[0];
  await page
    .getByLabel("Private vault receivable", { exact: true })
    .filter({ hasText: money(privateBalance.receivableMinor) })
    .waitFor();
  assert.ok(confirmed.receivableMinor >= 5000);
  assert.ok(privateBalance.receivableMinor >= 54500);
  await tab("Vaults");
  await b(`Open ${title}`).click();
  await b("Reactivate vault").click();
  await b("Archive vault").waitFor();
  await expect(b("Add event expense")).toBeEnabled();
  await b("Add event expense").click();
  await field("Event title").fill("Manual sides");
  await field("Total amount (AED)").fill("100");
  await b("Next").click();
  for (let i = 3; i <= 13; i++)
    await page
      .getByRole("checkbox", {
        name: new RegExp(`^Player ${i}(?:,|$)`),
        checked: true,
      })
      .click();
  await page.getByRole("switch", { name: "Include me", exact: true }).uncheck();
  await b("Add a person").click();
  await field("Person name").fill(`Coach ${run}`);
  await b("Save person").click();
  await page
    .getByRole("checkbox", { name: `Coach ${run}`, exact: true })
    .waitFor();
  await b("Next").click();
  await page.getByRole("radio", { name: "Manual", exact: true }).click();
  await page.getByLabel(/^Player 1 share \(AED\)/).fill("40");
  await page.getByLabel(/^Player 2 share \(AED\)/).fill("60");
  await field(`Coach ${run} share (AED)`).fill("0");
  await expect(b("Save event")).toBeEnabled();
  await b("Save event").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText(/Receivable AED 100.00 · Payable AED 0.00/).waitFor();
  const savedEvents = (await api(`/v1/vaults/${vault.id}/events`)).events;
  assert.equal(savedEvents.length, 2);
  const manual = savedEvents.find((item) => item.title === "Manual sides");
  assert.equal(manual.splitMode, "manual");
  assert.equal(manual.payerId, "self");
  assert.equal(
    manual.participants.some((person) => person.isSelf),
    false,
  );
  assert.deepEqual(
    manual.participants.map((person) => person.shareMinor),
    [4000, 6000, 0],
  );
  assert.equal(
    savedEvents.find((item) => item.id === eventId).payments.length,
    4,
  );
  await b("Back to events").click();
  await draftPitchBooking();
  await b("Save event").click();
  await b("Back to events").waitFor();
  const identical = (await api(`/v1/vaults/${vault.id}/events`)).events.filter(
    (item) => item.title === "Pitch booking",
  );
  assert.equal(identical.length, 2);
  assert.equal(identical.find((item) => item.id !== eventId).totalMinor, 63000);
  assert.notEqual(nonces.event[0], nonces.event.at(-1));
  holdList = true;
  await tab("Home");
  await tab("Vaults");
  await expect.poll(() => !!heldList).toBe(true);
  await tab("Settings");
  await b("Sign out").click();
  await field("Email address").fill("john@example.com");
  await page.getByText("Email me a code", { exact: true }).click();
  await field("Email code").fill("123456");
  await page.getByText("Verify & sign in", { exact: true }).click();
  await tab("Vaults");
  await heldList.route.fulfill({
    status: heldList.status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(heldList.result),
  });
  await page.waitForTimeout(150);
  await expect(b(`Open ${title}`)).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS real loopback demo API account wizard:630/14→585, same-ownerrefresh, event/payment lost response reconciled after close, refresh and navigation, identical saves use fresh UUIDs, failed-before-commit and undo retry use same UUID exactly once, overpayblock, fullremaining, reload, archive/reactivate, manualzero/custom/externalselfpayer, privatevsconfirmedbalances, crossownerstaleresponseisolation,320/430. Authmocked; no realemails/productioncalls.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
