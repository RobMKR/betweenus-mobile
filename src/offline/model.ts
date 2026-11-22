import { validateMemberIds } from "../vaults/roster";
import { validateSavedPerson, type SavedPerson } from "../people/model";
/** Device-only ledger. Every amount is an integer AED minor unit. */
export type Payment = {
  id: string;
  amountMinor: number;
  createdAt: string;
  reversesId?: string;
};
export type Person = { id: string; name: string; isSelf: boolean };
export type LocalRecord = {
  id: string;
  name: string;
  direction: "lent" | "borrowed";
  amountMinor: number;
  date: string;
  note: string;
  payments: Payment[];
  personId?: string;
};
export type Event = {
  id: string;
  title: string;
  date: string;
  totalMinor: number;
  payerId: string;
  participants: Person[];
  payments: Record<string, Payment[]>;
};
export type Vault = {
  id: string;
  title: string;
  kind: "temporary" | "permanent";
  archived: boolean;
  events: Event[];
  memberIds?: string[];
};
export type Ledger = {
  version: 1 | 2;
  records: LocalRecord[];
  vaults: Vault[];
  people?: SavedPerson[];
};
export const emptyLedger = (): Ledger => ({
  version: 2,
  people: [],
  records: [],
  vaults: [],
});
export const MAX_MINOR = 1_000_000_000;
export function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
export function text(value: string, label: string, max = 200): string {
  const result = value.trim();
  if (!result || result.length > max)
    throw new Error(`${label} must be 1–${max} characters.`);
  return result;
}
export function validDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("Use a valid date in YYYY-MM-DD format.");
  return value;
}
export function validMinor(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_MINOR)
    throw new Error("Enter a positive amount up to AED 10,000,000.");
  return value;
}
export function historyFor(event: Event, personId: string): Payment[] {
  return Object.prototype.hasOwnProperty.call(event.payments, personId)
    ? event.payments[personId]
    : [];
}
export function paid(payments: Payment[]) {
  return payments.reduce((sum, p) => sum + p.amountMinor, 0);
}
export function remaining(amountMinor: number, payments: Payment[]) {
  return amountMinor - paid(payments);
}
export function addPayment(
  amountMinor: number,
  payments: Payment[],
  value: number,
): Payment[] {
  validMinor(value);
  if (value > remaining(amountMinor, payments))
    throw new Error("Payment cannot exceed the remaining amount.");
  return [
    ...payments,
    { id: id(), amountMinor: value, createdAt: new Date().toISOString() },
  ];
}
export function undoPayment(payments: Payment[], paymentId: string): Payment[] {
  const original = payments.find((p) => p.id === paymentId);
  if (
    !original ||
    original.amountMinor <= 0 ||
    payments.some((p) => p.reversesId === paymentId)
  )
    throw new Error("This payment cannot be undone.");
  return [
    ...payments,
    {
      id: id(),
      amountMinor: -original.amountMinor,
      createdAt: new Date().toISOString(),
      reversesId: paymentId,
    },
  ];
}
export function participants(names: string[], selfIndex: number): Person[] {
  if (names.length < 2 || names.length > 100)
    throw new Error("Add 2–100 participants, including yourself.");
  if (
    !Number.isInteger(selfIndex) ||
    selfIndex < 0 ||
    selfIndex >= names.length
  )
    throw new Error("Select yourself in the participant list.");
  const clean = names.map((name) => text(name, "Participant name", 80));
  if (
    new Set(clean.map((n) => n.normalize("NFKC").toLocaleLowerCase())).size !==
    clean.length
  )
    throw new Error("Participant names must be unique.");
  return clean.map((name, index) => ({
    id: id(),
    name,
    isSelf: index === selfIndex,
  }));
}
// Remainder cents go to participants in saved order; the payer keeps their own share.
export function split(
  totalMinor: number,
  people: Person[],
): Record<string, number> {
  validMinor(totalMinor);
  if (!people.length) throw new Error("Participants are required.");
  const each = Math.floor(totalMinor / people.length),
    extra = totalMinor % people.length;
  return Object.fromEntries(
    people.map((p, index) => [p.id, each + (index < extra ? 1 : 0)]),
  );
}
export function createEvent(input: {
  title: string;
  date: string;
  totalMinor: number;
  names: string[];
  selfIndex: number;
  payerIndex: number;
}): Event {
  const people = participants(input.names, input.selfIndex);
  if (!Number.isInteger(input.payerIndex) || !people[input.payerIndex])
    throw new Error("Choose who paid.");
  return {
    id: id(),
    title: text(input.title, "Event title"),
    date: validDate(input.date),
    totalMinor: validMinor(input.totalMinor),
    payerId: people[input.payerIndex].id,
    participants: people,
    payments: {},
  };
}
export function eventRemaining(event: Event, personId: string) {
  if (!event.participants.some((p) => p.id === personId))
    throw new Error("Participant not found.");
  return personId === event.payerId
    ? 0
    : remaining(
        split(event.totalMinor, event.participants)[personId],
        historyFor(event, personId),
      );
}
export function eventBalances(event: Event) {
  const self = event.participants.find((p) => p.isSelf)!;
  return event.payerId === self.id
    ? {
        receivableMinor: event.participants.reduce(
          (sum, p) => sum + eventRemaining(event, p.id),
          0,
        ),
        payableMinor: 0,
      }
    : { receivableMinor: 0, payableMinor: eventRemaining(event, self.id) };
}
export function eventPayment(
  event: Event,
  personId: string,
  value: number,
): Event {
  if (personId === event.payerId)
    throw new Error("The payer has no repayment due.");
  eventRemaining(event, personId);
  const share = split(event.totalMinor, event.participants)[personId];
  return {
    ...event,
    payments: {
      ...event.payments,
      [personId]: addPayment(share, historyFor(event, personId), value),
    },
  };
}
export function eventUndo(
  event: Event,
  personId: string,
  paymentId: string,
): Event {
  return {
    ...event,
    payments: {
      ...event.payments,
      [personId]: undoPayment(historyFor(event, personId), paymentId),
    },
  };
}
export function totals(ledger: Ledger) {
  let receivableMinor = 0,
    payableMinor = 0;
  for (const record of ledger.records) {
    const value = remaining(record.amountMinor, record.payments);
    if (record.direction === "lent") receivableMinor += value;
    else payableMinor += value;
  }
  for (const vault of ledger.vaults) {
    for (const event of vault.events) {
      const balance = eventBalances(event);
      receivableMinor += balance.receivableMinor;
      payableMinor += balance.payableMinor;
    }
  }
  return { receivableMinor, payableMinor };
}
export function updateEvent(
  ledger: Ledger,
  vaultId: string,
  eventId: string,
  change: (event: Event) => Event,
): Ledger {
  const vault = ledger.vaults.find((v) => v.id === vaultId);
  if (!vault || vault.archived)
    throw new Error("Reactivate this vault before changing events.");
  if (!vault.events.some((e) => e.id === eventId))
    throw new Error("Event not found.");
  return {
    ...ledger,
    vaults: ledger.vaults.map((v) =>
      v.id !== vaultId
        ? v
        : {
            ...v,
            events: v.events.map((e) => (e.id === eventId ? change(e) : e)),
          },
    ),
  };
}
function validatePayments(amount: number, items: Payment[]) {
  if (!Array.isArray(items)) throw new Error("Invalid payment history.");
  const seen = new Map<string, Payment>();
  const reversed = new Set<string>();
  let balance = 0;
  for (const p of items) {
    text(p.id, "Payment ID");
    if (
      seen.has(p.id) ||
      !Number.isSafeInteger(p.amountMinor) ||
      p.amountMinor === 0 ||
      !Number.isFinite(Date.parse(p.createdAt))
    )
      throw new Error("Invalid payment history.");
    if (p.amountMinor < 0) {
      const original = seen.get(p.reversesId || "");
      if (
        !original ||
        original.amountMinor <= 0 ||
        original.amountMinor !== -p.amountMinor ||
        reversed.has(original.id)
      )
        throw new Error("Invalid payment correction.");
      reversed.add(original.id);
    } else if (p.reversesId) throw new Error("Invalid payment correction.");
    balance += p.amountMinor;
    if (balance < 0 || balance > amount)
      throw new Error("Invalid payment balance.");
    seen.set(p.id, p);
  }
}
/** Refuse corrupt/unsupported data rather than replacing it with an empty ledger. */
export function validateLedger(value: unknown): Ledger {
  const data = value as Ledger;
  if (
    !data ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.records) ||
    !Array.isArray(data.vaults)
  )
    throw new Error("Unsupported or damaged local records.");
  if (data.version === 1 && data.people !== undefined)
    throw new Error("Unsupported legacy People data.");
  if (data.version === 2 && !Array.isArray(data.people))
    throw new Error("Invalid saved People data.");
  const personIds = new Set<string>();
  for (const person of data.people || []) {
    validateSavedPerson(person);
    if (personIds.has(person.id)) throw new Error("Duplicate saved person ID.");
    personIds.add(person.id);
  }
  const ids = new Set<string>();
  function unique(value: string) {
    text(value, "Record ID");
    if (ids.has(value)) throw new Error("Duplicate local record ID.");
    ids.add(value);
  }
  for (const r of data.records) {
    unique(r.id);
    text(r.name, "Name", 100);
    if (
      r.personId !== undefined &&
      (typeof r.personId !== "string" || !personIds.has(r.personId))
    )
      throw new Error("Saved person link is invalid.");
    if (
      !["lent", "borrowed"].includes(r.direction) ||
      typeof r.note !== "string" ||
      r.note.length > 500
    )
      throw new Error("Invalid local record.");
    validDate(r.date);
    validMinor(r.amountMinor);
    validatePayments(r.amountMinor, r.payments);
  }
  for (const v of data.vaults) {
    unique(v.id);
    text(v.title, "Vault title");
    if (
      !["temporary", "permanent"].includes(v.kind) ||
      typeof v.archived !== "boolean" ||
      !Array.isArray(v.events)
    )
      throw new Error("Invalid vault.");
    if (v.memberIds !== undefined) {
      if (data.version !== 2)
        throw new Error("Unsupported legacy roster data.");
      validateMemberIds(v.memberIds, personIds);
    }
    for (const e of v.events) {
      unique(e.id);
      text(e.title, "Event title");
      validDate(e.date);
      validMinor(e.totalMinor);
      if (
        !Array.isArray(e.participants) ||
        e.participants.filter((p) => p.isSelf === true).length !== 1 ||
        e.participants.some((p) => typeof p.isSelf !== "boolean")
      )
        throw new Error("Invalid participants.");
      participants(
        e.participants.map((p) => p.name),
        e.participants.findIndex((p) => p.isSelf),
      );
      const pids = new Set<string>();
      for (const p of e.participants) {
        text(p.id, "Participant ID");
        if (pids.has(p.id)) throw new Error("Duplicate participant ID.");
        pids.add(p.id);
      }
      if (
        !pids.has(e.payerId) ||
        !e.payments ||
        typeof e.payments !== "object" ||
        Array.isArray(e.payments)
      )
        throw new Error("Invalid event payer.");
      const shares = split(e.totalMinor, e.participants);
      for (const [pid, history] of Object.entries(e.payments)) {
        if (!pids.has(pid) || pid === e.payerId)
          throw new Error("Invalid payment participant.");
        validatePayments(shares[pid], history);
      }
    }
  }
  return data;
}

/** Read-only upgrade; the original v1 disk value is retained until a successful write. */
export function migrateLedger(value: unknown): Ledger {
  const data = validateLedger(value);
  return data.version === 1 ? { ...data, version: 2, people: [] } : data;
}
