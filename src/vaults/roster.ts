import type { Ledger } from "../offline/model";

/** Roster identity is explicit; equal names never imply the same member. */
export function validateMemberIds(
  value: unknown,
  availableIds: Iterable<string>,
): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Choose up to 100 saved people.");
  const available = new Set(availableIds),
    selected = new Set<string>();
  for (const member of value) {
    if (typeof member !== "string" || !available.has(member))
      throw new Error("Choose members from saved People.");
    if (selected.has(member))
      throw new Error("A person can only be selected once.");
    selected.add(member);
  }
  return [...value];
}

export function setVaultRoster(
  ledger: Ledger,
  vaultId: string,
  memberIds: string[],
): Ledger {
  const vault = ledger.vaults.find((item) => item.id === vaultId);
  if (!vault || vault.archived)
    throw new Error("Reactivate this vault before changing its roster.");
  const selected = validateMemberIds(
    memberIds,
    (ledger.people || []).map((person) => person.id),
  );
  return {
    ...ledger,
    vaults: ledger.vaults.map((item) =>
      item.id === vaultId ? { ...item, memberIds: selected } : item,
    ),
  };
}
