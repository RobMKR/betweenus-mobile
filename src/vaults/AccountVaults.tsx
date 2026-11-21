import React, { useEffect, useRef, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { request } from "../api";
import { Button, Choice, Field, Sheet, s } from "../offline/ui";
import PersonEditor from "../people/PersonEditor";
import {
  personRequest,
  validateSavedPerson,
  type PersonInput,
  type SavedPerson,
} from "../people/model";
import MemberPicker from "./MemberPicker";

type Vault = {
  id: string;
  title: string;
  kind: "temporary" | "permanent";
  archived: boolean;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
};
type VaultDetail = {
  vault: Vault;
  members: SavedPerson[];
  history: {
    id: string;
    action: "created" | "member_added" | "member_removed";
    personId: string | null;
    actorId: string;
    createdAt: string;
  }[];
};

export default function AccountVaults({
  token,
  ownerId,
  people,
  onPersonCreated,
  rootRevision = 0,
  createRevision = 0,
}: {
  token: string;
  ownerId: string;
  people: SavedPerson[];
  onPersonCreated: (person: SavedPerson) => void;
  rootRevision?: number;
  createRevision?: number;
}) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [personEditor, setPersonEditor] = useState(false);
  const [personError, setPersonError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"temporary" | "permanent">("permanent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addedPeople, setAddedPeople] = useState<SavedPerson[]>([]);
  const latest = useRef({ token, ownerId, onPersonCreated });
  latest.current = { token, ownerId, onPersonCreated };
  const active = useRef(false);
  const epoch = useRef(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const saving = useRef(false);
  const allPeople = [
    ...people,
    ...[...addedPeople, ...(detail?.members ?? [])].filter(
      (p, index, items) =>
        !people.some((item) => item.id === p.id) &&
        items.findIndex((item) => item.id === p.id) === index,
    ),
  ];

  function current(generation: number, owner: string) {
    return (
      active.current &&
      epoch.current === generation &&
      latest.current.ownerId === owner
    );
  }
  async function loadList() {
    const generation = epoch.current,
      owner = latest.current.ownerId;
    const sequence = ++listRequest.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<{ vaults: Vault[] }>(
        "/vaults",
        latest.current.token,
      );
      if (current(generation, owner) && sequence === listRequest.current)
        setVaults(result.vaults);
    } catch (e) {
      if (current(generation, owner) && sequence === listRequest.current)
        setError((e as Error).message);
    } finally {
      if (current(generation, owner) && sequence === listRequest.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    epoch.current++;
    saving.current = false;
    setBusy(false);
    setVaults([]);
    setDetail(null);
    setCreating(false);
    setManaging(false);
    setPersonEditor(false);
    setAddedPeople([]);
    setSelectedIds([]);
    setTitle("");
    setDraftError("");
    setPersonError("");
    void loadList();
    return () => {
      active.current = false;
      epoch.current++;
    };
  }, [ownerId]);
  const previousRoot = useRef(rootRevision);
  useEffect(() => {
    if (previousRoot.current === rootRevision) return;
    previousRoot.current = rootRevision;
    epoch.current++;
    detailRequest.current++;
    saving.current = false;
    setBusy(false);
    setDetail(null);
    setCreating(false);
    setManaging(false);
    setPersonEditor(false);
    void loadList();
  }, [rootRevision]);

  useEffect(() => {
    if (!detail || creating || managing || personEditor) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!busy) {
          setDetail(null);
          setError("");
          void loadList();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [detail, creating, managing, personEditor, busy]);

  const previousCreate = useRef(0);
  useEffect(() => {
    if (!createRevision || previousCreate.current === createRevision) return;
    previousCreate.current = createRevision;
    beginCreate();
  }, [createRevision]);

  async function openDetail(id: string) {
    const generation = epoch.current,
      owner = latest.current.ownerId;
    const sequence = ++detailRequest.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<VaultDetail>(
        `/vaults/${encodeURIComponent(id)}`,
        latest.current.token,
      );
      if (current(generation, owner) && sequence === detailRequest.current)
        setDetail(result);
    } catch (e) {
      if (current(generation, owner) && sequence === detailRequest.current)
        setError((e as Error).message);
    } finally {
      if (current(generation, owner) && sequence === detailRequest.current)
        setLoading(false);
    }
  }
  function beginCreate() {
    setTitle("");
    setKind("permanent");
    setSelectedIds([]);
    setDraftError("");
    setCreating(true);
  }
  function validateMembers() {
    if (
      selectedIds.length > 100 ||
      new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some((id) => !allPeople.some((p) => p.id === id))
    ) {
      throw new Error("Choose up to 100 different saved people.");
    }
  }
  async function saveVault() {
    if (saving.current) return;
    try {
      if (!title.trim() || title.trim().length > 100 || title.includes("\0"))
        throw new Error("Enter a vault title up to 100 characters.");
      validateMembers();
    } catch (e) {
      setDraftError((e as Error).message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setDraftError("");
    const generation = epoch.current,
      owner = latest.current.ownerId;
    try {
      const result = await request<VaultDetail>(
        "/vaults",
        latest.current.token,
        { title: title.trim(), kind, memberIds: selectedIds },
      );
      if (!current(generation, owner)) return;
      setVaults((items) => [
        result.vault,
        ...items.filter((v) => v.id !== result.vault.id),
      ]);
      setDetail(result);
      setCreating(false);
    } catch (e) {
      if (current(generation, owner))
        setDraftError(
          `${(e as Error).message} The vault may have been saved. Close this draft and refresh the vault list before retrying to avoid duplicates.`,
        );
    } finally {
      if (current(generation, owner)) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  async function saveRoster() {
    if (!detail || saving.current) return;
    try {
      validateMembers();
    } catch (e) {
      setDraftError((e as Error).message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setDraftError("");
    const generation = epoch.current,
      owner = latest.current.ownerId;
    const initial = detail;
    try {
      let result = initial;
      // Each route is idempotent; preserve the desired draft if a later change fails.
      const removed = initial.vault.memberIds.filter(
        (id) => !selectedIds.includes(id),
      );
      const added = selectedIds.filter(
        (id) => !initial.vault.memberIds.includes(id),
      );
      for (const [ids, suffix] of [
        [removed, "/remove"],
        [added, ""],
      ] as const) {
        for (const personId of ids) {
          result = await request<VaultDetail>(
            `/vaults/${encodeURIComponent(initial.vault.id)}/members${suffix}`,
            latest.current.token,
            { personId },
          );
          if (!current(generation, owner)) return;
          setDetail(result);
          setVaults((items) =>
            items.map((v) => (v.id === result.vault.id ? result.vault : v)),
          );
        }
      }
      setManaging(false);
    } catch (e) {
      if (current(generation, owner))
        setDraftError(
          `${(e as Error).message} Some changes may already be saved. Your selection is kept; retry safely to finish, or close and reload the vault.`,
        );
    } finally {
      if (current(generation, owner)) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  async function savePerson(input: PersonInput) {
    if (saving.current) return false;
    let body: ReturnType<typeof personRequest>;
    try {
      body = personRequest(input);
    } catch (e) {
      setPersonError((e as Error).message);
      return false;
    }
    saving.current = true;
    setBusy(true);
    setPersonError("");
    const generation = epoch.current,
      owner = latest.current.ownerId;
    try {
      const { person } = await request<{ person: SavedPerson }>(
        "/people",
        latest.current.token,
        body,
      );
      if (!current(generation, owner)) return false;
      validateSavedPerson(person);
      setAddedPeople((items) => [
        ...items.filter((p) => p.id !== person.id),
        person,
      ]);
      latest.current.onPersonCreated(person);
      setSelectedIds((ids) =>
        ids.length < 100 ? [...new Set([...ids, person.id])] : ids,
      );
      setPersonEditor(false);
      return true;
    } catch (e) {
      if (current(generation, owner))
        setPersonError(
          `${(e as Error).message} If the response was interrupted, check People before saving again to avoid duplicates.`,
        );
      return false;
    } finally {
      if (current(generation, owner)) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  const picker = (
    <MemberPicker
      people={allPeople}
      selectedIds={selectedIds}
      onChange={setSelectedIds}
      disabled={busy}
      onAddPerson={() => {
        setPersonError("");
        setPersonEditor(true);
      }}
    />
  );
  return (
    <View style={{ gap: 18 }}>
      {detail ? (
        <>
          <Button
            title="Back to vaults"
            secondary
            disabled={busy}
            onPress={() => {
              setDetail(null);
              setError("");
              void loadList();
            }}
          />
          <Text style={s.eyebrow}>{detail.vault.kind.toUpperCase()} VAULT</Text>
          <Text style={s.title}>{detail.vault.title}</Text>
          <Text style={s.body}>
            Your private roster. Adding people grants no account access and
            sends no invitation.
          </Text>
          <View style={s.card}>
            <Text style={s.section}>Members · {detail.members.length}</Text>
            <Text style={s.small}>You are included separately.</Text>
            {!detail.members.length && (
              <Text style={s.body}>No saved members yet.</Text>
            )}
            {detail.members.map((person, index) => (
              <View key={person.id} style={{ gap: 4 }}>
                <Text style={s.cardTitle}>{person.name}</Text>
                <Text style={s.small}>
                  {person.email || person.phone || `Saved person ${index + 1}`}
                </Text>
              </View>
            ))}
            <Button
              title="Manage members"
              secondary
              disabled={busy || detail.vault.archived}
              onPress={() => {
                setSelectedIds([...detail.vault.memberIds]);
                setDraftError("");
                setManaging(true);
              }}
            />
          </View>
          <View style={s.card}>
            <Text style={s.section}>Events</Text>
            <Text style={s.body}>
              This roster will be the starting pool for event participants. The
              guided event flow is coming in the linked event update.
            </Text>
            <Text style={s.small}>
              Roster changes do not change participants, shares or payments
              already saved in event history.
            </Text>
          </View>
          <Text style={s.section}>Membership history</Text>
          {detail.history.map((entry) => (
            <View key={entry.id} style={s.history}>
              <Text style={s.label}>
                {entry.action === "created"
                  ? "Vault created"
                  : entry.action === "member_added"
                    ? "Member added"
                    : "Member removed"}
              </Text>
              <Text style={s.small}>
                {new Date(entry.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <Text style={s.eyebrow}>PRIVATE ACCOUNT VAULTS</Text>
          <Text style={s.title}>Your vaults</Text>
          <Text style={s.body}>
            Bring a group together for shared plans. Account vaults stay
            separate from device-only vaults.
          </Text>
          <Button
            title="Create vault"
            disabled={loading}
            onPress={beginCreate}
          />
          {!loading && !vaults.length && !error && (
            <Text style={s.body}>
              No vaults yet. Start with a title and choose members now or later.
            </Text>
          )}
          {vaults.map((vault) => (
            <View key={vault.id} style={s.card}>
              <Text style={s.cardTitle}>{vault.title}</Text>
              <Text style={s.small}>
                {vault.kind === "permanent" ? "Permanent" : "Temporary"} ·{" "}
                {vault.memberIds.length} members
                {vault.archived ? " · Archived" : ""}
              </Text>
              <Button
                title={`Open ${vault.title}`}
                secondary
                disabled={loading}
                onPress={() => void openDetail(vault.id)}
              />
            </View>
          ))}
        </>
      )}
      {loading && (
        <Text accessibilityRole="status" style={s.body}>
          Loading vaults…
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button
        title={detail ? "Reload vault" : "Refresh vaults"}
        secondary
        disabled={loading || busy}
        onPress={() => void (detail ? openDetail(detail.vault.id) : loadList())}
      />
      <Sheet
        visible={creating && !personEditor}
        title="Create vault"
        onClose={() => {
          if (!busy) setCreating(false);
        }}
      >
        <Field
          label="Vault title"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          editable={!busy}
        />
        <Text style={s.label}>Vault kind</Text>
        <View style={s.row}>
          <Choice
            title="Permanent"
            active={kind === "permanent"}
            onPress={() => {
              if (!busy) setKind("permanent");
            }}
          />
          <Choice
            title="Temporary"
            active={kind === "temporary"}
            onPress={() => {
              if (!busy) setKind("temporary");
            }}
          />
        </View>
        {picker}
        {!!draftError && (
          <Text accessibilityRole="alert" style={s.error}>
            {draftError}
          </Text>
        )}
        <Button
          title={busy ? "Saving vault…" : "Save vault"}
          disabled={busy}
          onPress={() => void saveVault()}
        />
      </Sheet>
      <Sheet
        visible={managing && !personEditor}
        title="Manage members"
        onClose={() => {
          if (!busy) setManaging(false);
        }}
      >
        {picker}
        <Text style={s.small}>
          Removing a member keeps their saved Person and all earlier event
          history.
        </Text>
        {!!draftError && (
          <Text accessibilityRole="alert" style={s.error}>
            {draftError}
          </Text>
        )}
        <Button
          title={busy ? "Saving members…" : "Save members"}
          disabled={busy}
          onPress={() => void saveRoster()}
        />
      </Sheet>
      <PersonEditor
        visible={personEditor}
        note="Saving this person keeps them in People even if you cancel this vault form."
        onClose={() => {
          if (!busy) setPersonEditor(false);
        }}
        onSave={savePerson}
        busy={busy}
        error={personError}
      />
    </View>
  );
}
