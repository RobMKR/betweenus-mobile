import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newEventDraft,
  draftParticipantIds,
  previewAllocations,
  buildEventSubmission,
  type EventDraft,
} from "../src/events/draft";
import type { SavedPerson } from "../src/people/model";

function person(id: string, name = "Alex"): SavedPerson {
  return {
    id,
    name,
    source: "custom",
    email: null,
    phone: null,
    createdAt: "2026-11-21T00:00:00Z",
  };
}
const people = [person("a"), person("b")];
function draft(changes: Partial<EventDraft> = {}): EventDraft {
  return {
    ...newEventDraft(new Date(2026, 10, 21, 23, 30)),
    title: "Football",
    amount: "630",
    selectedPersonIds: ["a", "b"],
    ...changes,
  };
}

test("new drafts use local calendar parts and independent mutable fields", () => {
  const now = new Date(2026, 10, 21, 23, 30);
  const first = newEventDraft(now),
    second = newEventDraft(now);
  assert.equal(first.date, "2026-11-21");
  assert.equal(first.includeMe, true);
  assert.equal(first.payerId, "self");
  assert.equal(first.partialPayments, false);
  first.manualAmounts.self = "10";
  first.selectedPersonIds.push("a");
  assert.deepEqual(second.manualAmounts, {});
  assert.deepEqual(second.selectedPersonIds, []);
});

test("local today remains local on both sides of UTC midnight", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    assert.equal(
      newEventDraft(new Date("2026-11-21T12:30:00Z")).date,
      "2026-11-22",
    );
    process.env.TZ = "America/Los_Angeles";
    assert.equal(
      newEventDraft(new Date("2026-11-21T01:30:00Z")).date,
      "2026-11-20",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("630/14 gives45 each; self payer own share leaves585 receivable", () => {
  const group = Array.from({ length: 13 }, (_, index) => person(`p${index}`));
  const input = draft({ selectedPersonIds: group.map((p) => p.id) });
  const preview = previewAllocations(input, group);
  assert.equal(preview.valid, true);
  assert.deepEqual(
    preview.allocations.map((a) => a.shareMinor),
    Array(14).fill(4500),
  );
  assert.equal(
    preview.allocations
      .filter((a) => a.participantId !== input.payerId)
      .reduce((sum, a) => sum + a.shareMinor, 0),
    58500,
  );
  assert.equal(preview.remainingMinor, 0);
});

test("equal remainder follows self-first then selected-person order; equal DTO omits allocations", () => {
  const input = draft({ amount: "1.00", selectedPersonIds: ["b", "a"] });
  assert.deepEqual(previewAllocations(input, people).allocations, [
    { participantId: "self", shareMinor: 34 },
    { participantId: "b", shareMinor: 33 },
    { participantId: "a", shareMinor: 33 },
  ]);
  assert.deepEqual(buildEventSubmission(input, people), {
    title: "Football",
    date: "2026-11-21",
    totalMinor: 100,
    currency: "AED",
    participantIds: ["self", "b", "a"],
    payerId: "self",
    splitMode: "equal",
    partialPayments: false,
  });
});

test("manual zero is valid and exact shares produce only ordered active allocations", () => {
  const input = draft({
    amount: "1.01",
    splitMode: "manual",
    partialPayments: true,
    manualAmounts: { self: "0", a: "1", b: "0.01", removed: "999" },
  });
  const result = buildEventSubmission(input, people);
  assert.deepEqual(result.allocations, [
    { participantId: "self", shareMinor: 0 },
    { participantId: "a", shareMinor: 100 },
    { participantId: "b", shareMinor: 1 },
  ]);
  assert.equal(result.partialPayments, true);
  assert.equal("clientRequestId" in result, false);
  assert.equal("manualAmounts" in result, false);
});

test("manual preview exposes remaining and over-allocation and blocks final save", () => {
  for (const [value, remaining] of [
    ["0.90", 10],
    ["1.10", -10],
  ] as const) {
    const input = draft({
      includeMe: false,
      selectedPersonIds: ["a"],
      amount: "1",
      splitMode: "manual",
      manualAmounts: { a: value },
    });
    const preview = previewAllocations(input, people);
    assert.equal(preview.remainingMinor, remaining);
    assert.equal(preview.valid, false);
    assert.throws(
      () => buildEventSubmission(input, people),
      /unallocated|exceed/,
    );
  }
});

test("manual currency rejects bad precision/negatives and never infers missing input as zero", () => {
  for (const value of [
    "",
    "-1",
    "1.001",
    "1e2",
    "NaN",
    ".5",
    "1.",
    "10000000.01",
  ]) {
    const input = draft({
      includeMe: false,
      selectedPersonIds: ["a"],
      amount: "1",
      splitMode: "manual",
      manualAmounts: { a: value },
    });
    assert.equal(previewAllocations(input, people).valid, false, value);
    assert.throws(() => buildEventSubmission(input, people));
  }
  const inherited = Object.create({ a: "1" }) as Record<string, string>;
  assert.equal(
    previewAllocations(
      draft({
        includeMe: false,
        selectedPersonIds: ["a"],
        amount: "1",
        splitMode: "manual",
        manualAmounts: inherited,
      }),
      people,
    ).valid,
    false,
  );
});

test("manual values survive removed/readded participants and amount/split changes untouched", () => {
  const input = draft({
    amount: "3",
    splitMode: "manual",
    manualAmounts: { self: "1", a: "1", b: "1" },
  });
  const original = JSON.stringify(input);
  const removed = { ...input, selectedPersonIds: ["a"] };
  assert.equal(previewAllocations(removed, people).remainingMinor, 100);
  assert.equal(
    previewAllocations({ ...removed, amount: "2" }, people).valid,
    true,
  );
  assert.equal(
    previewAllocations({ ...removed, splitMode: "equal" }, people).valid,
    true,
  );
  assert.equal(previewAllocations(input, people).valid, true);
  assert.equal(JSON.stringify(input), original);
  assert.equal(removed.manualAmounts.b, "1");
});

test("self can pay outside participants; removed nonself payer requires explicit reselection", () => {
  const input = draft({ includeMe: false, selectedPersonIds: ["a"] });
  assert.deepEqual(buildEventSubmission(input, people).participantIds, ["a"]);
  assert.equal(buildEventSubmission(input, people).payerId, "self");
  assert.equal(
    previewAllocations(input, people).allocations[0].shareMinor,
    63000,
  );
  assert.equal(
    buildEventSubmission({ ...input, payerId: "a" }, people).payerId,
    "a",
  );
  for (const payerId of [null, "b", "missing"]) {
    assert.throws(
      () => buildEventSubmission({ ...input, payerId }, people),
      /payer/,
    );
  }
  assert.equal(input.payerId, "self");
});

test("stable IDs permit equal names but reject duplicate/missing/self saved IDs and bad counts", () => {
  assert.deepEqual(draftParticipantIds(draft(), people), ["self", "a", "b"]);
  for (const selectedPersonIds of [["a", "a"], ["missing"], ["self"]])
    assert.throws(() =>
      draftParticipantIds(draft({ selectedPersonIds }), people),
    );
  assert.throws(
    () =>
      draftParticipantIds(
        draft({ includeMe: false, selectedPersonIds: [] }),
        people,
      ),
    /1–100/,
  );
  assert.throws(
    () => draftParticipantIds(draft(), [...people, person("self")]),
    /separate slot/,
  );
  const hundred = Array.from({ length: 100 }, (_, index) =>
    person(`p${index}`),
  );
  const input = draft({ selectedPersonIds: hundred.map((p) => p.id) });
  assert.throws(() => draftParticipantIds(input, hundred), /1–100/);
  assert.equal(
    draftParticipantIds({ ...input, includeMe: false }, hundred).length,
    100,
  );
});

test("final validation rejects bad title/date/total/mode while accepting exact maximum", () => {
  for (const changes of [
    { title: " " },
    { title: "x".repeat(101) },
    { title: "bad\0title" },
    { date: "2026-02-29" },
    { date: "0000-01-01" },
    { date: "2026-13-01" },
    { amount: "0" },
    { amount: "-1" },
    { amount: "1.001" },
    { amount: "10000000.01" },
    { splitMode: "other" as EventDraft["splitMode"] },
  ])
    assert.throws(
      () => buildEventSubmission(draft(changes), people),
      JSON.stringify(changes),
    );
  assert.equal(
    buildEventSubmission(
      draft({ amount: "10000000", date: "2024-02-29" }),
      people,
    ).totalMinor,
    1_000_000_000,
  );
});
