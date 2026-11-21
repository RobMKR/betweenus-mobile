import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLedger,
  migrateLedger,
  validateLedger,
  type Ledger,
} from "../src/offline/model";
import { createLedgerStore } from "../src/offline/storage";
import {
  personFields,
  personRequest,
  type SavedPerson,
} from "../src/people/model";
import { savedPersonRecords } from "../src/people/records";
const person = (id: string): SavedPerson => ({
  id,
  name: "Sam",
  source: "custom",
  email: null,
  phone: null,
  createdAt: "2026-11-21T00:00:00Z",
});
const old: Ledger = {
  version: 1,
  records: [
    {
      id: "record",
      name: "Sam",
      direction: "lent",
      amountMinor: 100,
      date: "2020-02-29",
      note: "old",
      payments: [],
    },
  ],
  vaults: [
    {
      id: "vault",
      title: "Old",
      kind: "temporary",
      archived: true,
      events: [],
    },
  ],
};
test("v1 upgrade preserves old arrays, dates, archive and names without invented people or links", () => {
  const before = JSON.stringify(old),
    next = migrateLedger(old);
  assert.equal(next.version, 2);
  assert.deepEqual(next.people, []);
  assert.equal(next.records, old.records);
  assert.equal(next.vaults, old.vaults);
  assert.equal(next.records[0].personId, undefined);
  assert.equal(JSON.stringify(old), before);
  assert.equal(migrateLedger(next), next);
});
test("migration is read-only until successful write; failed person save leaves v1 disk intact and retry works", async () => {
  let disk = JSON.stringify(old),
    fail = true,
    writes = 0;
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      writes++;
      if (fail) throw new Error("Device full");
      disk = value;
    },
  });
  await store.load();
  assert.equal(writes, 0);
  await assert.rejects(
    store.commit((current) => ({
      ...current,
      version: 2,
      people: [person("one")],
    })),
    /Device full/,
  );
  assert.equal(disk, JSON.stringify(old));
  fail = false;
  const saved = await store.commit((current) => ({
    ...current,
    version: 2,
    people: [person("one")],
  }));
  assert.equal(saved.people?.length, 1);
  assert.equal(JSON.parse(disk).version, 2);
  assert.deepEqual(JSON.parse(disk).records, old.records);
});
test("same-name saved IDs stay separate and only explicit personal record links contribute", () => {
  const base = emptyLedger();
  const ledger: Ledger = {
    ...base,
    people: [person("one"), person("two")],
    records: [
      ...old.records,
      { ...old.records[0], id: "linked", personId: "two", amountMinor: 1234 },
    ],
  };
  validateLedger(ledger);
  assert.equal(savedPersonRecords(ledger.records, "one").records.length, 0);
  assert.equal(savedPersonRecords(ledger.records, "two").receivableMinor, 1234);
  assert.equal(savedPersonRecords(ledger.records, "two").records.length, 1);
  assert.throws(
    () =>
      validateLedger({
        ...ledger,
        records: [{ ...old.records[0], personId: "missing" }],
      }),
    /link/,
  );
  assert.throws(
    () => validateLedger({ ...ledger, people: [person("one"), person("one")] }),
    /Duplicate saved person/,
  );
});
test("person privacy boundary normalizes only allowed fields, with one optional email and phone", () => {
  const request = personRequest({
    name: " Sam ",
    source: "contact",
    email: " SAM@example.com ",
    phone: "+971 (50) 123-4567",
    nativeContactId: "private",
    photo: "private",
  } as never);
  assert.deepEqual(request, {
    name: "Sam",
    source: "contact",
    email: "sam@example.com",
    phone: "+971 (50) 123-4567",
  });
  assert.throws(
    () =>
      personFields({ name: "Sam", source: "custom", phone: "not-a-number" }),
    /phone/,
  );
  assert.throws(() => personFields({ name: "", source: "custom" }), /name/);
  assert.deepEqual(personRequest({ name: "Sam", source: "custom" }), {
    name: "Sam",
    source: "custom",
  });
});
test("unsupported or malformed saved People never become an empty ledger", () => {
  assert.throws(
    () => migrateLedger({ version: 3, records: [], vaults: [] }),
    /Unsupported/,
  );
  assert.throws(
    () =>
      migrateLedger({
        version: 2,
        records: [],
        vaults: [],
        people: [{ ...person("one"), phone: 55 }],
      }),
    /Invalid/,
  );
});
