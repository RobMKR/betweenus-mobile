// Focused issue9 regression: fake configuration and intercepted auth only; no real email.
// Serve npm run export:auth-test output dist-auth at8092, and a production export
// with Supabase public variables unset/empty (EXPO_NO_DOTENV=1) at8093.
// Override AUTH_RETURN_URL / AUTH_CONFIG_MISSING_URL when using other ports.
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const authURL = process.env.AUTH_RETURN_URL || "http://localhost:8092";
const missingURL =
  process.env.AUTH_CONFIG_MISSING_URL || "http://localhost:8093";
const authOrigin = "https://auth-test.supabase.co";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const page = await context.newPage();
  let mockEmails = 0;
  const errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (
      new URL(url).origin === new URL(authURL).origin ||
      new URL(url).origin === new URL(missingURL).origin
    )
      return route.continue();
    if (url === `${authOrigin}/auth/v1/otp`) {
      mockEmails++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    }
    unexpected.push(url);
    return route.abort();
  });
  const button = () =>
    page.getByRole("button", { name: "Back to mode selection", exact: true });
  async function checkTarget() {
    const box = await button().boundingBox();
    assert.ok(
      box && box.height >= 44 && box.width >= 44 && box.y >= 0,
      "return control is visible with44pt target",
    );
    const hit = await button().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    });
    assert.ok(hit, "return control receives taps at its center");
  }
  await page.goto(authURL);
  await page
    .getByRole("button", { name: "Use account mode", exact: true })
    .click();
  await page.getByLabel("Email address", { exact: true }).waitFor();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
    await checkTarget();
    await page.screenshot({
      path: `/tmp/betweenus-account-return-${width}.png`,
      fullPage: false,
    });
  }
  await button().click();
  await page
    .getByRole("button", { name: "Use offline — free", exact: true })
    .waitFor();
  assert.equal(mockEmails, 0, "return before email causes no email request");
  await page
    .getByRole("button", { name: "Use account mode", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("test@example.com");
  await page.getByText("Email me a code", { exact: true }).click();
  await page.getByLabel("Email code", { exact: true }).waitFor();
  assert.equal(mockEmails, 1);
  await page.setViewportSize({ width: 320, height: 568 });
  await page
    .getByText("A shared record, built on trust.", { exact: true })
    .scrollIntoViewIfNeeded();
  await checkTarget();
  await button().click();
  await page
    .getByRole("button", { name: "Use offline — free", exact: true })
    .click();
  await page.getByRole("tab", { name: "Home", exact: true }).waitFor();
  assert.equal(mockEmails, 1, "exiting OTP does not resend email");
  await page.goto(missingURL);
  await page.evaluate(() => localStorage.removeItem("betweenus.mode.v1"));
  await page.reload();
  await page
    .getByRole("button", { name: "Use account mode", exact: true })
    .click();
  await page
    .getByText("Sign-in needs configuration", { exact: true })
    .waitFor();
  await checkTarget();
  await button().click();
  await page
    .getByRole("button", { name: "Use offline — free", exact: true })
    .waitFor();
  // Hold initial session restoration to prove the same safe-area header is usable while loading.
  const loadingContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const loading = await loadingContext.newPage();
  let held = null;
  loading.on("pageerror", (e) => errors.push(e.message));
  await loading.addInitScript(() => {
    const payload = btoa(
      JSON.stringify({ sub: "11111111-1111-4111-8111-111111111111", exp: 1 }),
    ).replace(/=/g, "");
    localStorage.setItem("betweenus.mode.v1", "account");
    localStorage.setItem(
      "betweenus-auth-session",
      JSON.stringify({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`,
        refresh_token: "mock-refresh",
        expires_at: 1,
        expires_in: 0,
        token_type: "bearer",
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "test@example.com",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01",
        },
      }),
    );
  });
  await loading.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin === new URL(authURL).origin)
      return route.continue();
    if (url.startsWith(`${authOrigin}/auth/v1/token`)) {
      held = route;
      return;
    }
    unexpected.push(url);
    return route.abort();
  });
  await loading.goto(authURL);
  await expect.poll(() => !!held).toBe(true);
  await loading.getByLabel("Loading account", { exact: true }).waitFor();
  await loading
    .getByRole("button", { name: "Back to mode selection", exact: true })
    .click();
  await loading
    .getByRole("button", { name: "Use offline — free", exact: true })
    .waitFor();
  await held.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({
      error: "invalid_grant",
      error_code: "refresh_token_not_found",
      msg: "Mock session expired",
    }),
  });
  await loading
    .getByRole("button", { name: "Use offline — free", exact: true })
    .click();
  await loading.getByRole("tab", { name: "Home", exact: true }).waitFor();
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS issue9:44pt visible/tappable return at320/430, pre-email/OTP/loading/config-unavailable exits, offline handoff. No real email; browser geometry does not verify native iPhone safe-area insets.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
