import type { LocalRecord } from "../offline/model";
import { remaining } from "../offline/model";
export function personKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function localPeople(records: LocalRecord[]) {
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      records: LocalRecord[];
      receivableMinor: number;
      payableMinor: number;
    }
  >();
  for (const record of records) {
    const key = personKey(record.name);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: record.name.trim().replace(/\s+/g, " "),
        records: [],
        receivableMinor: 0,
        payableMinor: 0,
      };
      groups.set(key, group);
    }
    group.records.push(record);
    const value = remaining(record.amountMinor, record.payments);
    if (record.direction === "lent") group.receivableMinor += value;
    else group.payableMinor += value;
  }
  return Array.from(groups.values());
}
export type DetailPath = {
  personKey?: string;
  savedPersonId?: string;
  recordId?: string;
  vaultId?: string;
  eventId?: string;
};
export function backPath(path: DetailPath): DetailPath | null {
  if (path.recordId) {
    const { recordId, ...parent } = path;
    return parent;
  }
  if (path.eventId) {
    const { eventId, ...parent } = path;
    return parent;
  }
  if (path.vaultId || path.personKey || path.savedPersonId) return {};
  return null;
}
