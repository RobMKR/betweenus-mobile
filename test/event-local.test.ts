import test from "node:test";
import assert from "node:assert/strict";
import { createLocalEvent } from "../src/events/local";
import {
  createEvent,
  eventBalances,
  eventPayment,
  eventRemaining,
  eventUndo,
  migrateLedger,
  totals,
  validateLedger,
  type Ledger,
} from "../src/offline/model";
import { createLedgerStore } from "../src/offline/storage";
import type { EventSubmission } from "../src/events/draft";
const people = ["a", "b"].map((id) => ({
  id,
  name: "Sam",
  source: "custom" as const,
  email: null,
  phone: null,
  createdAt: "2026-01-01T00:00:00Z",
}));
const input = (change: Partial<EventSubmission> = {}): EventSubmission => ({
  title: "Football",
  date: "2026-11-20",
  currency: "AED",
  totalMinor: 63000,
  participantIds: ["self", "a", "b"],
  payerId: "self",
  splitMode: "equal",
  partialPayments: false,
  ...change,
});
function ledger(event: ReturnType<typeof createLocalEvent>): Ledger {
  return {
    version: 3,
    people,
    records: [],
    vaults: [
      {
        id: "v",
        title: "Vault",
        kind: "permanent",
        archived: false,
        events: [event],
      },
    ],
  };
}
test("new equal/manual event snapshots preserve same-name identity, rounding and payer exclusions", () => {
  const equal = createLocalEvent(input({ totalMinor: 101 }), people);
  assert.deepEqual(equal.shares, { self: 34, a: 34, b: 33 });
  assert.deepEqual(eventBalances(equal), {
    receivableMinor: 67,
    payableMinor: 0,
  });
  const manual = createLocalEvent(
    input({
      splitMode: "manual",
      partialPayments: true,
      allocations: [
        { participantId: "self", shareMinor: 0 },
        { participantId: "a", shareMinor: 18000 },
        { participantId: "b", shareMinor: 45000 },
      ],
    }),
    people,
  );
  assert.equal(manual.participants[1].name, manual.participants[2].name);
  assert.deepEqual(eventBalances(manual), {
    receivableMinor: 63000,
    payableMinor: 0,
  });
  assert.equal(eventRemaining(manual, "self"), 0);
  const paid = eventPayment(manual, "b", 500);
  assert.equal(eventRemaining(paid, "b"), 44500);
  const undone = eventUndo(paid, "b", paid.payments.b[0].id);
  assert.equal(eventRemaining(undone, "b"), 45000);
  assert.equal(undone.payments.b.length, 2);
  assert.throws(() => eventPayment(manual, "a", 18001));
  assert.doesNotThrow(() => validateLedger(ledger(undone)));
});
test("self may pay without taking a share; absent self with another payer contributes zero", () => {
  const outside = createLocalEvent(
    input({ participantIds: ["a", "b"] }),
    people,
  );
  assert.deepEqual(eventBalances(outside), {
    receivableMinor: 63000,
    payableMinor: 0,
  });
  assert.throws(() => eventPayment(outside, "self", 1));
  const other = createLocalEvent(
    input({ participantIds: ["a", "b"], payerId: "a" }),
    people,
  );
  assert.deepEqual(eventBalances(other), {
    receivableMinor: 0,
    payableMinor: 0,
  });
  const own = createLocalEvent(input({ payerId: "a" }), people);
  assert.deepEqual(eventBalances(own), {
    receivableMinor: 0,
    payableMinor: 21000,
  });
  assert.throws(() => createLocalEvent(input({ payerId: "missing" }), people));
});
test("damaged share snapshots and duplicate manual rows cannot enter durable data", () => {
  const event = createLocalEvent(input(), people);
  const damaged: Record<string, number>[] = [
    { self: 21000, a: 21000 },
    { self: 21000, a: 21000, b: 21001 },
    { self: 21000, a: -1, b: 42001 },
  ];
  for (const shares of damaged)
    assert.throws(() => validateLedger(ledger({ ...event, shares })));
  assert.throws(() =>
    createLocalEvent(
      input({
        splitMode: "manual",
        allocations: [
          { participantId: "self", shareMinor: 0 },
          { participantId: "a", shareMinor: 63000 },
          { participantId: "a", shareMinor: 0 },
        ],
      }),
      people,
    ),
  );
  assert.throws(() => validateLedger({ ...ledger(event), version: 2 }));
});
test("v1/v2 read-only migration preserves legacy event bytes, balances and archive; failed writes retain old disk", async () => {
  const legacy = createEvent({
    title: "Earlier",
    date: "2020-02-29",
    totalMinor: 101,
    names: ["You", "Sam"],
    selfIndex: 0,
    payerIndex: 1,
  });
  // A legacy non-self participant can have the literal ID 'self'; it must not become the owner.
  legacy.participants[1].id = "self";
  legacy.payerId = "self";
  const old: Ledger = {
    version: 2,
    people,
    records: [],
    vaults: [
      {
        id: "old",
        title: "Earlier",
        kind: "permanent",
        archived: true,
        events: [legacy],
      },
    ],
  };
  const before = JSON.stringify(old.vaults),
    balance = totals(old);
  const migrated = migrateLedger(old);
  assert.equal(migrated.version, 3);
  assert.equal(JSON.stringify(migrated.vaults), before);
  assert.deepEqual(totals(migrated), balance);
  assert.equal(balance.payableMinor, 51);
  assert.equal(migrated.vaults[0].memberIds, undefined);
  const v1 = migrateLedger({ ...old, version: 1, people: undefined });
  assert.equal(v1.version, 3);
  assert.deepEqual(v1.people, []);
  let disk = JSON.stringify(old),
    fail = true;
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      if (fail) throw Error("Device full");
      disk = value;
    },
  });
  await store.load();
  assert.equal(JSON.parse(disk).version, 2);
  await assert.rejects(
    store.commit((current) => ({
      ...current,
      vaults: [
        ...current.vaults,
        {
          id: "new",
          title: "New",
          kind: "temporary",
          archived: false,
          events: [createLocalEvent(input(), people)],
        },
      ],
    })),
  );
  assert.equal(JSON.parse(disk).version, 2);
  fail = false;
  await store.commit((current) => ({ ...current, records: [] }));
  assert.equal(JSON.parse(disk).version, 3);
  assert.equal(JSON.stringify(JSON.parse(disk).vaults), before);
});

test("full-only events settle the current remaining share and preserve earlier payments and undo history", async () => {
  const full = createLocalEvent(input({ totalMinor: 101 }), people);
  assert.equal(full.partialPayments, false);
  assert.throws(() => eventPayment(full, "a", 15), /full remaining/);
  assert.throws(() => eventPayment(full, "a", 35), /remaining/);
  assert.throws(() => eventPayment(full, "self", 34), /payer/);

  // A prior app version can record installments even if this flag was off.
  const { partialPayments: _flag, ...legacy } = full;
  const earlier = eventPayment(legacy, "a", 15);
  assert.equal(eventRemaining(earlier, "a"), 19);
  const paid = eventPayment({ ...earlier, partialPayments: false }, "a", 19);
  assert.equal(eventRemaining(paid, "a"), 0);
  assert.throws(() => eventPayment(paid, "a", 19), /remaining/);

  let disk = JSON.stringify(ledger(paid));
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      disk = value;
    },
  });
  const loaded = (await store.load()).vaults[0].events[0];
  assert.equal(loaded.partialPayments, false);
  assert.deepEqual(loaded.payments.a, paid.payments.a);
  const corrected = eventUndo(loaded, "a", paid.payments.a[1].id);
  assert.equal(eventRemaining(corrected, "a"), 19);
  assert.deepEqual(
    corrected.payments.a.map((payment) => payment.amountMinor),
    [15, 19, -19],
  );
  assert.doesNotThrow(() => validateLedger(ledger(corrected)));
});
