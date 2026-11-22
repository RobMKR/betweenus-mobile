import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localCalendarDate,
  pickerDate,
  selectedCalendarDate,
} from "../src/offline/eventDate";
import { createEvent, eventPayment, type Ledger } from "../src/offline/model";
import { createLedgerStore } from "../src/offline/storage";
function inTimezone(zone: string, check: () => void) {
  const previous = process.env.TZ;
  try {
    process.env.TZ = zone;
    check();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
test("local today uses calendar parts rather than UTC day near midnight", () => {
  const instant = new Date("2026-11-21T22:30:00Z");
  inTimezone("Asia/Dubai", () =>
    assert.equal(localCalendarDate(instant), "2026-11-22"),
  );
  inTimezone("America/Los_Angeles", () =>
    assert.equal(
      localCalendarDate(new Date("2026-11-22T00:30:00Z")),
      "2026-11-21",
    ),
  );
});
test("date-only native picker roundtrips past/future/leap/DST days across timezones", () => {
  for (const zone of [
    "UTC",
    "Asia/Dubai",
    "America/Los_Angeles",
    "Europe/Berlin",
    "Pacific/Kiritimati",
  ])
    inTimezone(zone, () => {
      for (const value of [
        "1999-12-31",
        "2026-03-08",
        "2026-11-01",
        "2026-03-29",
        "2026-10-25",
        "2028-02-29",
        "2035-01-01",
        "0099-12-31",
      ]) {
        const native = pickerDate(value);
        assert.equal(native.getHours(), 12, `${zone} uses local noon`);
        assert.equal(selectedCalendarDate(native), value, `${zone}: ${value}`);
      }
    });
});
test("dismissal or invalid picker values cannot replace the selected calendar date", () => {
  assert.equal(selectedCalendarDate(), null);
  assert.equal(selectedCalendarDate(new Date(NaN)), null);
  assert.throws(() => pickerDate("2026-02-30"), /valid date/);
  assert.throws(() => pickerDate("2026-12-01T00:00:00Z"), /valid date/);
});
test("new dates persist as strings while existing event dates/repayments/archive state remain unchanged", async () => {
  let old = createEvent({
    title: "Old trip",
    date: "2020-03-29",
    totalMinor: 63000,
    names: ["You", "Sam"],
    selfIndex: 0,
    payerIndex: 0,
  });
  old = eventPayment(old, old.participants[1].id, 1000);
  const initial: Ledger = {
    version: 1,
    records: [],
    vaults: [
      {
        id: "legacy-vault",
        title: "Old",
        kind: "temporary",
        archived: true,
        events: [old],
      },
    ],
  };
  let disk = JSON.stringify(initial);
  const store = createLedgerStore({
    getItem: async () => disk,
    setItem: async (_key, value) => {
      disk = value;
    },
  });
  const loaded = await store.load();
  assert.equal(loaded.version, 3);
  assert.deepEqual(loaded.records, initial.records);
  assert.deepEqual(loaded.vaults, initial.vaults);
  assert.deepEqual(loaded.people, []);
  const next = createEvent({
    title: "Next match",
    date: "2028-02-29",
    totalMinor: 100,
    names: ["You", "Sam"],
    selfIndex: 0,
    payerIndex: 0,
  });
  await store.commit((current) => ({
    ...current,
    vaults: [
      ...current.vaults,
      {
        id: "new-vault",
        title: "New",
        kind: "permanent",
        archived: false,
        events: [next],
      },
    ],
  }));
  const restored = await createLedgerStore({
    getItem: async () => disk,
    setItem: async () => {},
  }).load();
  assert.deepEqual(restored.vaults[0], initial.vaults[0]);
  assert.equal(restored.vaults[1].events[0].date, "2028-02-29");
  assert.equal(
    Object.hasOwn(restored.vaults[1], "date"),
    false,
    "vault remains a date-free container",
  );
});
