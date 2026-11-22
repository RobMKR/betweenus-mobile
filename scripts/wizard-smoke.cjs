const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const url = process.env.WIZARD_OFFLINE_URL || "http://localhost:8099";
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
    new URL(route.request().url()).origin === new URL(url).origin
      ? route.continue()
      : (external.push(route.request().url()), route.abort()),
  );
  const old = {
    id: "earlier-event",
    title: "Earlier equal event",
    date: "2020-02-29",
    totalMinor: 10000,
    payerId: "old-you",
    participants: [
      { id: "old-you", name: "You", isSelf: true },
      { id: "old-p1", name: "Player 1", isSelf: false },
    ],
    payments: {},
  };
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
      records: [],
      people: Array.from({ length: 13 }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
        source: "custom",
        email: null,
        phone: null,
        createdAt: "2026-01-01T00:00:00Z",
      })),
      vaults: [
        {
          id: "v",
          title: "Weekly team",
          kind: "permanent",
          archived: false,
          memberIds: Array.from({ length: 13 }, (_, i) => `p${i + 1}`),
          events: [old],
        },
      ],
    },
  );
  const b = (name) => page.getByRole("button", { name, exact: true }),
    field = (name) => page.getByLabel(name, { exact: true }),
    person = (name) => page.getByRole("checkbox", { name, exact: true }),
    tab = async (name) => {
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("tab", { name, exact: true }).click();
    };
  await page.goto(url);
  await tab("Vaults");
  await page.getByText("Weekly team", { exact: true }).click();
  await b("Add event expense").click();
  await field("Event title").fill("Manual training");
  await field("Event date").fill("2028-02-29");
  await field("Total amount (AED)").fill("100");
  await page.screenshot({
    path: "/tmp/betweenus-wizard-details-430.png",
    fullPage: false,
  });
  await b("Next").click();
  await page.getByText("14 participants", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/betweenus-wizard-people-430.png",
    fullPage: false,
  });
  for (let i = 3; i <= 13; i++) await person(`Player ${i}`).click();
  await page.getByRole("switch", { name: "Include me", exact: true }).uncheck();
  await page.getByRole("radio", { name: "Player 1", exact: true }).click();
  await person("Player 1").click();
  await expect(b("Next")).toBeDisabled();
  await person("Player 1").click();
  await page
    .getByRole("radio", { name: "You, Paying outside the split", exact: true })
    .click();
  await b("Next").click();
  await page.getByRole("radio", { name: "Manual", exact: true }).click();
  await field("Player 1 share (AED)").fill("40");
  await field("Player 2 share (AED)").fill("60");
  await expect(b("Save event")).toBeEnabled();
  await b("Back").click();
  await page.getByRole("switch", { name: "Include me", exact: true }).check();
  await b("Next").click();
  await expect(field("Player 1 share (AED)")).toHaveValue("40");
  await expect(field("Player 2 share (AED)")).toHaveValue("60");
  await field("You share (AED)").fill("10");
  await page.getByText("Over-allocated", { exact: true }).waitFor();
  await expect(b("Save event")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("switch", { name: "Include me", exact: true }),
  ).toBeChecked();
  await b("Back").click();
  await expect(field("Event title")).toHaveValue("Manual training");
  await expect(field("Event date")).toHaveValue("2028-02-29");
  await field("Total amount (AED)").fill("110");
  await b("Next").click();
  await b("Next").click();
  await expect(field("You share (AED)")).toHaveValue("10");
  await expect(b("Save event")).toBeEnabled();
  await b("Back").click();
  await person("Player 2").click();
  await b("Next").click();
  await page.getByText("Remaining to allocate", { exact: true }).waitFor();
  await expect(b("Save event")).toBeDisabled();
  await b("Back").click();
  await person("Player 2").click();
  await b("Next").click();
  await expect(field("Player 2 share (AED)")).toHaveValue("60");
  await expect(b("Save event")).toBeEnabled();
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 932 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const heading = await page
      .getByText("Split and review", { exact: true })
      .boundingBox();
    assert.ok(
      heading && heading.y >= 0 && heading.y < 220,
      "each step starts at its heading",
    );
    await page.screenshot({
      path: `/tmp/betweenus-wizard-manual-${width}.png`,
      fullPage: false,
    });
  }
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "betweenus.offline-ledger.v1") throw Error("Device full");
      return window.__setItem.call(this, key, value);
    };
  });
  await b("Save event").click();
  await page
    .getByRole("dialog")
    .getByText(/Not saved:.*Device full/)
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")).version,
    ),
    2,
  );
  await expect(field("Player 1 share (AED)")).toHaveValue("40");
  await page.evaluate(() => (Storage.prototype.setItem = window.__setItem));
  await b("Save event").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Owed to you · AED 100.00", { exact: true }).waitFor();
  await b("Record payment · Player 1").click();
  await field("Payment amount · AED").fill("20");
  await b("Save payment").click();
  await page.getByText("Owed to you · AED 80.00", { exact: true }).waitFor();
  await b("Record payment · Player 1").click();
  await b("Use full remaining · AED 20.00").click();
  await b("Save payment").click();
  await page.getByText("Owed to you · AED 60.00", { exact: true }).waitFor();
  await b("Undo payment").last().click();
  await page.getByText("Owed to you · AED 80.00", { exact: true }).waitFor();
  await b("‹ Back to vault").click();
  await b("Add event expense").click();
  await field("Event title").fill("Team only");
  await field("Total amount (AED)").fill("30");
  await b("Next").click();
  await page.getByRole("switch", { name: "Include me", exact: true }).uncheck();
  await b("Add a person").click();
  await field("Person name").fill("You");
  await b("Save person").click();
  await page.getByRole("checkbox", { name: /^You, .*Saved person/ }).waitFor();
  await expect(
    page.getByRole("checkbox", { name: /^You, .*Saved person/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Include me", exact: true }),
  ).not.toBeChecked();
  await b("Next").click();
  await b("Save event").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Owed to you · AED 30.00", { exact: true }).waitFor();
  await page.getByText(/Your own share AED 0.00/).waitFor();
  await page.reload();
  await tab("Vaults");
  await page.getByText("Weekly team", { exact: true }).click();
  await page.getByText("Event expenses · 3", { exact: true }).waitFor();
  await b("Archive vault").click();
  await tab("Home");
  await page
    .getByLabel("Offline receivable", { exact: true })
    .filter({ hasText: "AED 160.00" })
    .waitFor();
  const disk = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("betweenus.offline-ledger.v1")),
  );
  assert.equal(disk.version, 3);
  assert.deepEqual(disk.vaults[0].events[0], old);
  assert.equal(disk.vaults[0].events[1].splitMode, "manual");
  assert.equal(disk.vaults[0].events[1].shares.p1, 4000);
  assert.equal(disk.vaults[0].events[1].payments.p1.length, 3);
  assert.equal(disk.people.length, 14);
  assert.equal(
    disk.vaults[0].events[2].participants.some((p) => p.isSelf),
    false,
  );
  assert.equal(disk.vaults[0].archived, true);
  assert.equal(
    disk.vaults[0].events[2].participants.find(
      (person) => person.name === "You",
    ).isSelf,
    false,
    "a saved person named You is not inferred to be the owner",
  );
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS guided offline wizard: Back/Next retained, manual reconciliation, include-self/payer validation, selected custom person, self-paid outside split, v2→v3 durable migration/failure retry, immutable legacy event, payment/full/undo/reload/archive,320/430,no external requests.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
