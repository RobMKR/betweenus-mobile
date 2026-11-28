import type { Currency } from "../currency/model";
import type { EventSubmission } from "./draft";

export type EventParticipant = {
  participantId: string;
  name: string;
  isSelf: boolean;
  shareMinor: number;
  remainingMinor: number;
};
export type EventPayment = {
  id: string;
  participantId: string;
  amountMinor: number;
  createdAt: string;
  reversesId?: string;
};
export type AccountEvent = {
  id: string;
  vaultId: string;
  title: string;
  date: string;
  currency: Currency;
  totalMinor: number;
  payerId: string;
  splitMode: "equal" | "manual";
  partialPayments?: boolean;
  participants: EventParticipant[];
  payments: EventPayment[];
  createdAt: string;
  updatedAt: string;
  balance: {
    currency: Currency;
    receivableMinor: number;
    payableMinor: number;
    netMinor: number;
  };
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Participant order matters; allocation row order does not change a manual intent. */
export function moneyIntentKey(resource: string, body: object): string {
  const fields = body as Record<string, unknown>;
  const allocations = fields.allocations;
  const normalized = Array.isArray(allocations)
    ? {
        ...fields,
        allocations: [...allocations].sort((a, b) =>
          String(a.participantId).localeCompare(String(b.participantId)),
        ),
      }
    : fields;
  return `${resource}:${canonical(normalized)}`;
}

export type AccountMoneyIntent = { clientRequestId: string } & (
  | {
      kind: "event";
      body: Omit<EventSubmission, "partialPayments"> & {
        partialPayments?: boolean;
      };
    }
  | {
      kind: "payment";
      eventId: string;
      eventTitle: string;
      currency?: Currency;
      participantName: string;
      body: { participantId: string; amountMinor: number };
    }
);

/** A retry of the same correction uses the same reference until confirmed. */
export class PendingMoneyIntents {
  private pending = new Map<string, string>();
  constructor(private makeId: () => string) {}
  idFor(key: string) {
    let id = this.pending.get(key);
    if (!id) {
      id = this.makeId();
      this.pending.set(key, id);
    }
    return id;
  }
  succeeded(key: string) {
    this.pending.delete(key);
  }
  clear() {
    this.pending.clear();
  }
}
