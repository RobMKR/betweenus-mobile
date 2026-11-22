import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moneyIntentKey,
  PendingMoneyIntents,
} from "../src/events/accountTypes";

test("uncertain retries retain nonce; success permits a later identical new payment", () => {
  let sequence = 0;
  const intents = new PendingMoneyIntents(() => `nonce-${++sequence}`);
  const key = moneyIntentKey("/events/e/payments", {
    participantId: "a",
    amountMinor: 100,
  });
  assert.equal(intents.idFor(key), "nonce-1");
  assert.equal(intents.idFor(key), "nonce-1");
  const changed = moneyIntentKey("/events/e/payments", {
    participantId: "a",
    amountMinor: 101,
  });
  assert.equal(intents.idFor(changed), "nonce-2");
  assert.equal(intents.idFor(key), "nonce-1");
  intents.succeeded(key);
  assert.equal(intents.idFor(key), "nonce-3");
  assert.equal(intents.idFor(changed), "nonce-2");
  intents.clear();
  assert.equal(intents.idFor(changed), "nonce-4");
});

test("intent canonicalization ignores key/allocation-row order but preserves participants and resource", () => {
  const body = {
    participantIds: ["a", "b"],
    allocations: [
      { participantId: "a", shareMinor: 10 },
      { participantId: "b", shareMinor: 20 },
    ],
  };
  const same = {
    allocations: [...body.allocations].reverse(),
    participantIds: [...body.participantIds],
  };
  assert.equal(
    moneyIntentKey("/events", body),
    moneyIntentKey("/events", same),
  );
  assert.notEqual(
    moneyIntentKey("/events", body),
    moneyIntentKey("/events", { ...body, participantIds: ["b", "a"] }),
  );
  assert.notEqual(
    moneyIntentKey("/events", body),
    moneyIntentKey("/other", body),
  );
  assert.notEqual(
    moneyIntentKey("/events", body),
    moneyIntentKey("/events", {
      ...body,
      allocations: [
        { participantId: "a", shareMinor: 11 },
        { participantId: "b", shareMinor: 19 },
      ],
    }),
  );
});
