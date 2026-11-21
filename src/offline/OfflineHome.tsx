import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import MobileShell, { Tab } from "../navigation/MobileShell";
import { localPeople, backPath, DetailPath } from "../navigation/people";
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
  undoPayment,
  updateEvent,
  validDate,
} from "./model";
import { createLedgerStore } from "./storage";
import { Button, c, Choice, Field, s, Sheet } from "./ui";
import OfflineOverview from "./OfflineOverview";
type Form = "record" | "vault" | "event" | "payment" | null;
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export default function OfflineHome({ onExit }: { onExit: () => void }) {
  const listRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const store = useMemo(() => createLedgerStore(AsyncStorage), []);
  const active = useRef(true);
  const [ledger, setLedger] = useState<Ledger>(emptyLedger);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [paths, setPaths] = useState<Record<Tab, DetailPath>>({
    home: {},
    people: {},
    vaults: {},
    settings: {},
  });
  const path = paths[tab];
  const recordId = path.recordId;
  const vaultId = path.vaultId;
  const eventId = path.eventId;
  function updatePath(change: (path: DetailPath) => DetailPath) {
    setPaths((current) => ({ ...current, [tab]: change(current[tab]) }));
  }
  function setRecordId(value: string | null) {
    updatePath((p) => ({ ...p, recordId: value || undefined }));
  }
  function setVaultId(value: string | null) {
    updatePath(() => (value ? { vaultId: value } : {}));
  }
  function setEventId(value: string | null) {
    updatePath((p) => ({ ...p, eventId: value || undefined }));
  }
  const [archived, setArchived] = useState(false);
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
  const people = localPeople(ledger.records);
  const selectedPerson = people.find((p) => p.key === path.personKey);
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
      if (active.current && !form)
        listRef.current?.scrollTo({ y: 0, animated: true });
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
    if (busy) return;
    setError("");
    if (form) {
      setForm(null);
      return;
    }
    const parent = backPath(path);
    if (parent) updatePath(() => parent);
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (busy) return true;
        if (form) return false;
        const parent = backPath(path);
        if (parent) {
          setError("");
          updatePath(() => parent);
          return true;
        }
        if (tab !== "home") {
          setTab("home");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [tab, path, form, busy]);
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
            setPaths((current) => ({
              ...current,
              vaults: { vaultId: newVault.id },
            }));
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
  function recordRow(r: LocalRecord) {
    return (
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
          <Text numberOfLines={1} style={[s.cardTitle, { flex: 1 }]}>
            {r.name}
          </Text>
          <Text style={s.label}>
            {money(remaining(r.amountMinor, r.payments))}
          </Text>
        </View>
        <Text style={s.small}>
          {r.direction === "lent" ? "Owes you" : "You owe"} · {r.date}
          {remaining(r.amountMinor, r.payments) === 0 ? " · Settled" : ""}
        </Text>
        {!!r.note && (
          <Text numberOfLines={1} style={s.body}>
            {r.note}
          </Text>
        )}
      </Pressable>
    );
  }
  function vaultRow(v: Ledger["vaults"][number]) {
    return (
      <Pressable
        accessibilityRole="button"
        key={v.id}
        style={s.card}
        onPress={() => {
          setError("");
          setVaultId(v.id);
        }}
      >
        <View style={s.rowBetween}>
          <Text style={[s.cardTitle, { flex: 1 }]}>{v.title}</Text>
          <Ionicons name="chevron-forward" color={c.muted} size={18} />
        </View>
        <Text style={s.tag}>
          {v.kind === "permanent" ? "PERMANENT · REUSABLE" : "TEMPORARY"}
          {v.archived ? " · ARCHIVED" : ""}
        </Text>
        <Text style={s.small}>
          {v.events.length} events · Owed to you{" "}
          {money(
            v.events.reduce(
              (sum, e) => sum + eventBalances(e).receivableMinor,
              0,
            ),
          )}
        </Text>
      </Pressable>
    );
  }
  const hasDetails = !!record || !!vault;
  return (
    <MobileShell
      tab={tab}
      onTabChange={(next) => {
        if (busy) return;
        setError("");
        setTab(next);
      }}
      mode="OFFLINE · FREE"
    >
      <ScrollView
        ref={listRef}
        key={`${tab}:${recordId || vaultId || path.personKey || ""}:${eventId || ""}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        {!!error && !form && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!ready && busy && <ActivityIndicator color={c.green} />}
        {!ready && !busy && (
          <Button title="Retry opening records" onPress={() => void load()} />
        )}
        {hasDetails && !event && (
          <Pressable accessibilityRole="button" onPress={close}>
            <Text style={s.link}>
              ‹{" "}
              {record
                ? selectedPerson
                  ? "Back to person"
                  : tab === "home"
                    ? "Back to Home"
                    : "Back to People"
                : tab === "home"
                  ? "Back to Home"
                  : "Back to Vaults"}
            </Text>
          </Pressable>
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
                    {p.isSelf && p.name.toLowerCase() !== "you" ? " (you)" : ""}
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

        {!hasDetails && tab === "home" && (
          <OfflineOverview
            ledger={ledger}
            ready={ready}
            busy={busy}
            onAddDebt={() => openForm("record")}
            onCreateVault={() => openForm("vault")}
            onPeople={() => setTab("people")}
            onVaults={() => setTab("vaults")}
            recordRow={recordRow}
            vaultRow={vaultRow}
          />
        )}
        {!hasDetails && tab === "people" && (
          <>
            {selectedPerson ? (
              <>
                <Pressable accessibilityRole="button" onPress={close}>
                  <Text style={s.link}>‹ Back to People</Text>
                </Pressable>
                <Text style={s.title}>{selectedPerson.name}</Text>
                <View style={[s.card, { backgroundColor: c.pale }]}>
                  <Text style={s.label}>
                    Owed to you · {money(selectedPerson.receivableMinor)}
                  </Text>
                  <Text style={s.label}>
                    You owe · {money(selectedPerson.payableMinor)}
                  </Text>
                </View>
                <Text style={s.small}>
                  Local name grouping only, not a verified identity.
                </Text>
                <Text style={s.section}>
                  Personal records · {selectedPerson.records.length}
                </Text>
                {selectedPerson.records.map(recordRow)}
              </>
            ) : (
              <>
                <View style={s.rowBetween}>
                  <View>
                    <Text style={s.title}>People</Text>
                    <Text style={s.small}>
                      Your personal records, together.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!ready || busy}
                    onPress={() => openForm("record")}
                  >
                    <Text style={s.link}>+ Add debt</Text>
                  </Pressable>
                </View>
                {people.map((p) => (
                  <Pressable
                    accessibilityRole="button"
                    key={p.key}
                    style={s.card}
                    onPress={() => updatePath(() => ({ personKey: p.key }))}
                  >
                    <View style={s.rowBetween}>
                      <View style={[s.row, { flex: 1, flexWrap: "nowrap" }]}>
                        <View
                          style={{
                            width: 39,
                            height: 39,
                            borderRadius: 14,
                            backgroundColor: c.pale,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: c.green,
                              fontSize: 17,
                              fontWeight: "600",
                            }}
                          >
                            {p.name.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[s.cardTitle, { flex: 1 }]}>{p.name}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={c.muted}
                      />
                    </View>
                    <Text style={s.small}>
                      {p.records.length} records · Owed to you{" "}
                      {money(p.receivableMinor)} · You owe{" "}
                      {money(p.payableMinor)}
                    </Text>
                  </Pressable>
                ))}
                {!people.length && (
                  <View style={s.empty}>
                    <Ionicons name="people-outline" size={32} color={c.green} />
                    <Text style={s.cardTitle}>Start with someone you know</Text>
                    <Text style={[s.body, { textAlign: "center" }]}>
                      Add a personal debt to see their records here. No contacts
                      access or invitations.
                    </Text>
                  </View>
                )}
                <Text style={s.small}>
                  Names are grouped locally by spelling, ignoring case and extra
                  spaces. Original records stay separate.
                </Text>
              </>
            )}
          </>
        )}
        {!hasDetails && tab === "vaults" && (
          <>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.title}>Vaults</Text>
                <Text style={s.small}>A home for every shared moment.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!ready || busy}
                onPress={() => openForm("vault")}
              >
                <Text style={s.link}>+ Create vault</Text>
              </Pressable>
            </View>
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
            {ledger.vaults.filter((v) => v.archived === archived).map(vaultRow)}
            {!ledger.vaults.some((v) => v.archived === archived) && (
              <View style={s.empty}>
                <Ionicons name="albums-outline" size={32} color={c.green} />
                <Text style={s.cardTitle}>
                  {archived
                    ? "Nothing archived"
                    : "Make room for shared moments"}
                </Text>
                <Text style={[s.body, { textAlign: "center" }]}>
                  One weekend away, or football every Friday. Keep events and
                  repayments together.
                </Text>
              </View>
            )}
          </>
        )}
        {tab === "settings" && (
          <>
            <Text style={s.title}>Settings</Text>
            <View style={s.card}>
              <Text style={s.tag}>OFFLINE · FREE · DEVICE ONLY</Text>
              <Text style={s.cardTitle}>A private record on this device</Text>
              <Text style={s.body}>
                No account, syncing, or notifications. BetweenUs does not upload
                these records or contact anyone.
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Storage & privacy</Text>
              <Text style={s.body}>
                Records are stored locally, without app-level encryption.
                Clearing app data, uninstalling, or losing this device can lose
                them. Browser records stay in this browser. Backup and export
                are not available yet.
              </Text>
            </View>
            <Button
              title="Switch mode"
              secondary
              disabled={busy}
              onPress={onExit}
            />
            <Text style={s.small}>
              Account mode stays separate. Switching does not upload or delete
              your offline records.
            </Text>
            <Text style={[s.small, { textAlign: "center" }]}>
              BetweenUs · A record, not a payment service.
            </Text>
          </>
        )}

        {busy && ready && <ActivityIndicator color={c.green} />}
      </ScrollView>
      <Sheet visible={!!form} title={sheetTitle} onClose={close}>
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

        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {busy && <ActivityIndicator color={c.green} />}
      </Sheet>
    </MobileShell>
  );
}
