import test from "node:test";
import assert from "node:assert/strict";
import { createLedgerStore, LEDGER_KEY } from "../src/offline/storage";
import {
  createEvent,
  migrateLedger,
  validateLedger,
  type Ledger,
} from "../src/offline/model";
import { setVaultRoster, validateMemberIds } from "../src/vaults/roster";
const people = ["a", "b"].map((id) => ({
  id,
  name: "Sam",
  source: "custom" as const,
  email: null,
  phone: null,
  createdAt: "2026-01-01T00:00:00Z",
}));
function fixture(): Ledger {
  return {
    version: 2,
    people,
    records: [],
    vaults: [
      {
        id: "v",
        title: "Football",
        kind: "permanent",
        archived: false,
        events: [
          createEvent({
            title: "Legacy match",
            date: "2026-11-20",
            totalMinor: 63000,
            names: ["You", "Sam"],
            selfIndex: 0,
            payerIndex: 0,
          }),
        ],
      },
    ],
  };
}
test("rosters select distinct IDs even for equal names, validate membership and cap", () => {
  assert.deepEqual(validateMemberIds(["b", "a"], ["a", "b"]), ["b", "a"]);
  assert.deepEqual(validateMemberIds([], []), []);
  for (const value of [["a", "a"], ["unknown"], ["self"], null])
    assert.throws(() => validateMemberIds(value, ["a", "b"]));
  const ids = Array.from({ length: 101 }, (_, n) => `p${n}`);
  assert.throws(() => validateMemberIds(ids, ids));
});
test("legacy rosters stay absent; adding/removing members never changes event snapshots or balances", () => {
  const initial = fixture(),
    original = JSON.stringify(initial.vaults[0].events);
  assert.equal(migrateLedger(initial).vaults[0].memberIds, undefined);
  const next = setVaultRoster(initial, "v", ["b", "a"]);
  assert.equal(next.vaults[0].events, initial.vaults[0].events);
  assert.deepEqual(next.vaults[0].memberIds, ["b", "a"]);
  const removed = setVaultRoster(next, "v", []);
  assert.equal(JSON.stringify(removed.vaults[0].events), original);
  assert.equal(initial.vaults[0].memberIds, undefined);
  assert.throws(() =>
    setVaultRoster(
      { ...next, vaults: [{ ...next.vaults[0], archived: true }] },
      "v",
      [],
    ),
  );
  for (const memberIds of [["a", "a"], ["foreign"]])
    assert.throws(() =>
      validateLedger({ ...next, vaults: [{ ...next.vaults[0], memberIds }] }),
    );
});
test("failed roster save retains durable legacy shape, retry persists ordered members and removal", async () => {
  let raw = JSON.stringify(fixture()),
    fail = false;
  const store = createLedgerStore({
    getItem: async () => raw,
    setItem: async (key, value) => {
      assert.equal(key, LEDGER_KEY);
      if (fail) throw Error("Device full");
      raw = value;
    },
  });
  await store.load();
  const old = raw;
  fail = true;
  await assert.rejects(
    store.commit((ledger) => setVaultRoster(ledger, "v", ["a"])),
    /Device full/,
  );
  assert.equal(raw, old);
  fail = false;
  await store.commit((ledger) => setVaultRoster(ledger, "v", ["a", "b"]));
  assert.deepEqual((await store.load()).vaults[0].memberIds, ["a", "b"]);
  await store.commit((ledger) => setVaultRoster(ledger, "v", ["b"]));
  assert.deepEqual((await store.load()).vaults[0].memberIds, ["b"]);
});
