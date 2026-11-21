import { test } from "node:test";
import assert from "node:assert/strict";
import { backPath, localPeople, personKey } from "../src/navigation/people";
import type { LocalRecord } from "../src/offline/model";
function record(
  id: string,
  name: string,
  direction: "lent" | "borrowed",
  amountMinor: number,
): LocalRecord {
  return {
    id,
    name,
    direction,
    amountMinor,
    date: "2026-11-21",
    note: "",
    payments: [],
  };
}
test("local name grouping normalizes spelling but preserves separate records, directions and histories", () => {
  const records = [
    record("one", "  Sam   Lee ", "lent", 10001),
    record("two", "ＳＡＭ ＬＥＥ", "borrowed", 3500),
    record("three", "Maya", "lent", 100),
  ];
  records[0].payments = [
    { id: "payment", amountMinor: 1, createdAt: "2026-11-21T10:00:00Z" },
  ];
  const before = JSON.stringify(records),
    groups = localPeople(records);
  assert.equal(groups.length, 2);
  assert.equal(personKey("SAM Lee"), groups[0].key);
  assert.deepEqual(
    groups[0].records.map((r) => r.id),
    ["one", "two"],
  );
  assert.equal(groups[0].receivableMinor, 10000);
  assert.equal(groups[0].payableMinor, 3500);
  assert.equal(JSON.stringify(records), before);
});
test("back returns to current person or vault parent, never clears another tab state", () => {
  const people = { personKey: "sam", recordId: "one" },
    vaults = { vaultId: "trip", eventId: "lunch" };
  assert.deepEqual(backPath(people), { personKey: "sam" });
  assert.deepEqual(backPath(vaults), { vaultId: "trip" });
  assert.deepEqual(backPath({ personKey: "sam" }), {});
  assert.deepEqual(backPath({ vaultId: "trip" }), {});
  assert.equal(backPath({}), null);
  assert.deepEqual(vaults, { vaultId: "trip", eventId: "lunch" });
  assert.deepEqual(backPath({ recordId: "recent" }), {});
});

import type { Debt } from "../src/api";
import {
  accountPeople,
  confirmedPersonBalances,
} from "../src/navigation/accountPeople";
function debt(overrides: Partial<Debt>): Debt {
  return {
    id: "accepted",
    lenderId: "me",
    borrowerId: "bob",
    lenderEmail: "me@example.com",
    borrowerEmail: "bob@example.com",
    amountMinor: 10001,
    currency: "AED",
    description: "Lunch",
    status: "accepted",
    createdAt: "2026-11-21",
    history: [],
    ...overrides,
  };
}
test("account groups only unambiguous invitation email with the known counterparty and never merges conflicting identities", () => {
  const accepted = debt({}),
    invitation = debt({
      id: "pending",
      borrowerId: null,
      borrowerEmail: "BOB@example.com",
      status: "pending",
    });
  assert.equal(accountPeople([accepted, invitation], "me").size, 1);
  const conflicting = debt({ id: "other", borrowerId: "another-bob" });
  assert.equal(
    accountPeople([accepted, conflicting, invitation], "me").size,
    3,
  );
  assert.equal(invitation.borrowerId, null);
});
test("counterparty summary separates currencies and directions and excludes pending or disputed amounts", () => {
  const balances = confirmedPersonBalances(
    [
      debt({}),
      debt({ id: "owe", lenderId: "bob", borrowerId: "me", amountMinor: 2000 }),
      debt({ id: "pending", amountMinor: 99000, status: "pending" }),
      debt({ id: "disputed", amountMinor: 99000, status: "disputed" }),
      debt({ id: "usd", currency: "USD", amountMinor: 300 }),
    ],
    "me",
  );
  assert.deepEqual(balances, [
    {
      currency: "AED",
      receivableMinor: 10001,
      payableMinor: 2000,
      netMinor: 8001,
    },
    { currency: "USD", receivableMinor: 300, payableMinor: 0, netMinor: 300 },
  ]);
});
