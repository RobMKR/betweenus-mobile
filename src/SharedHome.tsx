import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { amountToMinor, Balance, Debt, DEMO, money, request } from "./api";
import AuthGate from "./AuthGate";
import MobileShell, { Tab } from "./navigation/MobileShell";
import {
  accountPeople,
  confirmedPersonBalances,
} from "./navigation/accountPeople";
const colors = {
  ink: "#203b35",
  muted: "#71817a",
  green: "#176b50",
  pale: "#eaf2eb",
  paper: "#f7f8f3",
  line: "#e3e8df",
};
const labels = {
  pending: "Awaiting confirmation",
  accepted: "Confirmed",
  disputed: "Needs resolution",
};
type Filter = "all" | "pending" | "accepted" | "disputed";
export default function Home({ onExit }: { onExit?: () => void }) {
  const [accountVisible, setAccountVisible] = useState(false);
  if (DEMO) return <DebtHome onExit={onExit} />;
  return (
    <View style={{ flex: 1 }}>
      {onExit && !accountVisible && (
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          style={{
            minHeight: 44,
            justifyContent: "center",
            padding: 14,
            backgroundColor: "#f7f8f3",
          }}
        >
          <Text style={{ color: "#176b50" }}>‹ Mode selection</Text>
        </Pressable>
      )}
      <AuthGate>
        {(token, signOut, identity) => (
          <DebtHome
            key={identity}
            accessToken={token}
            onVisible={setAccountVisible}
            signOut={signOut}
            onExit={onExit}
          />
        )}
      </AuthGate>
    </View>
  );
}
function DebtHome({
  accessToken = "",
  onVisible,
  signOut,
  onExit,
}: {
  accessToken?: string;
  onVisible?: (visible: boolean) => void;
  signOut?: () => Promise<void>;
  onExit?: () => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    onVisible?.(true);
    return () => {
      active.current = false;
      onVisible?.(false);
    };
  }, [onVisible]);
  const [persona, setPersona] = useState<"lender" | "borrower">("lender");
  const token = DEMO ? `demo-${persona}` : accessToken;
  const requestIdentity = useRef(token);
  requestIdentity.current = token;
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("home");
  const [details, setDetails] = useState<{
    home: string | null;
    people: string | null;
  }>({ home: null, people: null });
  const detailId = tab === "home" || tab === "people" ? details[tab] : null;
  const detail = debts.find((debt) => debt.id === detailId) ?? null;
  function setDetail(debt: Debt | null) {
    const page = tab === "people" ? "people" : "home";
    setDetails((previous) => ({ ...previous, [page]: debt?.id ?? null }));
  }
  const [person, setPerson] = useState<string | null>(null);
  const [allRequests, setAllRequests] = useState(false);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  async function refresh() {
    if (!token) return;
    const operationToken = token;
    setBusy(true);
    setError("");
    try {
      const [user, list, total] = await Promise.all([
        request<{ id: string; email: string }>("/me", token),
        request<{ debts: Debt[] }>("/debts", token),
        request<{ balances: Balance[] }>("/balances", token),
      ]);
      if (!active.current || requestIdentity.current !== operationToken) return;
      setMe(user);
      setDebts(list.debts);
      setBalances(total.balances);
      setLoaded(true);
    } catch (e) {
      if (active.current && requestIdentity.current === operationToken)
        setError((e as Error).message);
    } finally {
      if (active.current && requestIdentity.current === operationToken)
        setBusy(false);
    }
  }
  useEffect(() => {
    setMe(null);
    setDebts([]);
    setBalances([]);
    setLoaded(false);
    if (DEMO) {
      setDetails({ home: null, people: null });
      setPerson(null);
      setAllRequests(false);
      setTab("home");
    }
    setCreating(false);
    setEmail("");
    setAmount("");
    setNote("");
    setReason("");
    setError("");
    void refresh();
  }, [token]);
  async function create() {
    const minor = amountToMinor(amount);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !minor ||
      !note.trim()
    ) {
      setError(
        "Enter a valid email, a positive amount up to AED 10,000,000 with up to 2 decimals, and a note.",
      );
      return;
    }
    if (email.trim().toLowerCase() === me?.email.toLowerCase()) {
      setError("Choose someone other than yourself.");
      return;
    }
    const operationToken = token;
    setBusy(true);
    setError("");
    try {
      await request("/debts", token, {
        borrowerEmail: email.trim().toLowerCase(),
        amountMinor: minor,
        currency: "AED",
        description: note.trim(),
      });
      if (!active.current || requestIdentity.current !== operationToken) return;
      setCreating(false);
      setEmail("");
      setAmount("");
      setNote("");
      await refresh();
    } catch (e) {
      if (active.current && requestIdentity.current === operationToken)
        setError((e as Error).message);
    } finally {
      if (active.current && requestIdentity.current === operationToken)
        setBusy(false);
    }
  }
  async function respond(action: "accept" | "dispute") {
    if (!detail) return;
    if (action === "dispute" && !reason.trim()) {
      setError("Add a reason so you can resolve this together.");
      return;
    }
    const operationToken = token;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ debt: Debt }>(
        `/debts/${detail.id}/${action}`,
        token,
        action === "dispute" ? { reason: reason.trim() } : {},
      );
      if (!active.current || requestIdentity.current !== operationToken) return;
      setDebts((current) =>
        current.map((debt) =>
          debt.id === result.debt.id ? result.debt : debt,
        ),
      );
      setReason("");
      await refresh();
    } catch (e) {
      if (active.current && requestIdentity.current === operationToken)
        setError((e as Error).message);
    } finally {
      if (active.current && requestIdentity.current === operationToken)
        setBusy(false);
    }
  }
  const total = balances.find((b) => b.currency === "AED");
  const pending = debts.filter((d) => d.status === "pending").length;
  const groups = accountPeople(debts, me?.id);
  const selected = person ? groups.get(person) : null;
  const filtered = (items: Debt[]) =>
    items.filter((d) => filter === "all" || d.status === filter);
  const sorted = [...debts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  function navigate(next: Tab) {
    setTab(next);
    setReason("");
    setError("");
  }
  function openDebt(debt: Debt) {
    setDetail(debt);
    setReason("");
    setError("");
  }
  function back() {
    if (detail) {
      setDetail(null);
      setReason("");
      setError("");
      return true;
    }
    if (tab === "people" && (person || allRequests)) {
      setPerson(null);
      setAllRequests(false);
      return true;
    }
    if (tab !== "home") {
      navigate("home");
      return true;
    }
    return false;
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      back,
    );
    return () => subscription.remove();
  }, [tab, detail, person, allRequests]);
  function button(
    title: string,
    action: () => void,
    secondary = false,
    disabled = busy,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={action}
        style={[s.button, secondary && s.secondary, disabled && s.disabled]}
      >
        <Text style={[s.buttonText, secondary && { color: colors.green }]}>
          {title}
        </Text>
      </Pressable>
    );
  }
  function startCreate() {
    setError("");
    setCreating(true);
  }
  function filters() {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
      >
        {(["all", "pending", "accepted", "disputed"] as Filter[]).map(
          (value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              onPress={() => setFilter(value)}
              style={[s.filter, filter === value && s.activeFilter]}
            >
              <Text
                style={{
                  color: filter === value ? "white" : colors.ink,
                  fontWeight: "600",
                }}
              >
                {
                  {
                    all: "All debts",
                    pending: "Pending",
                    accepted: "Confirmed",
                    disputed: "Needs resolution",
                  }[value]
                }
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>
    );
  }
  function rows(items: Debt[]) {
    return items.length ? (
      items.map((debt) => (
        <Pressable
          key={debt.id}
          accessibilityRole="button"
          accessibilityLabel={`Open debt: ${debt.description}`}
          onPress={() => openDebt(debt)}
          style={s.debt}
        >
          <View style={s.rowBetween}>
            <Text style={[s.cardTitle, { flex: 1 }]}>
              {debt.lenderId === me?.id ? debt.borrowerEmail : debt.lenderEmail}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
          <Text style={s.body}>{debt.description}</Text>
          <View style={s.rowBetween}>
            <Text style={s.amount}>
              {money(debt.amountMinor, debt.currency)}
            </Text>
            <Text style={s.small}>
              {debt.lenderId === me?.id ? "owes you" : "you owe"}
            </Text>
          </View>
          <Text style={s.status}>{labels[debt.status]}</Text>
        </Pressable>
      ))
    ) : loaded ? (
      <View style={s.card}>
        <Text style={s.cardTitle}>A clear page</Text>
        <Text style={s.body}>No matching requests yet.</Text>
      </View>
    ) : null;
  }
  function detailPage(debt: Debt) {
    return (
      <>
        {button("‹ Back", () => back(), true, false)}
        <Text style={s.title}>Debt details</Text>
        <View style={s.balanceCard}>
          <Text style={s.balanceSmall}>{labels[debt.status]}</Text>
          <Text style={s.balanceAmount}>
            {money(debt.amountMinor, debt.currency)}
          </Text>
          <Text style={s.balanceSmall}>{debt.description}</Text>
        </View>
        <View style={s.card}>
          <Text style={s.label}>Lent by</Text>
          <Text style={s.body}>{debt.lenderEmail}</Text>
          <Text style={s.label}>Borrowed by</Text>
          <Text style={s.body}>{debt.borrowerEmail}</Text>
        </View>
        {debt.status === "pending" &&
          debt.borrowerEmail.toLowerCase() === me?.email.toLowerCase() && (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Does this look right?</Text>
              <Text style={s.body}>
                Confirm to include this request in both balances. If something
                is off, add a reason.
              </Text>
              {button("Confirm debt", () => void respond("accept"))}
              <TextInput
                accessibilityLabel="Dispute reason"
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={1000}
                placeholder="What needs correcting?"
                style={s.input}
              />
              {button(
                "Flag for resolution",
                () => void respond("dispute"),
                true,
              )}
            </View>
          )}
        <Text style={s.sectionTitle}>Shared history</Text>
        {debt.history.map((event, index) => (
          <View key={event.id ?? index} style={s.card}>
            <Text style={s.cardTitle}>
              {{
                created: "Debt recorded",
                accepted: "Confirmed by borrower",
                disputed: "Flagged for resolution",
              }[event.action || event.type || "created"] ?? "History recorded"}
            </Text>
            <Text style={s.small}>
              {new Date(event.createdAt).toLocaleString()}
            </Text>
            {!!event.reason && <Text style={s.body}>{event.reason}</Text>}
          </View>
        ))}
        {debt.status === "disputed" && (
          <Text style={s.body}>
            Talk together to resolve the difference. Editing, settling and
            closing disputes are not available in this pilot.
          </Text>
        )}
      </>
    );
  }
  return (
    <>
      <MobileShell
        tab={tab}
        onTabChange={navigate}
        mode={DEMO ? "LOCAL DEMO" : "ACCOUNT"}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.page}
            refreshControl={
              tab === "home" || tab === "people" ? (
                <RefreshControl refreshing={busy} onRefresh={refresh} />
              ) : undefined
            }
          >
            {!!error && !creating && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {busy && !loaded && (
              <ActivityIndicator
                accessibilityLabel="Loading requests"
                color={colors.green}
              />
            )}
            {detail ? (
              detailPage(detail)
            ) : tab === "home" ? (
              <>
                <Text style={s.eyebrow}>A LITTLE CLARITY, BETWEEN FRIENDS</Text>
                <Text style={s.title}>Your shared overview</Text>
                <Text style={s.body}>Clear records. Confirmed together.</Text>
                <View style={s.balanceCard}>
                  <Text style={s.balanceSmall}>CONFIRMED AED BALANCE</Text>
                  <Text style={s.balanceAmount}>
                    {loaded ? money(total?.netMinor ?? 0) : "—"}
                  </Text>
                  <Text style={s.balanceSmall}>
                    {(total?.netMinor ?? 0) < 0
                      ? "Net amount to pay back"
                      : "Net amount to receive"}
                  </Text>
                  <View style={s.divider} />
                  <Text style={s.balanceSmall}>Owed to you</Text>
                  <Text style={s.balanceValue}>
                    {loaded ? money(total?.receivableMinor ?? 0) : "—"}
                  </Text>
                  <Text style={s.balanceSmall}>You owe</Text>
                  <Text style={s.balanceValue}>
                    {loaded ? money(total?.payableMinor ?? 0) : "—"}
                  </Text>
                  <Text style={s.balanceSmall}>
                    Confirmed debts only · no currency conversion
                  </Text>
                </View>
                {balances
                  .filter((b) => b.currency !== "AED")
                  .map((balance) => (
                    <View key={balance.currency} style={s.card}>
                      <Text style={s.cardTitle}>
                        {balance.currency} · confirmed only
                      </Text>
                      <Text style={s.body}>
                        Owed to you{" "}
                        {money(balance.receivableMinor, balance.currency)}
                      </Text>
                      <Text style={s.body}>
                        You owe {money(balance.payableMinor, balance.currency)}
                      </Text>
                    </View>
                  ))}
                <View style={s.shortcuts}>
                  {button("Add debt", startCreate, false, busy || !me)}
                  {button(
                    "Create vault",
                    () => navigate("vaults"),
                    true,
                    false,
                  )}
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.sectionTitle}>Recent requests</Text>
                  <Text style={s.small}>{pending} pending</Text>
                </View>
                {rows(sorted.slice(0, 5))}
                {button(
                  "All requests",
                  () => {
                    setAllRequests(true);
                    setPerson(null);
                    setFilter("all");
                    setDetails((current) => ({ ...current, people: null }));
                    navigate("people");
                  },
                  true,
                  false,
                )}
                <Text style={s.small}>
                  A shared record, not a payment service. Pending and disputed
                  requests stay outside confirmed balances.
                </Text>
              </>
            ) : tab === "people" ? (
              <>
                {(selected || allRequests) &&
                  button(
                    "‹ All people",
                    () => {
                      setPerson(null);
                      setAllRequests(false);
                      setDetail(null);
                    },
                    true,
                    false,
                  )}
                <Text style={s.title}>
                  {selected
                    ? "Your shared records"
                    : allRequests
                      ? "All requests"
                      : "People"}
                </Text>
                {selected && <Text style={s.body}>{selected.email}</Text>}
                <Text style={s.body}>
                  Existing requests grouped by counterparty account or
                  invitation email.
                </Text>
                {button("Add debt", startCreate, false, busy || !me)}
                {filters()}
                {selected ? (
                  <>
                    {confirmedPersonBalances(selected.debts, me?.id).map(
                      (balance) => (
                        <View key={balance.currency} style={s.card}>
                          <Text style={s.label}>
                            Confirmed only · {balance.currency}
                          </Text>
                          <Text style={s.body}>
                            Owed to you{" "}
                            {money(balance.receivableMinor, balance.currency)}
                          </Text>
                          <Text style={s.body}>
                            You owe{" "}
                            {money(balance.payableMinor, balance.currency)}
                          </Text>
                        </View>
                      ),
                    )}
                    {rows(filtered(selected.debts))}
                  </>
                ) : allRequests ? (
                  rows(filtered(sorted))
                ) : (
                  <>
                    {[...groups.values()]
                      .filter((group) => filtered(group.debts).length > 0)
                      .map((group) => (
                        <Pressable
                          key={group.key}
                          accessibilityRole="button"
                          accessibilityLabel={`Open person ${group.email}`}
                          onPress={() => setPerson(group.key)}
                          style={s.card}
                        >
                          <View style={s.rowBetween}>
                            <Text style={[s.cardTitle, { flex: 1 }]}>
                              {group.email}
                            </Text>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color={colors.muted}
                            />
                          </View>
                          <Text style={s.small}>
                            {group.debts.length} request
                            {group.debts.length === 1 ? "" : "s"} ·{" "}
                            {
                              group.debts.filter((d) => d.status === "pending")
                                .length
                            }{" "}
                            pending ·{" "}
                            {
                              group.debts.filter((d) => d.status === "disputed")
                                .length
                            }{" "}
                            need resolution
                          </Text>
                        </Pressable>
                      ))}
                    {loaded &&
                      ![...groups.values()].some(
                        (g) => filtered(g.debts).length,
                      ) && (
                        <View style={s.card}>
                          <Text style={s.cardTitle}>No people here yet</Text>
                          <Text style={s.body}>
                            Add a debt or change the filter to find your
                            existing requests.
                          </Text>
                        </View>
                      )}
                    {button(
                      "All requests",
                      () => setAllRequests(true),
                      true,
                      false,
                    )}
                  </>
                )}
              </>
            ) : tab === "vaults" ? (
              <>
                <Text style={s.title}>Vaults</Text>
                <View style={s.card}>
                  <Ionicons
                    name="albums-outline"
                    size={30}
                    color={colors.green}
                  />
                  <Text style={s.sectionTitle}>
                    Account vaults are not available yet
                  </Text>
                  <Text style={s.body}>
                    Shared account vaults are not supported by this pilot.
                    Device-only mode has local vaults stored on this device;
                    those records are not synced to your account.
                  </Text>
                  {onExit &&
                    button("Choose device-only mode", onExit, true, false)}
                </View>
              </>
            ) : (
              <>
                <Text style={s.title}>Settings</Text>
                <View style={s.card}>
                  <Text style={s.label}>
                    {DEMO ? "Local demo" : "Account mode"}
                  </Text>
                  <Text style={s.body}>
                    {DEMO
                      ? "Fake identities and demo server data. Nothing here is a real account."
                      : me?.email || "Connecting your account…"}
                  </Text>
                  <Text style={s.body}>
                    {DEMO
                      ? "Demo records may disappear when the local API restarts."
                      : "Shared requests live on the configured API. Device-only records remain separate on this device and are not uploaded."}
                  </Text>
                </View>
                {DEMO && (
                  <View style={s.card}>
                    <Text style={s.label}>LOCAL DEMO · VIEW AS</Text>
                    {(["lender", "borrower"] as const).map((p) => (
                      <Pressable
                        key={p}
                        accessibilityRole="button"
                        accessibilityState={{ selected: persona === p }}
                        onPress={() => setPersona(p)}
                        style={[s.button, s.secondary]}
                      >
                        <Text style={s.cardTitle}>
                          {p === "lender" ? "Alex · lender" : "John · borrower"}
                          {persona === p ? " ✓" : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {onExit && button("Mode selection", onExit, true, false)}
                {!DEMO &&
                  signOut &&
                  button("Sign out", () => void signOut(), true, false)}
                <Text style={s.small}>
                  A shared record, not a payment service. No email or push
                  invitations are sent by this pilot.
                </Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </MobileShell>
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => setCreating(false)}
      >
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.page}
            >
              <View style={s.rowBetween}>
                <Text style={[s.sectionTitle, { flex: 1 }]}>
                  Add a shared debt
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setCreating(false)}
                  style={s.close}
                >
                  <Ionicons name="close" size={24} color={colors.ink} />
                </Pressable>
              </View>
              <Text style={s.body}>
                Record money you lent. The other person must confirm before it
                counts toward balances.
              </Text>
              <Text style={s.label}>Who owes you?</Text>
              <TextInput
                accessibilityLabel="Borrower email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={254}
                placeholder="friend@example.com"
                style={s.input}
              />
              <Text style={s.label}>Amount · AED</Text>
              <TextInput
                accessibilityLabel="Amount in AED"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={s.input}
              />
              <Text style={s.label}>What was it for?</Text>
              <TextInput
                accessibilityLabel="Description"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                placeholder="Dinner, a trip, a little help…"
                style={s.input}
              />
              <Text style={s.small}>
                No email or push notification is sent in this pilot.
              </Text>
              {!!error && (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              )}
              {button("Send for confirmation", () => void create())}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "600",
    letterSpacing: -1,
    color: colors.ink,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: colors.green,
  },
  sectionTitle: { fontSize: 20, fontWeight: "600", color: colors.ink },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  small: { fontSize: 12, lineHeight: 18, color: colors.muted },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink },
  card: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  debt: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.line,
    gap: 9,
    minHeight: 80,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  amount: { fontSize: 19, fontWeight: "600", color: colors.ink },
  status: { fontSize: 12, fontWeight: "600", color: colors.green },
  balanceCard: {
    backgroundColor: colors.ink,
    padding: 22,
    borderRadius: 22,
    gap: 10,
  },
  balanceAmount: { fontSize: 32, fontWeight: "600", color: "white" },
  balanceValue: { fontSize: 23, fontWeight: "600", color: "white" },
  balanceSmall: { fontSize: 12, lineHeight: 18, color: "#d2e1d7" },
  divider: { height: 1, backgroundColor: "#486255", marginVertical: 6 },
  button: {
    minHeight: 46,
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 14, fontWeight: "600", color: "white" },
  secondary: { backgroundColor: colors.pale },
  disabled: { opacity: 0.5 },
  shortcuts: { gap: 10 },
  filters: { gap: 8 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 15,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.pale,
  },
  activeFilter: { backgroundColor: colors.ink },
  input: {
    minHeight: 51,
    borderWidth: 1,
    borderColor: "#d5ded3",
    borderRadius: 11,
    backgroundColor: "white",
    padding: 15,
    color: colors.ink,
    fontSize: 16,
  },
  close: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    backgroundColor: "#fff0ed",
    color: "#a33131",
    fontSize: 14,
    lineHeight: 21,
    padding: 14,
    borderRadius: 10,
  },
});
