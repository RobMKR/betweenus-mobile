import type { SavedPerson } from "../people/model";
import { id, validateLedger, type Event, type Ledger } from "../offline/model";
import type { EventSubmission } from "./draft";

/** Snapshot only names and shares; later roster/People changes cannot rewrite events. */
export function createLocalEvent(
  input: EventSubmission,
  people: SavedPerson[],
): Event {
  if (
    input.currency !== "AED" ||
    !["equal", "manual"].includes(input.splitMode) ||
    input.title.trim().length > 100 ||
    input.title.includes("\0") ||
    new Set(input.participantIds).size !== input.participantIds.length
  )
    throw new Error("Invalid event submission.");
  if (input.splitMode === "manual") {
    const rows = input.allocations || [];
    if (
      rows.length !== input.participantIds.length ||
      new Set(rows.map((row) => row.participantId)).size !== rows.length ||
      rows.some((row) => !input.participantIds.includes(row.participantId))
    )
      throw new Error("Allocate each participant exactly once.");
  } else if (input.allocations !== undefined)
    throw new Error("Equal split does not accept manual allocations.");
  const byId = new Map(people.map((person) => [person.id, person]));
  const participants = input.participantIds.map((participantId) => {
    const person = byId.get(participantId);
    if (participantId !== "self" && !person)
      throw new Error("Saved participant not found.");
    return {
      id: participantId,
      name: participantId === "self" ? "You" : person!.name,
      isSelf: participantId === "self",
    };
  });
  const shares =
    input.splitMode === "manual"
      ? Object.fromEntries(
          (input.allocations || []).map((allocation) => [
            allocation.participantId,
            allocation.shareMinor,
          ]),
        )
      : Object.fromEntries(
          participants.map((person, index) => [
            person.id,
            Math.floor(input.totalMinor / participants.length) +
              Number(index < input.totalMinor % participants.length),
          ]),
        );
  const event: Event = {
    id: id(),
    title: input.title,
    date: input.date,
    totalMinor: input.totalMinor,
    payerId: input.payerId,
    splitMode: input.splitMode,
    partialPayments: input.partialPayments,
    shares,
    participants,
    payments: {},
  };
  validateLedger({
    version: 3,
    people,
    records: [],
    vaults: [
      {
        id: "validation-vault",
        title: "Event",
        kind: "temporary",
        archived: false,
        events: [event],
      },
    ],
  } satisfies Ledger);
  return event;
}
