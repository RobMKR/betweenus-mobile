import {
  amountToMinor,
  exponent,
  LEGACY_CURRENCY,
  MAX_MINOR,
  amountInput,
  type Currency,
} from "../currency/model";
import { localCalendarDate } from "../offline/eventDate";
import type { SavedPerson } from "../people/model";

export type EventDraft = {
  title: string;
  date: string;
  amount: string;
  selectedPersonIds: string[];
  includeMe: boolean;
  payerId: string | null;
  splitMode: "equal" | "manual";
  manualAmounts: Record<string, string>;
  partialPayments: boolean;
};
export type EventAllocation = { participantId: string; shareMinor: number };
export type EventSubmission = {
  title: string;
  date: string;
  totalMinor: number;
  currency: Currency;
  participantIds: string[];
  payerId: string;
  splitMode: "equal" | "manual";
  allocations?: EventAllocation[];
  partialPayments: boolean;
};
export type AllocationPreview = {
  participantIds: string[];
  totalMinor: number | null;
  allocations: EventAllocation[];
  allocatedMinor: number;
  remainingMinor: number | null;
  errors: string[];
  valid: boolean;
};

export function newEventDraft(now = new Date()): EventDraft {
  return {
    title: "",
    date: localCalendarDate(now),
    amount: "",
    selectedPersonIds: [],
    includeMe: true,
    payerId: "self",
    splitMode: "equal",
    manualAmounts: {},
    partialPayments: false,
  };
}

/** Stable IDs determine identity and order; matching display names never merge. */
export function draftParticipantIds(
  draft: EventDraft,
  people: SavedPerson[],
): string[] {
  if (people.some((person) => person.id === "self"))
    throw new Error("Self is a separate slot, not a saved person.");
  const savedIds = new Set(people.map((person) => person.id));
  if (draft.selectedPersonIds.some((id) => id === "self" || !savedIds.has(id)))
    throw new Error(
      "Choose participants from saved People; use Include me for yourself.",
    );
  if (new Set(draft.selectedPersonIds).size !== draft.selectedPersonIds.length)
    throw new Error("Select each person only once.");
  const ids = [
    ...(draft.includeMe ? ["self"] : []),
    ...draft.selectedPersonIds,
  ];
  if (ids.length < 1 || ids.length > 100)
    throw new Error(
      "Choose 1–100 participants, including yourself if selected.",
    );
  return ids;
}

/** Money-only preview; title/date/payer validation belongs to final submission. */
export function previewAllocations(
  draft: EventDraft,
  people: SavedPerson[],
  currency: Currency = LEGACY_CURRENCY,
): AllocationPreview {
  const errors: string[] = [];
  const totalMinor = amountToMinor(draft.amount, currency);
  if (totalMinor === null)
    errors.push(
      `Enter a positive total up to ${currency} ${amountInput(MAX_MINOR, currency)}, with ${exponent(currency) ? `at most ${exponent(currency)} decimal places` : "no decimal places"}.`,
    );
  let participantIds: string[] = [];
  try {
    participantIds = draftParticipantIds(draft, people);
  } catch (e) {
    errors.push((e as Error).message);
  }
  const allocations: EventAllocation[] = [];
  if (draft.splitMode === "equal") {
    if (totalMinor !== null && participantIds.length) {
      const base = Math.floor(totalMinor / participantIds.length);
      const remainder = totalMinor % participantIds.length;
      allocations.push(
        ...participantIds.map((participantId, index) => ({
          participantId,
          shareMinor: base + (index < remainder ? 1 : 0),
        })),
      );
    }
  } else if (draft.splitMode === "manual") {
    for (const participantId of participantIds) {
      const input = Object.prototype.hasOwnProperty.call(
        draft.manualAmounts,
        participantId,
      )
        ? draft.manualAmounts[participantId]
        : "";
      const shareMinor = amountToMinor(input, currency, true);
      if (shareMinor === null) {
        const name =
          participantId === "self"
            ? "You"
            : people.find((person) => person.id === participantId)?.name ||
              "Participant";
        errors.push(
          `${name}: enter a nonnegative share with ${exponent(currency) ? `at most ${exponent(currency)} decimal places` : "no decimal places"} (zero is allowed).`,
        );
      } else allocations.push({ participantId, shareMinor });
    }
  } else errors.push("Choose equal or manual splitting.");
  const allocatedMinor = allocations.reduce(
    (sum, allocation) => sum + allocation.shareMinor,
    0,
  );
  const remainingMinor =
    totalMinor === null ? null : totalMinor - allocatedMinor;
  if (draft.splitMode === "manual" && remainingMinor !== null) {
    if (remainingMinor > 0)
      errors.push("Some of the total is still unallocated.");
    else if (remainingMinor < 0) errors.push("Shares exceed the event total.");
  }
  return {
    participantIds,
    totalMinor,
    allocations,
    allocatedMinor,
    remainingMinor,
    errors,
    valid: errors.length === 0,
  };
}

/** Whitelist API13 fields. The caller owns the stable retry nonce, not this draft. */
export function buildEventSubmission(
  draft: EventDraft,
  people: SavedPerson[],
  currency: Currency = LEGACY_CURRENCY,
): EventSubmission {
  const title = draft.title.trim();
  // The guided UI deliberately uses the same 100-character limit as People/vaults.
  if (!title || title.length > 100 || title.includes("\0"))
    throw new Error("Enter an event title up to 100 characters.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    draft.date.startsWith("0000-") ||
    !Number.isFinite(Date.parse(`${draft.date}T00:00:00Z`)) ||
    new Date(`${draft.date}T00:00:00Z`).toISOString().slice(0, 10) !==
      draft.date
  )
    throw new Error("Use a valid date in YYYY-MM-DD format.");
  const preview = previewAllocations(draft, people, currency);
  if (!preview.valid || preview.totalMinor === null)
    throw new Error(preview.errors.join(" "));
  if (
    !draft.payerId ||
    (draft.payerId !== "self" &&
      !preview.participantIds.includes(draft.payerId))
  )
    throw new Error(
      "Choose a payer. A payer other than you must be a selected participant.",
    );
  return {
    title,
    date: draft.date,
    totalMinor: preview.totalMinor,
    currency,
    participantIds: preview.participantIds,
    payerId: draft.payerId,
    splitMode: draft.splitMode,
    partialPayments: draft.partialPayments,
    ...(draft.splitMode === "manual"
      ? { allocations: preview.allocations }
      : {}),
  };
}
