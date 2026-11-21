import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import BrandMark from "../BrandMark";
import { amountToMinor, money } from "../api";
import {
  addPayment,
  createEvent,
  emptyLedger,
  eventBalances,
  eventPayment,
  eventRemaining,
  eventUndo,
  historyFor,
  id,
  Ledger,
  LocalRecord,
  Payment,
  remaining,
  split,
  text,
  totals,
  undoPayment,
  updateEvent,
  validDate,
} from "./model";
import { createLedgerStore } from "./storage";
import { Button, c, Choice, Field, s, Sheet } from "./ui";
type Form = "record" | "vault" | "event" | "payment" | null;
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export default function OfflineHome({ onExit }: { onExit: () => void }) {
  const store = useMemo(() => createLedgerStore(AsyncStorage), []);
  const active = useRef(true);
  const [ledger, setLedger] = useState<Ledger>(emptyLedger);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"records" | "vaults">("records");
  const [archived, setArchived] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [kind, setKind] = useState<"temporary" | "permanent">("temporary");
  const [names, setNames] = useState("You\n");
  const [selfIndex, setSelfIndex] = useState(0);
  const [payerIndex, setPayerIndex] = useState(0);
  const record = ledger.records.find((r) => r.id === recordId);
  const vault = ledger.vaults.find((v) => v.id === vaultId);
  const event = vault?.events.find((e) => e.id === eventId);
  const person = event?.participants.find((p) => p.id === personId);
  const balance = totals(ledger);
  const lines = names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const saved = await store.load();
      if (active.current) {
        setLedger(saved);
        setReady(true);
      }
    } catch {
      if (active.current)
        setError(
          "Local records could not be opened. They have not been replaced. Retry, or return to mode selection.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, []);
  async function save(change: (current: Ledger) => Ledger, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await store.commit(change);
      if (active.current) {
        setLedger(saved);
        after?.();
      }
    } catch (e) {
      if (active.current)
        setError(
          `Not saved: ${(e as Error).message} Your last saved records are unchanged. Retry after checking device storage.`,
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function openForm(next: Form) {
    setError("");
    setName("");
    setAmount("");
    setDate(today());
    setNote("");
    setDirection("lent");
    setKind("temporary");
    if (next === "event" && vault?.events.length) {
      const previous = vault.events[vault.events.length - 1];
      setNames(previous.participants.map((p) => p.name).join("\n"));
      setSelfIndex(previous.participants.findIndex((p) => p.isSelf));
      setPayerIndex(
        previous.participants.findIndex((p) => p.id === previous.payerId),
      );
    } else {
      setNames("You\n");
      setSelfIndex(0);
      setPayerIndex(0);
    }
    setForm(next);
  }
  function close() {
    setError("");
    if (form) {
      setForm(null);
      return;
    }
    if (eventId) {
      setEventId(null);
      return;
    }
    setRecordId(null);
    setVaultId(null);
  }
  function minor() {
    const value = amountToMinor(amount);
    if (value === null)
      throw new Error("Enter a positive AED amount with up to 2 decimals.");
    return value;
  }
  async function submit() {
    try {
      if (form === "record") {
        const newRecord: LocalRecord = {
          id: id(),
          name: text(name, "Name", 80),
          direction,
          amountMinor: minor(),
          date: validDate(date),
          note: note.trim(),
          payments: [],
        };
        if (newRecord.note.length > 500)
          throw new Error("Keep the note within 500 characters.");
        await save(
          (current) => ({
            ...current,
            records: [newRecord, ...current.records],
          }),
          () => setForm(null),
        );
      } else if (form === "vault") {
        const newVault = {
          id: id(),
          title: text(name, "Vault title"),
          kind,
          archived: false,
          events: [],
        };
        await save(
          (current) => ({ ...current, vaults: [newVault, ...current.vaults] }),
          () => {
            setForm(null);
            setVaultId(newVault.id);
            setTab("vaults");
            setArchived(false);
          },
        );
      } else if (form === "event" && vault) {
        const next = createEvent({
          title: name,
          date,
          totalMinor: minor(),
          names: lines,
          selfIndex,
          payerIndex,
        });
        await save(
          (current) => ({
            ...current,
            vaults: current.vaults.map((v) => {
              if (v.id !== vault.id) return v;
              if (v.archived) throw new Error("Reactivate this vault first.");
              return { ...v, events: [...v.events, next] };
            }),
          }),
          () => {
            setForm(null);
            setEventId(next.id);
          },
        );
      } else if (form === "payment") {
        const value = minor();
        if (record) {
          await save(
            (current) => ({
              ...current,
              records: current.records.map((r) =>
                r.id === record.id
                  ? {
                      ...r,
                      payments: addPayment(r.amountMinor, r.payments, value),
                    }
                  : r,
              ),
            }),
            () => setForm(null),
          );
        } else if (vault && event && person) {
          await save(
            (current) =>
              updateEvent(current, vault.id, event.id, (e) =>
                eventPayment(e, person.id, value),
              ),
            () => setForm(null),
          );
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function undo(paymentId: string, targetPersonId?: string) {
    if (record)
      void save((current) => ({
        ...current,
        records: current.records.map((r) =>
          r.id === record.id
            ? { ...r, payments: undoPayment(r.payments, paymentId) }
            : r,
        ),
      }));
    else if (vault && event && targetPersonId)
      void save((current) =>
        updateEvent(current, vault.id, event.id, (e) =>
          eventUndo(e, targetPersonId, paymentId),
        ),
      );
  }
  function history(payments: Payment[], targetPersonId?: string) {
    return payments.length ? (
      <View>
        {payments.map((p) => (
          <View key={p.id} style={s.history}>
            <View style={s.rowBetween}>
              <Text style={s.label}>
                {p.amountMinor < 0 ? "Correction" : "Payment recorded"} ·{" "}
                {money(Math.abs(p.amountMinor))}
              </Text>
              {p.amountMinor > 0 &&
                !payments.some((c) => c.reversesId === p.id) &&
                !vault?.archived && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => undo(p.id, targetPersonId)}
                  >
                    <Text style={s.link}>Undo payment</Text>
                  </Pressable>
                )}
            </View>
            <Text style={s.small}>
              {new Date(p.createdAt).toLocaleString()}
              {p.reversesId ? " · Original payment reversed" : ""}
            </Text>
          </View>
        ))}
      </View>
    ) : (
      <Text style={s.small}>No payments recorded yet.</Text>
    );
  }
  const paymentDue = record
    ? remaining(record.amountMinor, record.payments)
    : event && person
      ? eventRemaining(event, person.id)
      : 0;
  const sheetTitle = form
    ? {
        record: "Add a personal record",
        vault: "Create a vault",
        event: "Add an event expense",
        payment: "Record a payment",
      }[form]
    : event
      ? "Event details"
      : vault
        ? "Vault details"
        : "Personal record";
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.rowBetween}>
          <View style={s.row}>
            <BrandMark size={40} />
            <Text style={s.brand}>BetweenUs</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onExit}
          >
            <Text style={s.link}>Switch mode</Text>
          </Pressable>
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.eyebrow}>OFFLINE · FREE · DEVICE ONLY</Text>
          <Text style={s.title}>A little less to{"\n"}keep in your head.</Text>
          <Text style={s.body}>
            Your personal records and group expenses, in one quiet place.
          </Text>
        </View>
        <View
          style={[
            s.card,
            {
              backgroundColor: c.ink,
              borderColor: c.ink,
              padding: 24,
              gap: 18,
            },
          ]}
        >
          <Text style={[s.eyebrow, { color: "#c6d9ca" }]}>
            REMAINING ON YOUR RECORDS
          </Text>
          <View style={s.rowBetween}>
            <View style={{ gap: 9 }}>
              <Text style={{ color: "#c2d4c8", fontSize: 12 }}>
                Owed to you
              </Text>
              <Text
                accessibilityLabel="Offline receivable"
                style={{ color: "white", fontSize: 24, fontWeight: "600" }}
              >
                {ready ? money(balance.receivableMinor) : "—"}
              </Text>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={{ color: "#c2d4c8", fontSize: 12 }}>You owe</Text>
              <Text style={{ color: "white", fontSize: 24, fontWeight: "600" }}>
                {ready ? money(balance.payableMinor) : "—"}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: "#b2c9b8", lineHeight: 17 }}>
            Includes personal records and your share of all vaults, including
            archived ones. Locally recorded, not confirmed by others.
          </Text>
        </View>
        <View style={s.row}>
          <Choice
            title="Personal records"
            active={tab === "records"}
            onPress={() => setTab("records")}
          />
          <Choice
            title="Vaults & events"
            active={tab === "vaults"}
            onPress={() => setTab("vaults")}
          />
        </View>
        {!ready && busy && <ActivityIndicator color={c.green} />}
        {!!error && !form && !record && !vault && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!ready && !busy && (
          <Button title="Retry opening records" onPress={() => void load()} />
        )}
        {ready && (
          <>
            <View style={s.rowBetween}>
              <Text style={s.section}>
                {tab === "records" ? "Personal records" : "Your vaults"}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => openForm(tab === "records" ? "record" : "vault")}
              >
                <Text style={s.link}>
                  {tab === "records" ? "+ Add record" : "+ Create vault"}
                </Text>
              </Pressable>
            </View>
            {tab === "records" ? (
              <>
                {!ledger.records.length && (
                  <View style={s.empty}>
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={32}
                      color={c.green}
                    />
                    <Text style={s.cardTitle}>Remember the little loans</Text>
                    <Text style={[s.body, { textAlign: "center" }]}>
                      Record money you lent or borrowed using just a name.
                    </Text>
                  </View>
                )}
                {ledger.records.map((r) => (
                  <Pressable
                    accessibilityRole="button"
                    key={r.id}
                    onPress={() => {
                      setError("");
                      setRecordId(r.id);
                    }}
                    style={s.card}
                  >
                    <View style={s.rowBetween}>
                      <Text style={s.cardTitle}>{r.name}</Text>
                      <Text style={s.cardTitle}>
                        {money(remaining(r.amountMinor, r.payments))}
                      </Text>
                    </View>
                    <Text style={s.small}>
                      {r.direction === "lent" ? "Owes you" : "You owe"} ·{" "}
                      {r.date}
                      {remaining(r.amountMinor, r.payments) === 0
                        ? " · Settled"
                        : ""}
                    </Text>
                    {!!r.note && (
                      <Text style={s.body} numberOfLines={2}>
                        {r.note}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <View style={s.row}>
                  <Choice
                    title="Active vaults"
                    active={!archived}
                    onPress={() => setArchived(false)}
                  />
                  <Choice
                    title="Archived vaults"
                    active={archived}
                    onPress={() => setArchived(true)}
                  />
                </View>
                {!ledger.vaults.some((v) => v.archived === archived) && (
                  <View style={s.empty}>
                    <Ionicons name="albums-outline" size={32} color={c.green} />
                    <Text style={s.cardTitle}>
                      {archived
                        ? "Nothing archived"
                        : "Make room for shared moments"}
                    </Text>
                    <Text style={[s.body, { textAlign: "center" }]}>
                      A trip for the weekend, or football every Friday. Keep
                      each event together.
                    </Text>
                  </View>
                )}
                {ledger.vaults
                  .filter((v) => v.archived === archived)
                  .map((v) => (
                    <Pressable
                      accessibilityRole="button"
                      key={v.id}
                      onPress={() => {
                        setError("");
                        setVaultId(v.id);
                      }}
                      style={s.card}
                    >
                      <View style={s.rowBetween}>
                        <Text style={[s.cardTitle, { flex: 1 }]}>
                          {v.title}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={c.muted}
                        />
                      </View>
                      <Text style={s.tag}>
                        {v.kind === "permanent"
                          ? "PERMANENT · REUSABLE"
                          : "TEMPORARY"}
                        {v.archived ? " · ARCHIVED" : ""}
                      </Text>
                      <Text style={s.small}>
                        {v.events.length} event
                        {v.events.length === 1 ? "" : "s"} · Owed to you{" "}
                        {money(
                          v.events.reduce(
                            (sum, e) => sum + eventBalances(e).receivableMinor,
                            0,
                          ),
                        )}
                      </Text>
                    </Pressable>
                  ))}
              </>
            )}
            <View style={[s.card, { backgroundColor: c.pale }]}>
              <Text style={s.label}>Only on this device</Text>
              <Text style={s.small}>
                No account, syncing, or notifications. BetweenUs does not upload
                these records. These are your own notes. Clearing app data,
                uninstalling, or losing this device can lose them. Browser
                records stay in this browser; there is no backup or export yet.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      <Sheet
        visible={!!form || !!record || !!vault}
        title={sheetTitle}
        onClose={close}
      >
        {form === "record" && (
          <>
            <Text style={s.body}>
              A private note of money lent or borrowed. No one is contacted.
            </Text>
            <View style={s.row}>
              <Choice
                title="I lent money"
                active={direction === "lent"}
                onPress={() => setDirection("lent")}
              />
              <Choice
                title="I borrowed money"
                active={direction === "borrowed"}
                onPress={() => setDirection("borrowed")}
              />
            </View>
            <Field
              label="Person's name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Field
              label="Amount · AED"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Field
              label="Date · YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              maxLength={10}
            />
            <Field
              label="Note · optional"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
            />
          </>
        )}
        {form === "vault" && (
          <>
            <Field
              label="Vault name"
              value={name}
              onChangeText={setName}
              placeholder="Friday football, Summer trip…"
              maxLength={200}
            />
            <View style={s.row}>
              <Choice
                title="Temporary"
                active={kind === "temporary"}
                onPress={() => setKind("temporary")}
              />
              <Choice
                title="Permanent"
                active={kind === "permanent"}
                onPress={() => setKind("permanent")}
              />
            </View>
            <Text style={s.body}>
              {kind === "permanent"
                ? "Keep a reusable home for recurring events. Each event has its own date, payer, split and repayments."
                : "For a trip, match, or short-lived plan. Add one or more events, then archive when you are done. Nothing is automatically deleted."}
            </Text>
          </>
        )}
        {form === "event" && (
          <>
            <Text style={s.body}>
              Each participant gets an equal share. Any spare cents go in the
              saved participant order. The payer covers their own share.
            </Text>
            <Field
              label="Event title"
              value={name}
              onChangeText={setName}
              placeholder="Football pitch"
              maxLength={200}
            />
            <Field
              label="Event date · YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              maxLength={10}
            />
            <Field
              label="Event total · AED"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Field
              label="Participants · one name per line"
              value={names}
              onChangeText={(next) => {
                const selfName = lines[selfIndex];
                const payerName = lines[payerIndex];
                const nextLines = next
                  .split("\n")
                  .map((n) => n.trim())
                  .filter(Boolean);
                setNames(next);
                setSelfIndex(selfName ? nextLines.indexOf(selfName) : -1);
                setPayerIndex(payerName ? nextLines.indexOf(payerName) : -1);
              }}
              multiline
              placeholder={"You\nAlex\nSam"}
              maxLength={8100}
            />
            <Text style={s.label}>Which participant is you?</Text>
            <View style={s.row}>
              {lines.map((n, i) => (
                <Choice
                  key={i}
                  title={`${n} (me)`}
                  active={selfIndex === i}
                  onPress={() => setSelfIndex(i)}
                />
              ))}
            </View>
            <Text style={s.label}>Who paid the total?</Text>
            <View style={s.row}>
              {lines.map((n, i) => (
                <Choice
                  key={i}
                  title={`${n} paid`}
                  active={payerIndex === i}
                  onPress={() => setPayerIndex(i)}
                />
              ))}
            </View>
            <Text style={s.small}>
              {lines.length} participant{lines.length === 1 ? "" : "s"},
              including you. Names must be unique. You must be included exactly
              once.
            </Text>
          </>
        )}
        {form === "payment" && (
          <>
            <Text style={s.cardTitle}>
              {record
                ? record.direction === "lent"
                  ? `Payment from ${record.name}`
                  : `Your payment to ${record.name}`
                : `${person?.name}${person?.isSelf ? " (you)" : ""} paid ${event?.participants.find((p) => p.id === event.payerId)?.name}`}
            </Text>
            <Text style={s.body}>
              Remaining {money(paymentDue)}. This records money paid outside the
              app; it does not move money or notify anyone.
            </Text>
            <Field
              label="Payment amount · AED"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Button
              title={`Use full remaining · ${money(paymentDue)}`}
              secondary
              disabled={busy}
              onPress={() => setAmount((paymentDue / 100).toFixed(2))}
            />
          </>
        )}
        {!!form && (
          <Button
            title={
              busy
                ? "Saving…"
                : form === "payment"
                  ? "Save payment"
                  : form === "event"
                    ? "Save event expense"
                    : form === "vault"
                      ? "Save vault"
                      : "Save personal record"
            }
            disabled={busy}
            onPress={() => void submit()}
          />
        )}
        {!form && record && (
          <>
            <Text style={s.eyebrow}>
              {record.direction === "lent" ? "OWED TO YOU" : "YOU OWE"} ·
              REMAINING
            </Text>
            <Text style={s.amount}>
              {money(remaining(record.amountMinor, record.payments))}
            </Text>
            <Text style={s.section}>{record.name}</Text>
            <Text style={s.body}>
              Original {money(record.amountMinor)} · {record.date}
            </Text>
            {!!record.note && <Text style={s.body}>{record.note}</Text>}
            {remaining(record.amountMinor, record.payments) > 0 && (
              <Button
                title="Record repayment"
                disabled={busy}
                onPress={() => openForm("payment")}
              />
            )}
            <Text style={s.section}>Repayment history</Text>
            {history(record.payments)}
          </>
        )}
        {!form && vault && !event && (
          <>
            <Text style={s.section}>{vault.title}</Text>
            <Text style={s.tag}>
              {vault.kind === "permanent"
                ? "PERMANENT · REUSABLE"
                : "TEMPORARY"}
              {vault.archived ? " · ARCHIVED" : ""}
            </Text>
            <Text style={s.body}>
              {vault.archived
                ? "Archived for safekeeping. All events, history and unpaid balances are retained. Reactivate to make changes."
                : "Each expense has its own date, participants and payer. Your last event roster is carried into the next form for convenience."}
            </Text>
            {!vault.archived && (
              <Button
                title="Add event expense"
                disabled={busy}
                onPress={() => openForm("event")}
              />
            )}
            <Text style={s.section}>
              Event expenses · {vault.events.length}
            </Text>
            {vault.events.map((e) => (
              <Pressable
                accessibilityRole="button"
                key={e.id}
                style={s.card}
                onPress={() => setEventId(e.id)}
              >
                <Text style={s.cardTitle}>{e.title}</Text>
                <Text style={s.small}>
                  {e.date} · {money(e.totalMinor)} · {e.participants.length}{" "}
                  people
                </Text>
                <Text style={s.label}>
                  Owed to you {money(eventBalances(e).receivableMinor)} · You
                  owe {money(eventBalances(e).payableMinor)}
                </Text>
              </Pressable>
            ))}
            {!vault.events.length && (
              <Text style={s.body}>
                No expenses yet. Start with the first shared moment.
              </Text>
            )}
            <Button
              title={vault.archived ? "Reactivate vault" : "Archive vault"}
              secondary
              disabled={busy}
              onPress={() =>
                void save((current) => ({
                  ...current,
                  vaults: current.vaults.map((v) =>
                    v.id === vault.id ? { ...v, archived: !v.archived } : v,
                  ),
                }))
              }
            />
            <Text style={s.small}>
              Archiving hides this vault from the active list. It never deletes
              records or removes unpaid balances from your overview.
            </Text>
          </>
        )}
        {!form && vault && event && (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEventId(null)}
            >
              <Text style={s.link}>‹ Back to vault</Text>
            </Pressable>
            <Text style={s.section}>{event.title}</Text>
            <Text style={s.body}>
              {event.date} · Paid by{" "}
              {event.participants.find((p) => p.id === event.payerId)?.name}
            </Text>
            <Text style={s.amount}>{money(event.totalMinor)}</Text>
            <View style={[s.card, { backgroundColor: c.pale }]}>
              <Text style={s.label}>
                Owed to you · {money(eventBalances(event).receivableMinor)}
              </Text>
              <Text style={s.label}>
                You owe · {money(eventBalances(event).payableMinor)}
              </Text>
              <Text style={s.small}>
                {event.participants.length} equal shares. Your own share{" "}
                {money(
                  split(event.totalMinor, event.participants)[
                    event.participants.find((p) => p.isSelf)!.id
                  ],
                )}{" "}
                is included in the total, never added to what others owe you.
              </Text>
            </View>
            <Text style={s.section}>Participants & payments</Text>
            {event.participants.map((p) => (
              <View key={p.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>
                    {p.name}
                    {p.isSelf ? " (you)" : ""}
                  </Text>
                  <Text style={s.label}>
                    {p.id === event.payerId
                      ? "Payer"
                      : money(eventRemaining(event, p.id))}
                  </Text>
                </View>
                <Text style={s.small}>
                  Share{" "}
                  {money(split(event.totalMinor, event.participants)[p.id])}
                  {p.id !== event.payerId
                    ? ` · ${eventRemaining(event, p.id) === 0 ? "Paid in full" : "remaining to payer"}`
                    : " · Paid the original expense"}
                </Text>
                {p.id !== event.payerId &&
                  eventRemaining(event, p.id) > 0 &&
                  !vault.archived && (
                    <Button
                      title={`Record payment · ${p.name}`}
                      secondary
                      disabled={busy}
                      onPress={() => {
                        setPersonId(p.id);
                        openForm("payment");
                      }}
                    />
                  )}
                {p.id !== event.payerId &&
                  history(historyFor(event, p.id), p.id)}
              </View>
            ))}
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {busy && <ActivityIndicator color={c.green} />}
      </Sheet>
    </SafeAreaView>
  );
}
