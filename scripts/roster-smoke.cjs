const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const offlineURL = process.env.ROSTER_OFFLINE_URL || "http://localhost:8097";
const accountURL = process.env.ROSTER_ACCOUNT_URL || "http://localhost:8098";
const stamp = "2026-11-20T12:00:00Z";
const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const tokenFor = (sub) =>
  [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url"),
    "sig",
  ].join(".");
const saved = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
].map((id, index) => ({
  id,
  name: index === 2 ? "Kai" : "Sam",
  source: "custom",
  email: `person${index}@example.com`,
  phone: null,
  createdAt: stamp,
}));
const event = {
  id: "old-event",
  title: "Earlier match",
  date: "2026-11-20",
  totalMinor: 63000,
  payerId: "you",
  participants: [
    { id: "you", name: "You", isSelf: true },
    { id: "old-sam", name: "Sam", isSelf: false },
  ],
  payments: { "old-sam": [{ id: "p1", amountMinor: 500, createdAt: stamp }] },
};
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
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(offlineURL).origin
      ? route.continue()
      : (external.push(route.request().url()), route.abort()),
  );
  await page.addInitScript(
    (data) => {
      localStorage.setItem("betweenus.mode.v1", "offline");
      if (!sessionStorage.getItem("seed")) {
        localStorage.setItem(
          "betweenus.offline-ledger.v1",
          JSON.stringify(data),
        );
        sessionStorage.setItem("seed", "1");
      }
    },
    {
      version: 2,
      people: saved.slice(0, 2),
      records: [],
      vaults: [
        {
          id: "old-vault",
          title: "Legacy cup",
          kind: "permanent",
          archived: false,
          events: [event],
        },
      ],
    },
  );
  const b = (name) => page.getByRole("button", { name, exact: true });
  const tab = async (name) => {
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("tab", { name, exact: true }).click();
  };
  const check = (index) => page.getByRole("checkbox").nth(index);
  await page.goto(offlineURL);
  await tab("Vaults");
  await b("+ Create vault").click();
  await page.getByLabel("Vault name", { exact: true }).fill("Friday football");
  await b("Permanent").click();
  await check(0).click();
  await check(1).click();
  await expect(check(0)).toBeChecked();
  await expect(check(1)).toBeChecked();
  await b("Add a person").click();
  await page.getByText(/Saving this person keeps them in People/).waitFor();
  await page.getByLabel("Person name", { exact: true }).fill("Kai");
  await b("Save person").click();
  await b("Save vault").waitFor();
  await expect(check(2)).toBeChecked();
  await b("Save vault").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Vault members · 3", { exact: true }).waitFor();
  await b("Manage members").click();
  await check(0).click();
  await b("Save members").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Vault members · 2", { exact: true }).waitFor();
  await page.reload();
  await tab("Vaults");
  await page.getByText("Friday football", { exact: true }).click();
  await page.getByText("Vault members · 2", { exact: true }).waitFor();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `/tmp/betweenus-roster-offline-${width}.png`,
      fullPage: false,
    });
  }
  await tab("Vaults");
  await page.getByText("Legacy cup", { exact: true }).click();
  await page.getByText(/This earlier vault has no configured roster/).waitFor();
  await b("Manage members").click();
  await check(0).click();
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "betweenus.offline-ledger.v1") throw Error("Device full");
      return window.__setItem.call(this, key, value);
    };
  });
  await b("Save members").click();
  await page.getByText(/Not saved:.*Device full/).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("betweenus.offline-ledger.v1"),
        ).vaults.find((v) => v.id === "old-vault").memberIds,
    ),
    undefined,
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__setItem;
  });
  await b("Save members").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const disk = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")),
  );
  assert.deepEqual(disk.vaults.find((v) => v.id === "old-vault").events, [
    event,
  ]);
  assert.equal(disk.people.length, 3);
  assert.equal(
    disk.vaults.find((v) => v.title === "Friday football").memberIds.length,
    2,
  );
  assert.deepEqual(external, []);
  const account = await browser.newPage({
    viewport: { width: 430, height: 932 },
  });
  account.on("pageerror", (e) => errors.push(e.message));
  const otherToken = tokenFor(otherOwner);
  const session = {
    access_token: tokenFor(owner),
    refresh_token: "mock",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: owner,
      email: "owner@example.com",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: stamp,
    },
  };
  await account.addInitScript((data) => {
    localStorage.setItem("betweenus.mode.v1", "account");
    localStorage.setItem("betweenus-auth-session", JSON.stringify(data));
  }, session);
  let vaults = [],
    history = [],
    failAdd = true,
    addCalls = 0,
    holdPath,
    heldRead;
  const detail = (vault) => ({
    vault,
    members: saved.filter((p) => vault.memberIds.includes(p.id)),
    history,
  });
  await account.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(accountURL).origin) return route.continue();
    if (url.origin === "https://auth-test.supabase.co")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    if (url.origin !== "https://api-test.invalid")
      throw Error("Unexpected external " + url);
    const req = route.request(),
      path = url.pathname,
      json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
    const read = (body) => {
      if (path !== holdPath) return json(body);
      holdPath = undefined;
      const snapshot = JSON.parse(JSON.stringify(body));
      heldRead = { request: req, release: () => json(snapshot) };
    };
    const secondAccount =
      req.headers().authorization === `Bearer ${otherToken}`;
    if (path.endsWith("/me"))
      return json(
        secondAccount
          ? { id: otherOwner, email: "other@example.com" }
          : { id: owner, email: "owner@example.com" },
      );
    if (path.endsWith("/debts")) return json({ debts: [] });
    if (path.endsWith("/vault-balances")) return json({ balances: [] });
    if (path.endsWith("/events")) return json({ events: [] });
    if (path.endsWith("/balances")) return json({ balances: [] });
    if (path.endsWith("/people")) return json({ people: saved });
    if (path === "/v1/vaults" && req.method() === "GET") {
      return read({ vaults: secondAccount ? [] : vaults });
    }
    if (path === "/v1/vaults" && req.method() === "POST") {
      const input = req.postDataJSON();
      assert.deepEqual(Object.keys(input).sort(), [
        "kind",
        "memberIds",
        "title",
      ]);
      assert.equal(input.title, "Account football");
      const vault = {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        ...input,
        archived: false,
        createdAt: stamp,
        updatedAt: stamp,
      };
      vaults.push(vault);
      history = [
        {
          id: "h0",
          action: "created",
          personId: null,
          actorId: owner,
          createdAt: stamp,
        },
      ];
      return json(detail(vault), 201);
    }
    const vault = vaults[0];
    if (path === `/v1/vaults/${vault?.id}`) {
      return read(detail(vault));
    }
    if (path.includes("/members")) {
      const { personId } = req.postDataJSON();
      if (path.endsWith("/remove")) {
        vault.memberIds = vault.memberIds.filter((id) => id !== personId);
      } else {
        addCalls++;
        if (failAdd)
          return json({ error: { message: "Temporary member failure" } }, 503);
        if (!vault.memberIds.includes(personId)) vault.memberIds.push(personId);
      }
      history.push({
        id: `h${history.length}`,
        action: path.endsWith("/remove") ? "member_removed" : "member_added",
        personId,
        actorId: owner,
        createdAt: stamp,
      });
      return json(detail(vault));
    }
    throw Error("Unexpected API " + path);
  });
  const ab = (name) => account.getByRole("button", { name, exact: true }),
    at = async (name) => {
      await account.getByRole("dialog").waitFor({ state: "hidden" });
      await account.getByRole("tab", { name, exact: true }).click();
    };
  async function delayRead(button, path = `/v1/vaults/${vaults[0].id}`) {
    heldRead = undefined;
    holdPath = path;
    await ab(button).click();
    await expect.poll(() => Boolean(heldRead)).toBe(true);
  }
  async function releaseRead() {
    const finished = account.waitForEvent(
      "requestfinished",
      (request) => request === heldRead.request,
    );
    await heldRead.release();
    await finished;
    // Let the browser process the response and render any resulting state.
    await account.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  await account.goto(accountURL);
  await delayRead("Create vault", "/v1/vaults");
  await account
    .getByLabel("Vault title", { exact: true })
    .fill("Account football");
  await account.getByRole("checkbox").nth(0).click();
  await account.getByRole("checkbox").nth(1).click();
  await account.evaluate(async (data) => {
    data.access_token += "refreshed";
    const c = new BroadcastChannel("betweenus-auth-session");
    c.postMessage({ event: "TOKEN_REFRESHED", session: data });
    await new Promise((r) => setTimeout(r, 150));
    c.close();
  }, session);
  await expect(account.getByLabel("Vault title", { exact: true })).toHaveValue(
    "Account football",
  );
  await ab("Save vault").click();
  await account.getByRole("dialog").waitFor({ state: "hidden" });
  await releaseRead();
  await delayRead("Back to vaults", "/v1/vaults");
  await expect(ab("Open Account football")).toBeVisible();
  await releaseRead();
  await ab("Open Account football").click();
  await ab("Manage members").click();
  await account.getByRole("checkbox").nth(0).click();
  await account.getByRole("checkbox").nth(2).click();
  await ab("Save members").click();
  await account
    .getByText(/Temporary member failure.*Some changes may already be saved/)
    .waitFor();
  assert.deepEqual(vaults[0].memberIds, [saved[1].id]);
  await expect(account.getByRole("checkbox").nth(2)).toBeChecked();
  failAdd = false;
  await ab("Save members").click();
  await account.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(vaults[0].memberIds, [saved[1].id, saved[2].id]);
  assert.equal(addCalls, 2);

  await delayRead("Reload vault");
  await ab("Manage members").click();
  await account.getByRole("checkbox").nth(0).click();
  await ab("Save members").click();
  await account.getByRole("dialog").waitFor({ state: "hidden" });
  await expect(account.getByText("Members · 3", { exact: true })).toBeVisible();
  await releaseRead();
  await expect(account.getByText("Members · 3", { exact: true })).toBeVisible();
  await ab("Manage members").click();
  await expect(account.getByRole("checkbox").nth(0)).toBeChecked();
  await ab("Close details").click();
  await account.screenshot({
    path: "/tmp/betweenus-roster-account.png",
    fullPage: false,
  });
  await delayRead("Reload vault");
  await ab("Back to vaults").click();
  await expect(ab("Open Account football")).toBeEnabled();
  await releaseRead();
  await expect(ab("Open Account football")).toBeVisible();

  await delayRead("Open Account football");
  await at("Vaults");
  await expect(ab("Open Account football")).toBeEnabled();
  await releaseRead();
  await expect(ab("Open Account football")).toBeVisible();

  await ab("Open Account football").click();
  await ab("Back to vaults").click();
  await expect(ab("Open Account football")).toBeVisible();

  await delayRead("Open Account football");
  await account.evaluate(
    (data) => {
      const channel = new BroadcastChannel("betweenus-auth-session");
      channel.postMessage({ event: "SIGNED_IN", session: data });
      channel.close();
    },
    {
      ...session,
      access_token: otherToken,
      user: { ...session.user, id: otherOwner, email: "other@example.com" },
    },
  );
  await expect(account.getByText("Your shared overview")).toBeVisible();
  await at("Vaults");
  const emptyVaults = account.getByText(/No vaults yet/);
  await expect(emptyVaults).toBeVisible();
  await releaseRead();
  await expect(emptyVaults).toBeVisible();
  await expect(ab("Open Account football")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS roster offline/account: duplicate-name IDs, nested custom entry, create/remove/reload, legacy snapshots, failed local write retry, same-owner refresh draft, partial API failure/idempotent retry, delayed reads after create/save, root/Back navigation and owner switch, 320/430 widths. No real APIs/contacts.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
