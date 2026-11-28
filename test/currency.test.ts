import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountInput,
  amountToMinor,
  createValuation,
  defaultSettings,
  isCurrency,
  money,
  suggestions,
  validateSettings,
  type Currency,
  type Quote,
} from "../src/currency/model";
import { buildEventSubmission, newEventDraft } from "../src/events/draft";
import { createLocalEvent } from "../src/events/local";
import { moneyIntentKey } from "../src/events/accountTypes";
import {
  emptyLedger,
  eventPayment,
  recordBalanceRows,
  setLocalVaultCurrency,
  validateLedger,
  type Ledger,
} from "../src/offline/model";
import { createLedgerStore } from "../src/offline/storage";

const manual = (
  baseCurrency: Currency,
  quoteCurrency: Currency,
  rate: string,
): Quote => ({
  baseCurrency,
  quoteCurrency,
  rate,
  source: "manual",
  asOf: "2026-11-28T09:00:00.000Z",
});
const aed = suggestions[0].quote;

test("verified USD/AED quote converts USD 100 to AED 367.25 and back", () => {
  assert.equal(
    createValuation({ mainCurrency: "AED", rates: [aed] }).amount(10000, "USD"),
    36725n,
  );
  assert.equal(
    createValuation({ mainCurrency: "USD", rates: [aed] }).amount(36725, "AED"),
    10000n,
  );
  assert.deepEqual(defaultSettings(), { mainCurrency: "USD", rates: [] });
  for (const { quote } of suggestions)
    validateSettings({ mainCurrency: "USD", rates: [quote] });
});

test("direct custom pair and its inverse override USD triangulation", () => {
  const usdRates = [aed, manual("USD", "RUB", "100")];
  assert.equal(
    createValuation({ mainCurrency: "RUB", rates: usdRates }).amount(
      100,
      "AED",
    ),
    2723n,
  );
  const rates = [...usdRates, manual("RUB", "AED", "0.04")];
  assert.equal(
    createValuation({ mainCurrency: "RUB", rates }).amount(100, "AED"),
    2500n,
  );
  assert.equal(
    createValuation({ mainCurrency: "AED", rates }).amount(2500, "RUB"),
    100n,
  );
});

test("rounds exact aggregates once, including signed net and very large converted minor units", () => {
  const valuation = createValuation({
    mainCurrency: "USD",
    rates: [manual("JPY", "USD", "0.005")],
  });
  const row = { currency: "JPY" as const, receivableMinor: 1, payableMinor: 0 };
  assert.equal(valuation.amount(1, "JPY"), 1n);
  assert.equal(valuation.amount(-1, "JPY"), -1n);
  assert.equal(valuation.balances([row, row]).receivableMinor, 1n);
  assert.equal(
    valuation.balances([row, { ...row, receivableMinor: 0, payableMinor: 2 }])
      .netMinor,
    -1n,
  );
  assert.equal(
    createValuation({
      mainCurrency: "BHD",
      rates: [manual("JPY", "BHD", "1000000000")],
    }).amount(1_000_000_000, "JPY"),
    1_000_000_000_000_000_000_000n,
  );
});

test("rejects invalid quotes and duplicate inverses, and flags only missing nonzero amounts", () => {
  for (const rate of [
    "0",
    "-1",
    "Infinity",
    "00.5",
    "01.5",
    "1e-3",
    "0.0000000000001",
    "1000000000.01",
  ])
    assert.throws(
      () =>
        validateSettings({
          mainCurrency: "USD",
          rates: [manual("USD", "AED", rate)],
        }),
      /positive rate/,
    );
  assert.throws(
    () =>
      validateSettings({
        mainCurrency: "USD",
        rates: [aed, manual("AED", "USD", "1")],
      }),
    /already has/,
  );
  assert.throws(
    () =>
      validateSettings({
        mainCurrency: "USD",
        rates: [{ ...aed, asOf: "2026-02-30T00:00:00Z" }],
      }),
    /date/,
  );
  const valuation = createValuation(defaultSettings());
  assert.equal(valuation.amount(100, "AED"), null);
  assert.deepEqual(
    valuation.balances([
      { currency: "AED", receivableMinor: 100, payableMinor: 0 },
    ]).unknown,
    { receivableMinor: true, payableMinor: false, netMinor: true },
  );
  assert.deepEqual(
    valuation.balances([
      { currency: "AED", receivableMinor: 100, payableMinor: 0 },
      { currency: "JPY", receivableMinor: 0, payableMinor: 0 },
      { currency: "USD", receivableMinor: 800, payableMinor: 3 },
    ]),
    {
      currency: "USD",
      receivableMinor: 800n,
      payableMinor: 3n,
      netMinor: 797n,
      missingCurrencies: ["AED"],
      unknown: { receivableMinor: false, payableMinor: false, netMinor: false },
    },
  );
});

test("currency exponents validate entry, split a three-place event exactly, and roundtrip repayments", () => {
  assert.equal(isCurrency("XAU"), false);
  assert.equal(isCurrency("XTS"), false);
  assert.equal(amountToMinor("120", "JPY"), 120);
  assert.equal(amountToMinor("120.0", "JPY"), null);
  assert.equal(amountToMinor("1.001", "AED"), null);
  assert.equal(amountToMinor("1.001", "BHD"), 1001);
  assert.equal(amountInput(1001, "OMR"), "1.001");
  assert.equal(money(1234567, "BHD"), "BHD 1,234.567");
  const person = {
    id: "p",
    name: "Pat",
    source: "custom" as const,
    createdAt: "2026-11-28T00:00:00Z",
    email: null,
    phone: null,
  };
  const people = [person];
  const draft = {
    ...newEventDraft(new Date("2026-11-28T12:00:00Z")),
    title: "Coffee",
    amount: "1.001",
    selectedPersonIds: [person.id],
  };
  const submission = buildEventSubmission(draft, people, "BHD");
  assert.notEqual(
    moneyIntentKey("event", submission),
    moneyIntentKey("event", { ...submission, currency: "USD" }),
  );
  const event = createLocalEvent(submission, people);
  assert.equal(event.totalMinor, 1001);
  assert.equal(event.currency, "BHD");
  assert.deepEqual(event.shares, { self: 501, p: 500 });
  const paid = eventPayment(event, person.id, amountToMinor("0.500", "BHD")!);
  const vault = {
    id: "v",
    title: "Coffee",
    currency: "BHD" as const,
    kind: "permanent" as const,
    archived: false,
    events: [paid],
  };
  const ledger = { ...emptyLedger(), people, vaults: [vault] };
  assert.equal(
    validateLedger(ledger).vaults[0].events[0].payments.p[0].amountMinor,
    500,
  );
  assert.throws(
    () =>
      validateLedger({ ...ledger, vaults: [{ ...vault, currency: "JPY" }] }),
    /must match/,
  );
  assert.throws(() => setLocalVaultCurrency(ledger, "v", "JPY"), /locked/);
  assert.equal(
    setLocalVaultCurrency(
      { ...ledger, vaults: [{ ...vault, events: [] }] },
      "v",
      "JPY",
    ).vaults[0].currency,
    "JPY",
  );
});

test("settings durability and retries preserve original payment history, amounts, and currencies", async () => {
  const ledger: Ledger = {
    ...emptyLedger(),
    records: [
      {
        id: "debt",
        name: "Pat",
        direction: "lent",
        currency: "AED",
        amountMinor: 40000,
        date: "2026-11-27",
        note: "Original",
        payments: [
          {
            id: "payment",
            amountMinor: 3275,
            createdAt: "2026-11-28T00:00:00Z",
          },
        ],
      },
    ],
  };
  let disk = JSON.stringify(ledger);
  let failed = false;
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      if (failed) throw new Error("Device full");
      disk = value;
    },
  });
  await store.load();
  const previous = await store.commit((current) => ({
    ...current,
    currencySettings: { mainCurrency: "USD", rates: [aed] },
  }));
  const change = (current: Ledger): Ledger => ({
    ...current,
    currencySettings: {
      mainCurrency: "RUB",
      rates: [manual("AED", "RUB", "25")],
    },
  });
  failed = true;
  await assert.rejects(store.commit(change), /Device full/);
  assert.deepEqual(JSON.parse(disk), previous);
  failed = false;
  const next = await store.commit(change);
  assert.deepEqual(next.records, ledger.records);
  assert.equal(
    createValuation(previous.currencySettings!).balances(
      recordBalanceRows(previous.records),
    ).receivableMinor,
    10000n,
  );
  assert.equal(
    createValuation(next.currencySettings!).balances(
      recordBalanceRows(next.records),
    ).receivableMinor,
    918125n,
  );
});
