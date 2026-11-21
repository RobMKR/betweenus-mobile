import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPayment,
  createEvent,
  emptyLedger,
  eventBalances,
  eventPayment,
  eventRemaining,
  eventUndo,
  historyFor,
  participants,
  remaining,
  split,
  totals,
  undoPayment,
  validateLedger,
  validDate,
  type Ledger,
} from "../src/offline/model";
import { createLedgerStore, LEDGER_KEY } from "../src/offline/storage";
const football = () =>
  createEvent({
    title: "Friday football",
    date: "2026-11-21",
    totalMinor: 63000,
    names: ["You", ...Array.from({ length: 13 }, (_, i) => `Player ${i + 1}`)],
    selfIndex: 0,
    payerIndex: 0,
  });
test("AED 630 split among 14 leaves AED 45 for the payer and AED 585 due from others", () => {
  const event = football();
  assert.deepEqual(
    Object.values(split(event.totalMinor, event.participants)),
    Array(14).fill(4500),
  );
  assert.deepEqual(eventBalances(event), {
    receivableMinor: 58500,
    payableMinor: 0,
  });
  assert.equal(eventRemaining(event, event.payerId), 0);
});
test("equal split preserves every cent and assigns remainder in saved order", () => {
  const people = participants(["You", "Alex", "Sam"], 0);
  assert.deepEqual(Object.values(split(100, people)), [34, 33, 33]);
  assert.equal(
    Object.values(split(1, people)).reduce((a, b) => a + b),
    1,
  );
  assert.deepEqual(Object.values(split(2, people)), [1, 1, 0]);
});
test("event creation rejects invalid participant selections, dates, and amounts", () => {
  const input = {
    title: "Lunch",
    date: "2026-11-21",
    totalMinor: 10000,
    names: ["You", "Alex"],
    selfIndex: 0,
    payerIndex: 0,
  };
  assert.throws(() => participants(["Alex", "alex"], 0), /unique/);
  assert.throws(() => participants([" Alex ", "Ａｌｅｘ"], 0), /unique/);
  assert.throws(() => participants(["You", ""], 0), /Participant name/);
  assert.throws(() => participants(["You", "Alex"], 2), /yourself/);
  assert.throws(() => participants(["You"], 0), /2–100/);
  assert.throws(() => createEvent({ ...input, selfIndex: -1 }), /yourself/);
  assert.throws(() => createEvent({ ...input, payerIndex: -1 }), /who paid/);
  assert.throws(() => createEvent({ ...input, payerIndex: 2 }), /who paid/);
  assert.throws(
    () => createEvent({ ...input, totalMinor: 1_000_000_001 }),
    /positive amount/,
  );
  assert.throws(() => validDate("2026-02-30"), /valid date/);
});
test("a participant payer produces only own payable share in your overview", () => {
  const e = createEvent({
    title: "Lunch",
    date: "2026-11-21",
    totalMinor: 10000,
    names: ["You", "Alex", "Sam"],
    selfIndex: 0,
    payerIndex: 1,
  });
  assert.deepEqual(eventBalances(e), {
    receivableMinor: 0,
    payableMinor: 3334,
  });
  assert.equal(eventRemaining(e, e.participants[2].id), 3333);
  assert.throws(() => eventPayment(e, e.payerId, 1), /payer/);
});
test("partial/full event payments cannot overpay and undo preserves audit history", () => {
  let e = football();
  const person = e.participants[1].id;
  e = eventPayment(e, person, 2000);
  assert.equal(eventRemaining(e, person), 2500);
  assert.equal(eventBalances(e).receivableMinor, 56500);
  assert.throws(() => eventPayment(e, person, 2501), /remaining/);
  e = eventPayment(e, person, 2500);
  assert.equal(eventRemaining(e, person), 0);
  const full = historyFor(e, person)[1].id;
  e = eventUndo(e, person, full);
  assert.equal(eventRemaining(e, person), 2500);
  assert.equal(historyFor(e, person).length, 3);
  assert.throws(() => eventUndo(e, person, full), /cannot be undone/);
});
test("personal loans use exact remaining minor units and reversible repayments", () => {
  let p = addPayment(1001, [], 1);
  p = addPayment(1001, p, 1000);
  assert.equal(remaining(1001, p), 0);
  assert.throws(() => addPayment(1001, p, 1), /remaining/);
  p = undoPayment(p, p[0].id);
  assert.equal(remaining(1001, p), 1);
  assert.throws(() => addPayment(1001, p, 0), /positive/);
});
test("archiving never forgives debt, and permanent vault totals include multiple dated events", () => {
  const ledger: Ledger = {
    version: 1,
    records: [
      {
        id: "record",
        name: "Sam",
        direction: "borrowed",
        amountMinor: 500,
        date: "2026-11-21",
        note: "",
        payments: [],
      },
    ],
    vaults: [
      {
        id: "vault",
        title: "Football",
        kind: "permanent",
        archived: true,
        events: [football(), football()],
      },
    ],
  };
  assert.deepEqual(totals(ledger), {
    receivableMinor: 117000,
    payableMinor: 500,
  });
  assert.equal(validateLedger(ledger), ledger);
});
test("saved prototype-like participant IDs cannot read inherited payment history", () => {
  const e = football();
  e.participants[1].id = "constructor";
  assert.deepEqual(historyFor(e, "constructor"), []);
  assert.equal(eventRemaining(e, "constructor"), 4500);
});
test("malformed saved repayments and unsupported versions are refused", () => {
  const e = football();
  e.payments[e.participants[1].id] = [
    { id: "bad", amountMinor: 4501, createdAt: new Date().toISOString() },
  ];
  assert.throws(
    () =>
      validateLedger({
        version: 1,
        records: [],
        vaults: [
          {
            id: "vault",
            title: "Trip",
            kind: "temporary",
            archived: false,
            events: [e],
          },
        ],
      }),
    /balance/,
  );
  assert.throws(
    () => validateLedger({ version: 99, records: [], vaults: [] }),
    /Unsupported/,
  );
});
test("durable store roundtrips vaults and serializes rapid writes", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = createLedgerStore(storage);
  await store.load();
  const vault = {
    id: "v",
    title: "Football",
    kind: "permanent" as const,
    archived: false,
    events: [football()],
  };
  await Promise.all([
    store.commit((current) => ({ ...current, vaults: [vault] })),
    store.commit((current) => ({
      ...current,
      vaults: current.vaults.map((v) => ({
        ...v,
        events: [...v.events, football()],
      })),
    })),
  ]);
  const restored = await createLedgerStore(storage).load();
  assert.equal(restored.vaults[0].events.length, 2);
  assert.equal(totals(restored).receivableMinor, 117000);
});
test("failed persistence does not publish unsaved data; queue can retry", async () => {
  let disk: string | null = null;
  let fail = false;
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      if (fail) throw new Error("Device full");
      disk = value;
    },
  });
  await store.load();
  await store.commit((current) => ({
    ...current,
    vaults: [
      {
        id: "v",
        title: "Trip",
        kind: "temporary",
        archived: false,
        events: [],
      },
    ],
  }));
  fail = true;
  await assert.rejects(
    store.commit((current) => ({ ...current, vaults: [] })),
    /Device full/,
  );
  fail = false;
  const after = await store.commit((current) => ({ ...current, records: [] }));
  assert.equal(after.vaults.length, 1);
  assert.equal(JSON.parse(disk!).vaults.length, 1);
});
test("loads and writes issued together run in call order", async () => {
  let disk: string | null = null;
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      disk = value;
    },
  });
  const firstLoad = store.load();
  const saved = store.commit((current) => ({
    ...current,
    vaults: [
      {
        id: "v",
        title: "Football",
        kind: "permanent",
        archived: false,
        events: [football()],
      },
    ],
  }));
  const secondLoad = store.load();
  assert.deepEqual(await firstLoad, emptyLedger());
  assert.deepEqual(await secondLoad, await saved);
  assert.equal((await secondLoad).vaults.length, 1);
});
test("damaged persisted data is not overwritten on load", async () => {
  let writes = 0;
  const store = createLedgerStore({
    getItem: async (key) => (key === LEDGER_KEY ? "broken json" : null),
    setItem: async () => {
      writes++;
    },
  });
  await assert.rejects(store.load());
  assert.equal(writes, 0);
  await assert.rejects(
    store.commit(() => emptyLedger()),
    /Load/,
  );
  assert.equal(writes, 0);
});
