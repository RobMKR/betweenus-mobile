import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { amountToMinor, ApiRequestError, money, request } from "../api";
import { Button, Field, Sheet, useUi } from "../offline/ui";
import {
  personRequest,
  validateSavedPerson,
  type PersonInput,
  type SavedPerson,
} from "../people/model";
import EventWizard from "./EventWizard";
import type { EventSubmission } from "./draft";
import {
  moneyIntentKey,
  PendingMoneyIntents,
  type AccountEvent,
  type AccountMoneyIntent,
  type EventParticipant,
} from "./accountTypes";

export type AccountEventsProps = {
  token: string;
  ownerId: string;
  vault: { id: string; title: string; archived: boolean; memberIds: string[] };
  people: SavedPerson[];
  onPersonCreated: (person: SavedPerson) => void;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onChanged: () => void;
};

// Keep exact unconfirmed writes across navigation in the current app runtime.
const unresolvedMoneyIntents = new Map<string, AccountMoneyIntent>();

const ledgerRejections: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  VAULT_ARCHIVED: 409,
  PAYER_PAYMENT: 409,
  FULL_PAYMENT_REQUIRED: 409,
  OVERPAYMENT: 409,
};

export default function AccountEvents(props: AccountEventsProps) {
  const { s } = useUi();
  const { vault, people, selectedEventId } = props;
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false),
    generation = useRef(0);
  const listSequence = useRef(0),
    detailSequence = useRef(0);
  const lock = useRef(false);
  const undoIntents = useRef(new PendingMoneyIntents(randomUUID));
  const scope = JSON.stringify([props.ownerId, vault.id]);
  const pending = unresolvedMoneyIntents.get(scope);
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [event, setEvent] = useState<AccountEvent | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState(false),
    [wizardError, setWizardError] = useState("");
  const [paying, setPaying] = useState<EventParticipant | null>(null);
  const [amount, setAmount] = useState(""),
    [paymentError, setPaymentError] = useState("");
  const [addedPeople, setAddedPeople] = useState<SavedPerson[]>([]);
  const allPeople = [
    ...people,
    ...addedPeople.filter((p) => !people.some((item) => item.id === p.id)),
  ];
  function context() {
    return {
      generation: generation.current,
      owner: latest.current.ownerId,
      vault: latest.current.vault.id,
    };
  }
  function current(captured: ReturnType<typeof context>) {
    return (
      active.current &&
      captured.generation === generation.current &&
      captured.owner === latest.current.ownerId &&
      captured.vault === latest.current.vault.id
    );
  }
  async function loadList() {
    const captured = context(),
      sequence = ++listSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<{ events: AccountEvent[] }>(
        `/vaults/${encodeURIComponent(captured.vault)}/events`,
        latest.current.token,
      );
      if (current(captured) && sequence === listSequence.current)
        setEvents(result.events);
    } catch (e) {
      if (current(captured) && sequence === listSequence.current)
        setError((e as Error).message);
    } finally {
      if (current(captured) && sequence === listSequence.current)
        setLoading(false);
    }
  }
  async function loadDetail(id: string) {
    const captured = context(),
      sequence = ++detailSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<{ event: AccountEvent }>(
        `/events/${encodeURIComponent(id)}`,
        latest.current.token,
      );
      if (
        current(captured) &&
        sequence === detailSequence.current &&
        latest.current.selectedEventId === id
      ) {
        if (result.event.vaultId !== captured.vault)
          throw new Error("This event does not belong to the selected vault.");
        setEvent(result.event);
      }
    } catch (e) {
      if (current(captured) && sequence === detailSequence.current)
        setError((e as Error).message);
    } finally {
      if (current(captured) && sequence === detailSequence.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    generation.current++;
    lock.current = false;
    undoIntents.current.clear();
    setEvents([]);
    setEvent(null);
    setBusy(false);
    setWizard(false);
    setWizardError("");
    setPaying(null);
    setAddedPeople([]);
    return () => {
      active.current = false;
      generation.current++;
    };
  }, [props.ownerId, vault.id]);
  useEffect(() => {
    detailSequence.current++;
    listSequence.current++;
    setError("");
    setPaying(null);
    if (selectedEventId) {
      setEvent((value) => (value?.id === selectedEventId ? value : null));
      void loadDetail(selectedEventId);
    } else {
      setEvent(null);
      void loadList();
    }
  }, [props.ownerId, vault.id, selectedEventId]);

  function publish(saved: AccountEvent) {
    // Invalidate reads started before the mutation; they must not overwrite fresh state.
    listSequence.current++;
    detailSequence.current++;
    setLoading(false);
    setEvents((items) => [
      saved,
      ...items.filter((item) => item.id !== saved.id),
    ]);
    if (latest.current.selectedEventId === saved.id) setEvent(saved);
    latest.current.onChanged();
  }
  async function submitMoney(intent: AccountMoneyIntent) {
    const captured = context();
    const existing = unresolvedMoneyIntents.get(scope);
    if (
      lock.current ||
      !current(captured) ||
      captured.owner !== props.ownerId ||
      captured.vault !== vault.id ||
      (existing && existing !== intent)
    )
      return false;
    lock.current = true;
    unresolvedMoneyIntents.set(scope, intent);
    setBusy(true);
    setError("");
    setPaymentError("");
    setWizardError("");
    const path =
      intent.kind === "event"
        ? `/vaults/${encodeURIComponent(captured.vault)}/events`
        : `/events/${encodeURIComponent(intent.eventId)}/payments`;
    function settle() {
      if (unresolvedMoneyIntents.get(scope) === intent)
        unresolvedMoneyIntents.delete(scope);
    }
    try {
      const { event: saved } = await request<{ event: AccountEvent }>(
        path,
        latest.current.token,
        { ...intent.body, clientRequestId: intent.clientRequestId },
      );
      if (
        !saved?.id ||
        saved.vaultId !== captured.vault ||
        (intent.kind === "payment" && saved.id !== intent.eventId)
      )
        throw new Error("The server did not confirm the ledger entry.");
      if (!current(captured)) return false;
      settle();
      publish(saved);
      if (intent.kind === "event") {
        setWizard(false);
        latest.current.onSelectEvent(saved.id);
      } else {
        setPaying(null);
      }
      return true;
    } catch (e) {
      if (!current(captured)) return false;
      // These are explicit ledger rejections. An idempotent replay of an
      // existing entry returns the event before checking these write rules.
      const rejected =
        e instanceof ApiRequestError &&
        ledgerRejections[e.code ?? ""] === e.status;
      let message = (e as Error).message;
      if (rejected) {
        settle();
        if (
          !paying &&
          (e.code === "FULL_PAYMENT_REQUIRED" || e.code === "OVERPAYMENT")
        )
          message += " Reload the event to see the current remaining share.";
      } else {
        message +=
          " The result is uncertain. Retry this request to confirm it or finish saving it.";
      }
      setError(message);
      if (intent.kind === "event") setWizardError(message);
      else setPaymentError(message);
      return false;
    } finally {
      if (current(captured)) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function saveEvent(body: EventSubmission) {
    const prior = unresolvedMoneyIntents.get(scope);
    if (prior) {
      if (
        prior.kind === "event" &&
        moneyIntentKey("", prior.body) === moneyIntentKey("", body)
      )
        return submitMoney(prior);
      setWizardError(
        "Close this draft and resolve the pending request before saving a changed expense.",
      );
      return false;
    }
    if (latest.current.vault.archived) {
      setWizardError(
        "This vault is archived. Close the draft and reactivate the vault before saving a new expense.",
      );
      return false;
    }
    return submitMoney({ kind: "event", body, clientRequestId: randomUUID() });
  }
  async function createPerson(input: PersonInput): Promise<SavedPerson | null> {
    if (lock.current) return null;
    const body = personRequest(input);
    lock.current = true;
    setBusy(true);
    const captured = context();
    try {
      const { person } = await request<{ person: SavedPerson }>(
        "/people",
        latest.current.token,
        body,
      );
      if (!current(captured)) return null;
      validateSavedPerson(person);
      setAddedPeople((items) => [
        ...items.filter((p) => p.id !== person.id),
        person,
      ]);
      latest.current.onPersonCreated(person);
      return person;
    } catch (e) {
      if (!current(captured)) return null;
      throw new Error(
        `${(e as Error).message} If the save response was interrupted, check People before saving again to avoid duplicates.`,
      );
    } finally {
      if (current(captured)) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function savePayment() {
    if (!event || !paying || lock.current) return;
    const prior = unresolvedMoneyIntents.get(scope);
    if (prior) {
      if (
        prior.kind === "payment" &&
        prior.eventId === event.id &&
        prior.body.participantId === paying.participantId
      )
        await submitMoney(prior);
      return;
    }
    await recordPayment(event, paying.participantId, amountToMinor(amount));
  }
  async function recordPayment(
    target: AccountEvent,
    participantId: string,
    amountMinor: number | null,
  ) {
    if (
      latest.current.vault.archived ||
      latest.current.selectedEventId !== target.id ||
      unresolvedMoneyIntents.has(scope) ||
      lock.current
    )
      return;
    const participant = target.participants.find(
      (p) => p.participantId === participantId,
    );
    if (
      !amountMinor ||
      !participant ||
      participantId === target.payerId ||
      amountMinor > participant.remainingMinor
    ) {
      setPaymentError(
        "Enter a positive amount no greater than the remaining share.",
      );
      return;
    }
    await submitMoney({
      kind: "payment",
      eventId: target.id,
      eventTitle: target.title,
      participantName: participant.isSelf ? "you" : participant.name,
      body: { participantId, amountMinor },
      clientRequestId: randomUUID(),
    });
  }
  async function undoPayment(paymentId: string) {
    if (!event || lock.current || latest.current.vault.archived) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const captured = context();
    const path = `/events/${encodeURIComponent(event.id)}/payments/${encodeURIComponent(paymentId)}/undo`;
    const key = moneyIntentKey(path, {});
    try {
      const clientRequestId = undoIntents.current.idFor(key);
      const { event: saved } = await request<{ event: AccountEvent }>(
        path,
        latest.current.token,
        { clientRequestId },
      );
      if (!current(captured)) return;
      undoIntents.current.succeeded(key);
      publish(saved);
    } catch (e) {
      if (current(captured))
        setError(
          `${(e as Error).message} Retry the same undo safely; its reference is retained.`,
        );
    } finally {
      if (current(captured)) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function setArchived(archived: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const captured = context();
    try {
      await request(
        `/vaults/${encodeURIComponent(captured.vault)}/archive`,
        latest.current.token,
        { archived },
      );
      if (current(captured)) latest.current.onChanged();
    } catch (e) {
      if (current(captured))
        setError(
          `${(e as Error).message} Refresh the vault to inspect its archive state, or retry this same action.`,
        );
    } finally {
      if (current(captured)) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const visibleEvent = event?.id === selectedEventId ? event : null;
  return (
    <View style={{ gap: 16 }}>
      {pending && !wizard && !paying && (
        <View style={s.card}>
          <Text accessibilityRole="alert" style={s.cardTitle}>
            {pending.kind === "event"
              ? "Expense save unconfirmed"
              : "Payment save unconfirmed"}
          </Text>
          <Text style={s.body}>
            {pending.kind === "event"
              ? `${pending.body.title} · ${money(pending.body.totalMinor)}`
              : `${pending.eventTitle} · ${pending.participantName} · ${money(pending.body.amountMinor)}`}
          </Text>
          <Text style={s.small}>
            Retry the original request to confirm it or finish saving it. Then
            you can record a new expense or payment.
          </Text>
          <Button
            title={
              pending.kind === "event" ? "Retry event save" : "Retry payment"
            }
            disabled={busy}
            onPress={() => void submitMoney(pending)}
          />
        </View>
      )}
      {selectedEventId ? (
        <>
          <Button
            title="Back to events"
            secondary
            disabled={busy}
            onPress={() => latest.current.onSelectEvent(null)}
          />
          {visibleEvent && (
            <>
              <Text style={s.eyebrow}>PRIVATE VAULT EXPENSE</Text>
              <Text style={s.title}>{visibleEvent.title}</Text>
              <Text style={s.body}>
                {visibleEvent.date} ·{" "}
                {visibleEvent.splitMode === "manual"
                  ? "Manual shares"
                  : "Equal shares"}
              </Text>
              <Text style={s.amount}>{money(visibleEvent.totalMinor)}</Text>
              <Text style={s.small}>
                Paid by{" "}
                {visibleEvent.payerId === "self"
                  ? "you"
                  : visibleEvent.participants.find(
                      (p) => p.participantId === visibleEvent.payerId,
                    )?.name || "saved participant"}
                . Names and shares are snapshots from the event save.
              </Text>
              <View style={s.card}>
                <Text style={s.section}>Your private event balance</Text>
                <Text style={s.body}>
                  Receivable {money(visibleEvent.balance.receivableMinor)} ·
                  Payable {money(visibleEvent.balance.payableMinor)}
                </Text>
                <Text style={s.small}>
                  Separate from accepted shared debts. Recording a payment
                  updates this private ledger; no money is transferred.
                </Text>
              </View>
              <Text style={s.section}>Participants</Text>
              {visibleEvent.participants.map((participant, index) => (
                <View key={participant.participantId} style={s.card}>
                  <Text style={s.cardTitle}>
                    {participant.isSelf
                      ? "You"
                      : participant.name
                            .normalize("NFKC")
                            .trim()
                            .toLocaleLowerCase() === "you"
                        ? `${participant.name} · saved person`
                        : participant.name}
                  </Text>
                  <Text style={s.small}>
                    Participant {index + 1} · Share{" "}
                    {money(participant.shareMinor)} · Remaining{" "}
                    {money(participant.remainingMinor)}
                    {participant.participantId === visibleEvent.payerId
                      ? " · Payer's own share"
                      : participant.remainingMinor === 0
                        ? " · Paid in full"
                        : ""}
                  </Text>
                  {participant.participantId !== visibleEvent.payerId &&
                    participant.remainingMinor > 0 && (
                      <Button
                        title={
                          visibleEvent.partialPayments === false
                            ? "Paid"
                            : `Record payment for ${participant.isSelf ? "you" : participant.name}`
                        }
                        accessibilityLabel={
                          visibleEvent.partialPayments === false
                            ? `Mark ${participant.isSelf ? "your share" : participant.name} paid`
                            : undefined
                        }
                        secondary
                        disabled={busy || vault.archived || !!pending}
                        onPress={() => {
                          if (visibleEvent.partialPayments === false) {
                            void recordPayment(
                              visibleEvent,
                              participant.participantId,
                              participant.remainingMinor,
                            );
                            return;
                          }
                          setPaying(participant);
                          setAmount("");
                          setPaymentError("");
                        }}
                      />
                    )}
                </View>
              ))}
              <Text style={s.section}>Payment history</Text>
              {!visibleEvent.payments.length && (
                <Text style={s.body}>No payments recorded.</Text>
              )}
              {visibleEvent.payments.map((payment) => {
                const participant = visibleEvent.participants.find(
                  (p) => p.participantId === payment.participantId,
                );
                const reversed = visibleEvent.payments.some(
                  (p) => p.reversesId === payment.id,
                );
                return (
                  <View key={payment.id} style={s.history}>
                    <Text style={s.label}>
                      {payment.amountMinor < 0
                        ? "Payment reversed"
                        : "Payment recorded"}{" "}
                      ·{" "}
                      {participant?.isSelf
                        ? "You"
                        : participant?.name || "Participant"}
                    </Text>
                    <Text style={s.body}>
                      {money(payment.amountMinor)} ·{" "}
                      {new Date(payment.createdAt).toLocaleString()}
                    </Text>
                    {!!payment.reversesId && (
                      <Text style={s.small}>
                        Correction of payment {payment.reversesId}
                      </Text>
                    )}
                    {reversed && (
                      <Text style={s.small}>
                        Reversed; the original entry is retained.
                      </Text>
                    )}
                    {payment.amountMinor > 0 && !reversed && (
                      <Button
                        title={`Undo payment ${payment.id}`}
                        secondary
                        disabled={busy || vault.archived}
                        onPress={() => void undoPayment(payment.id)}
                      />
                    )}
                  </View>
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={s.section}>Saved expenses</Text>
          <Text style={s.small}>
            Private account vault expenses and repayment history stay separate
            from accepted shared debts.
          </Text>
          <Button
            title="Add event expense"
            disabled={busy || vault.archived || !!pending}
            onPress={() => {
              setWizardError("");
              setWizard(true);
            }}
          />
          {!loading && !events.length && !error && (
            <Text style={s.body}>No saved expenses yet.</Text>
          )}
          {events.map((item) => (
            <View key={item.id} style={s.card}>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.body}>
                {item.date} · {money(item.totalMinor)}
              </Text>
              <Text style={s.small}>
                Receivable {money(item.balance.receivableMinor)} · Payable{" "}
                {money(item.balance.payableMinor)}
              </Text>
              <Button
                title={`Open event ${item.title}`}
                secondary
                disabled={busy}
                onPress={() => latest.current.onSelectEvent(item.id)}
              />
            </View>
          ))}
          <Button
            title={vault.archived ? "Reactivate vault" : "Archive vault"}
            secondary
            disabled={busy}
            onPress={() => void setArchived(!vault.archived)}
          />
        </>
      )}
      {vault.archived && (
        <Text style={s.body}>
          This vault is archived. Outstanding balances and history are retained.
          Reactivate it from the event list before recording new expenses or
          payments.
        </Text>
      )}
      {loading && (
        <Text accessibilityRole="status" style={s.body}>
          Loading expenses…
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button
        title={selectedEventId ? "Reload event" : "Refresh expenses"}
        secondary
        disabled={busy || loading}
        onPress={() =>
          void (selectedEventId ? loadDetail(selectedEventId) : loadList())
        }
      />
      <EventWizard
        visible={wizard}
        vaultTitle={vault.title}
        rosterIds={vault.memberIds}
        people={allPeople}
        onClose={() => {
          if (!busy) setWizard(false);
        }}
        onSave={saveEvent}
        onCreatePerson={createPerson}
        busy={busy}
        error={wizardError}
        retrying={pending?.kind === "event"}
      />
      <Sheet
        visible={!!paying}
        title="Record payment"
        onClose={() => {
          if (!busy) setPaying(null);
        }}
      >
        <Text style={s.body}>
          {paying?.isSelf ? "You" : paying?.name} · Remaining{" "}
          {money(paying?.remainingMinor ?? 0)}
        </Text>
        <Text style={s.small}>
          Record a payment already made. This does not transfer money or notify
          anyone.
        </Text>
        <Field
          label="Payment amount · AED"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy && !pending}
        />
        <Button
          title="Use full remaining"
          secondary
          disabled={busy || !!pending}
          onPress={() =>
            setAmount(((paying?.remainingMinor ?? 0) / 100).toFixed(2))
          }
        />
        {!!paymentError && (
          <Text accessibilityRole="alert" style={s.error}>
            {paymentError}
          </Text>
        )}
        <Button
          title={
            busy
              ? "Saving payment…"
              : pending
                ? "Retry payment"
                : "Save payment"
          }
          disabled={busy || (vault.archived && !pending)}
          onPress={() => void savePayment()}
        />
      </Sheet>
    </View>
  );
}
