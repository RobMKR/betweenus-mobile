// All Supabase and debt API traffic is intercepted: this script sends no email.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const origin = process.env.AUTH_TEST_URL || "http://localhost:8082";
const authOrigin = "https://auth-test.supabase.co";
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
const jwt = (id) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
const session = (email) => ({
  access_token: jwt(email.startsWith("alice") ? userA : userB),
  refresh_token: "mock-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: email.startsWith("alice") ? userA : userB,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
});
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let otpRequests = 0,
    refreshRequests = 0;
  let heldRoute = null;
  let holdDebts = false;
  let failLogout = false;
  await page.route(`${authOrigin}/auth/v1/**`, async (route) => {
    const req = route.request(),
      url = req.url(),
      body = req.postDataJSON() || {};
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.includes("/otp")) {
      otpRequests++;
      return json({});
    }
    if (url.includes("/verify")) {
      if (body.token !== "123456")
        return json(
          { msg: "Token has expired or is invalid", error_code: "otp_expired" },
          403,
        );
      return json(session(body.email));
    }
    if (url.includes("/token")) {
      refreshRequests++;
      return json(session("alice@example.com"));
    }
    if (url.includes("/logout"))
      return failLogout ? json({ msg: "Network unavailable" }, 500) : json({});
    if (url.includes("/user")) return json(session("alice@example.com").user);
    throw new Error(`Unexpected auth request ${url}`);
  });
  await page.route("https://api-test.invalid/v1/**", async (route) => {
    const url = route.request().url(),
      bearer = route.request().headers().authorization || "";
    const alice = bearer.includes(jwt(userA));
    const json = (data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.endsWith("/me"))
      return json({
        id: alice ? userA : userB,
        email: alice ? "alice@example.com" : "bob@example.com",
      });
    if (url.endsWith("/balances"))
      return json({
        balances: [
          {
            currency: "AED",
            receivableMinor: alice ? 50000 : 0,
            payableMinor: 0,
            netMinor: alice ? 50000 : 0,
          },
        ],
      });
    if (url.endsWith("/debts")) {
      if (holdDebts && alice) {
        heldRoute = route;
        return;
      }
      return json({
        debts: alice
          ? [
              {
                id: "alice-debt",
                lenderId: userA,
                borrowerId: userB,
                lenderEmail: "alice@example.com",
                borrowerEmail: "bob@example.com",
                amountMinor: 50000,
                currency: "AED",
                description: "Alice private debt",
                status: "accepted",
                createdAt: "2026-01-01",
                history: [],
              },
            ]
          : [],
      });
    }
    throw new Error(`Unexpected API request ${url}`);
  });
  await page.goto(origin);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("Alice@example.com");
  await page.getByText("Email me a code", { exact: true }).click();
  await page.getByLabel("Email code", { exact: true }).fill("000000");
  await page.getByText("Verify & sign in", { exact: true }).click();
  await page
    .getByText("Token has expired or is invalid", { exact: true })
    .waitFor();
  await page.getByLabel("Email code", { exact: true }).fill("123456");
  await page.getByText("Verify & sign in", { exact: true }).click();
  await page.getByText("Alice private debt", { exact: true }).waitFor();
  assert.equal(otpRequests, 1);
  await page.reload();
  await page.getByText("Alice private debt", { exact: true }).waitFor();
  assert.equal(
    otpRequests,
    1,
    "reload restores persisted session without another email",
  );
  await page.evaluate(() => {
    const key = "betweenus-auth-session";
    const stored = JSON.parse(localStorage.getItem(key));
    stored.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  await page.getByText("Alice private debt", { exact: true }).waitFor();
  assert.ok(refreshRequests >= 1, "expired session refreshes");
  holdDebts = true;
  await page.reload();

  // /me remains gated by the held aggregate request, but sign-out stays available.
  failLogout = true;
  await page.getByText("Sign out", { exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).waitFor();
  await page.waitForFunction(
    () => !localStorage.getItem("betweenus-auth-session"),
  );
  await page.evaluate(async (staleSession) => {
    const channel = new BroadcastChannel("betweenus-auth-session");
    channel.postMessage({ event: "TOKEN_REFRESHED", session: staleSession });
    await new Promise((resolve) => setTimeout(resolve, 100));
    channel.close();
  }, session("alice@example.com"));
  await page.waitForTimeout(200);
  assert.equal(
    await page.getByText("Sign out", { exact: true }).count(),
    0,
    "failed signout blocks stale refresh event",
  );
  failLogout = false;
  await page
    .getByLabel("Email address", { exact: true })
    .fill("bob@example.com");
  await page.getByText("Email me a code", { exact: true }).click();
  await page.getByLabel("Email code", { exact: true }).fill("123456");
  await page.getByText("Verify & sign in", { exact: true }).click();
  await page.getByText("bob@example.com", { exact: true }).waitFor();
  assert.ok(heldRoute, "old account request was held");
  await heldRoute.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      debts: [
        {
          id: "leak",
          lenderId: userA,
          borrowerId: userB,
          lenderEmail: "alice@example.com",
          borrowerEmail: "bob@example.com",
          amountMinor: 99900,
          currency: "AED",
          description: "STALE ALICE RESPONSE",
          status: "accepted",
          createdAt: "2026-01-01",
          history: [],
        },
      ],
    }),
  });
  await page.waitForTimeout(250);
  assert.equal(
    await page.getByText("STALE ALICE RESPONSE", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("Alice private debt", { exact: true }).count(),
    0,
  );
  await page.getByText("Sign out", { exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: "/tmp/betweenus-email-signin.png",
    fullPage: true,
  });
  console.log(
    "PASS mocked email OTP: wrong code, success, persistence, expired-session refresh, sign-out cleanup, account isolation with stale request. No real emails sent.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
