import { money, type Currency } from "../currency/model";
import { palettes } from "../appearance/colors";
import type { AppColorScheme } from "../appearance/preference";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import EventDateField from "../offline/EventDateField";
import { Button, Field, Sheet, useUi, uiStyles } from "../offline/ui";
import PersonEditor from "../people/PersonEditor";
import type { PersonInput, SavedPerson } from "../people/model";
import {
  buildEventSubmission,
  draftParticipantIds,
  newEventDraft,
  previewAllocations,
  type EventDraft,
  type EventSubmission,
} from "./draft";

export type EventWizardProps = {
  visible: boolean;
  vaultTitle: string;
  currency: Currency;
  rosterIds: string[];
  people: SavedPerson[];
  onClose: () => void;
  onSave: (submission: EventSubmission) => Promise<boolean>;
  onCreatePerson: (input: PersonInput) => Promise<SavedPerson | null>;
  busy?: boolean;
  error?: string;
  retrying?: boolean;
};

const steps = ["Details", "People", "Split and review"] as const;

function Selection({
  label,
  detail,
  checked,
  role = "checkbox",
  disabled,
  onPress,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  role?: "checkbox" | "radio";
  disabled?: boolean;
  onPress: () => void;
}) {
  const { scheme, c, s } = useUi();
  const styles = stylesByScheme[scheme];
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={[styles.selection, checked && styles.selected]}
    >
      <View style={styles.personText}>
        <Text style={s.label}>{label}</Text>
        {!!detail && <Text style={s.small}>{detail}</Text>}
      </View>
      <Ionicons
        name={
          role === "radio"
            ? checked
              ? "radio-button-on"
              : "radio-button-off"
            : checked
              ? "checkbox"
              : "square-outline"
        }
        color={c.accent}
        size={22}
      />
    </Pressable>
  );
}

export function EventWizard(props: EventWizardProps) {
  return props.visible ? <WizardSession {...props} /> : null;
}

export default EventWizard;

function WizardSession({
  vaultTitle,
  currency,
  rosterIds,
  people,
  onClose,
  onSave,
  onCreatePerson,
  busy = false,
  error = "",
  retrying = false,
}: EventWizardProps) {
  const amountLabel = (minor: number) => money(minor, currency);
  const { scheme, c, s } = useUi();
  const styles = stylesByScheme[scheme];
  const [draft, setDraft] = useState<EventDraft>(() => ({
    ...newEventDraft(),
    selectedPersonIds: [...new Set(rosterIds)]
      .filter((id) => people.some((person) => person.id === id))
      .slice(0, 99),
  }));
  const [step, setStep] = useState(0);
  const [editingDate, setEditingDate] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [createdPeople, setCreatedPeople] = useState<SavedPerson[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const mutation = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const locked = busy || pending;
  const byId = new Map(people.map((person) => [person.id, person]));
  for (const person of createdPeople) {
    if (!byId.has(person.id)) byId.set(person.id, person);
  }
  const candidates = [...byId.values()];
  const roster = new Set(rosterIds);
  const members = [...roster].flatMap((id) => {
    const person = byId.get(id);
    return person ? [person] : [];
  });
  const savedPeople = candidates.filter((person) => !roster.has(person.id));
  const selected = new Set(draft.selectedPersonIds);
  const count = selected.size + Number(draft.includeMe);
  const payerNeedsReview =
    !draft.payerId ||
    (draft.payerId !== "self" &&
      (!selected.has(draft.payerId) || !byId.has(draft.payerId)));

  const preview =
    step === 2 ? previewAllocations(draft, candidates, currency) : null;
  let submission: EventSubmission | undefined;
  let reviewError = "";
  if (preview) {
    try {
      submission = buildEventSubmission(draft, candidates, currency);
    } catch (cause) {
      reviewError = (cause as Error).message;
    }
  }

  function update(change: Partial<EventDraft>) {
    if (locked) return;
    setMessage("");
    setDraft((current) => ({ ...current, ...change }));
  }

  function next() {
    if (locked || editingDate) return;
    try {
      if (step === 0) {
        buildEventSubmission(
          {
            ...newEventDraft(),
            title: draft.title,
            date: draft.date,
            amount: draft.amount,
          },
          [],
          currency,
        );
      } else {
        draftParticipantIds(draft, candidates);
        if (payerNeedsReview) return;
      }
      setMessage("");
      setStep(step + 1);
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }

  function togglePerson(id: string) {
    if (selected.has(id)) {
      update({
        selectedPersonIds: draft.selectedPersonIds.filter(
          (value) => value !== id,
        ),
        ...(draft.payerId === id ? { payerId: null } : {}),
      });
    } else if (count < 100) {
      update({ selectedPersonIds: [...draft.selectedPersonIds, id] });
    }
  }

  async function createPerson(input: PersonInput) {
    if (locked || mutation.current) return false;
    mutation.current = true;
    setPending(true);
    setMessage("");
    try {
      const person = await onCreatePerson(input);
      if (!active.current) return false;
      if (!person) {
        setMessage("Could not save this person. Try again.");
        return false;
      }
      setCreatedPeople((current) => [...current, person]);
      setDraft((current) =>
        current.selectedPersonIds.includes(person.id)
          ? current
          : {
              ...current,
              selectedPersonIds: [...current.selectedPersonIds, person.id],
            },
      );
      setAddingPerson(false);
      return true;
    } catch (cause) {
      if (active.current) setMessage((cause as Error).message);
      return false;
    } finally {
      mutation.current = false;
      if (active.current) setPending(false);
    }
  }

  async function save() {
    if (!submission || editingDate || locked || mutation.current) return;
    mutation.current = true;
    setPending(true);
    setMessage("");
    try {
      const saved = await onSave(submission);
      if (!active.current) return;
      if (saved) onClose();
      else setMessage("Could not save the event. Try again.");
    } catch (cause) {
      if (active.current) setMessage((cause as Error).message);
    } finally {
      mutation.current = false;
      if (active.current) setPending(false);
    }
  }

  const personLabel = (id: string) =>
    id === "self" ? "You" : (byId.get(id)?.name ?? "Participant");
  const duplicates = new Map<string, SavedPerson[]>();
  for (const person of candidates) {
    const matches = duplicates.get(person.name);
    if (matches) matches.push(person);
    else duplicates.set(person.name, [person]);
  }
  const personDetail = (id: string) => {
    const person = byId.get(id);
    if (!person) return undefined;
    const matches = duplicates.get(person.name);
    if (
      (matches && matches.length > 1) ||
      person.name.normalize("NFKC").trim().toLocaleLowerCase() === "you"
    ) {
      return [
        person.email || person.phone,
        `Saved person ${candidates.findIndex((candidate) => candidate.id === id) + 1}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return undefined;
  };
  function personGroup(title: string, group: SavedPerson[]) {
    if (!group.length) return null;
    return (
      <View style={styles.group}>
        <Text accessibilityRole="header" style={s.cardTitle}>
          {title}
        </Text>
        {group.map((person) => (
          <Selection
            key={person.id}
            label={person.name}
            detail={personDetail(person.id)}
            checked={selected.has(person.id)}
            disabled={locked || (!selected.has(person.id) && count >= 100)}
            onPress={() => togglePerson(person.id)}
          />
        ))}
      </View>
    );
  }

  function back() {
    if (locked || mutation.current) return;
    setMessage("");
    if (step > 0) setStep(step - 1);
    else onClose();
  }
  function close() {
    if (!locked && !mutation.current) onClose();
  }

  return (
    <>
      <Sheet
        visible={!addingPerson}
        title="New event"
        onClose={close}
        scrollKey={step}
        onRequestClose={back}
      >
        <View style={styles.header}>
          <Text style={s.body}>{vaultTitle}</Text>
          <View
            style={styles.progress}
            accessible
            accessibilityLabel={`Step ${step + 1} of 3`}
          >
            {steps.map((label, index) => (
              <View
                key={label}
                style={[styles.segment, index <= step && styles.completed]}
              />
            ))}
          </View>
          <Text style={s.section} accessibilityRole="header">
            {steps[step]}
          </Text>
        </View>
        {step === 0 && (
          <>
            <Field
              label="Event title"
              value={draft.title}
              onChangeText={(title) => update({ title })}
              maxLength={100}
              editable={!locked}
            />
            <EventDateField
              value={draft.date}
              onChange={(date) => update({ date })}
              onEditingChange={setEditingDate}
              disabled={locked}
            />
            <Field
              label={`Total amount (${currency})`}
              value={draft.amount}
              onChangeText={(amount) => update({ amount })}
              keyboardType="decimal-pad"
              inputMode="decimal"
              editable={!locked}
            />
            <View style={styles.selection}>
              <Text style={[s.label, styles.personText]}>Partial payments</Text>
              <Switch
                accessibilityLabel="Partial payments"
                value={draft.partialPayments}
                disabled={locked}
                onValueChange={(partialPayments) => update({ partialPayments })}
                trackColor={{ false: c.switchTrack, true: c.action }}
                ios_backgroundColor={c.switchTrack}
                thumbColor={c.switchThumb}
              />
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <View style={styles.selection}>
              <Text style={[s.label, styles.personText]}>Include me</Text>
              <Switch
                accessibilityLabel="Include me"
                value={draft.includeMe}
                disabled={locked || (!draft.includeMe && count >= 100)}
                onValueChange={(includeMe) => update({ includeMe })}
                trackColor={{ false: c.switchTrack, true: c.action }}
                ios_backgroundColor={c.switchTrack}
                thumbColor={c.switchThumb}
              />
            </View>
            <Text style={s.body} accessibilityLiveRegion="polite">
              {count === 1 ? "1 participant" : `${count} participants`}
              {count === 100 ? " · Maximum reached" : ""}
            </Text>
            {personGroup("Vault members", members)}
            {personGroup("Saved People", savedPeople)}
            <Button
              title="Add a person"
              secondary
              disabled={locked || count >= 100}
              onPress={() => {
                setMessage("");
                setAddingPerson(true);
              }}
            />
            <View style={styles.group}>
              <Text style={s.cardTitle} accessibilityRole="header">
                Who paid?
              </Text>
              {payerNeedsReview && (
                <Text accessibilityRole="alert" style={s.error}>
                  Choose a payer. A payer other than you must be a selected
                  participant.
                </Text>
              )}
              <Selection
                role="radio"
                label="You"
                detail={
                  draft.includeMe ? undefined : "Paying outside the split"
                }
                checked={draft.payerId === "self"}
                disabled={locked}
                onPress={() => update({ payerId: "self" })}
              />
              {draft.selectedPersonIds.map((id) => {
                const person = byId.get(id);
                return person ? (
                  <Selection
                    role="radio"
                    key={id}
                    label={person.name}
                    detail={personDetail(person.id)}
                    checked={draft.payerId === id}
                    disabled={locked}
                    onPress={() => update({ payerId: id })}
                  />
                ) : null;
              })}
            </View>
          </>
        )}

        {preview && (
          <>
            <View style={styles.summary}>
              <Text style={s.cardTitle}>{draft.title.trim()}</Text>
              <Text style={s.body}>
                {draft.date} · Paid by{" "}
                {draft.payerId ? personLabel(draft.payerId) : "—"}
              </Text>
              {!!preview.totalMinor && (
                <Text style={s.amount}>{amountLabel(preview.totalMinor)}</Text>
              )}
            </View>
            <View style={styles.group}>
              <Text style={s.cardTitle} accessibilityRole="header">
                Split method
              </Text>
              <Selection
                role="radio"
                label="Equal"
                checked={draft.splitMode === "equal"}
                disabled={locked}
                onPress={() => update({ splitMode: "equal" })}
              />
              <Selection
                role="radio"
                label="Manual"
                checked={draft.splitMode === "manual"}
                disabled={locked}
                onPress={() => update({ splitMode: "manual" })}
              />
            </View>
            {preview.remainingMinor !== null && (
              <View style={styles.summary} accessibilityLiveRegion="polite">
                <Text style={s.cardTitle}>
                  {preview.remainingMinor < 0
                    ? "Over-allocated"
                    : "Remaining to allocate"}
                </Text>
                <Text style={s.cardTitle}>
                  {amountLabel(Math.abs(preview.remainingMinor))}
                </Text>
              </View>
            )}
            <View style={styles.group}>
              {draft.splitMode === "equal"
                ? preview.allocations.map(({ participantId, shareMinor }) => (
                    <View key={participantId} style={styles.allocation}>
                      <View style={styles.personText}>
                        <Text style={s.label}>
                          {personLabel(participantId)}
                        </Text>
                        {!!personDetail(participantId) && (
                          <Text style={s.small}>
                            {personDetail(participantId)}
                          </Text>
                        )}
                      </View>
                      <Text style={s.label}>{amountLabel(shareMinor)}</Text>
                    </View>
                  ))
                : preview.participantIds.map((id) => (
                    <Field
                      key={id}
                      label={`${personLabel(id)} share (${currency})${personDetail(id) ? ` · ${personDetail(id)}` : ""}`}
                      value={
                        Object.prototype.hasOwnProperty.call(
                          draft.manualAmounts,
                          id,
                        )
                          ? draft.manualAmounts[id]
                          : ""
                      }
                      onChangeText={(value) =>
                        update({
                          manualAmounts: {
                            ...draft.manualAmounts,
                            [id]: value,
                          },
                        })
                      }
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      editable={!locked}
                    />
                  ))}
            </View>
            {!!reviewError && (
              <Text accessibilityRole="alert" style={s.error}>
                {preview.errors.length ? preview.errors[0] : reviewError}
              </Text>
            )}
          </>
        )}
        {!addingPerson && !!(message || (step === 2 && error)) && (
          <Text accessibilityRole="alert" style={s.error}>
            {(step === 2 && error) || message}
          </Text>
        )}
        <View style={styles.group}>
          {step < 2 ? (
            <Button
              title="Next"
              disabled={
                locked || editingDate || (step === 1 && payerNeedsReview)
              }
              onPress={next}
            />
          ) : (
            <Button
              title={
                locked
                  ? "Saving event…"
                  : retrying
                    ? "Retry event save"
                    : "Save event"
              }
              disabled={locked || !submission}
              onPress={() => void save()}
            />
          )}
          {step > 0 && (
            <Button title="Back" secondary disabled={locked} onPress={back} />
          )}
          <Button title="Cancel" secondary disabled={locked} onPress={close} />
        </View>
      </Sheet>
      <PersonEditor
        visible={addingPerson}
        onClose={() => {
          setAddingPerson(false);
          setMessage("");
        }}
        onSave={createPerson}
        busy={locked}
        error={error || message}
        note="Saving this person adds them to Saved People and selects them for this event."
      />
    </>
  );
}

function createStyles(scheme: AppColorScheme) {
  const c = palettes[scheme];
  const s = uiStyles[scheme];
  return StyleSheet.create({
    header: { gap: 8 },
    progress: { flexDirection: "row", gap: 6 },
    segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line },
    completed: { backgroundColor: c.accent },
    group: { gap: 8 },
    selection: {
      ...s.rowBetween,
      minHeight: 48,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      backgroundColor: c.surface,
    },
    selected: { backgroundColor: c.pale, borderColor: c.accent },
    personText: { flex: 1, minWidth: 0 },
    summary: {
      padding: 14,
      gap: 5,
      borderRadius: 12,
      backgroundColor: c.highlight,
    },
    allocation: {
      ...s.rowBetween,
      minHeight: 44,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
  });
}

const stylesByScheme = {
  light: createStyles("light"),
  dark: createStyles("dark"),
};
