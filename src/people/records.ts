import type { LocalRecord } from "../offline/model";
import { remaining } from "../offline/model";
export function savedPersonRecords(records: LocalRecord[], personId?: string) {
  const linked = personId
    ? records.filter((record) => record.personId === personId)
    : [];
  return {
    records: linked,
    receivableMinor: linked
      .filter((r) => r.direction === "lent")
      .reduce((sum, r) => sum + remaining(r.amountMinor, r.payments), 0),
    payableMinor: linked
      .filter((r) => r.direction === "borrowed")
      .reduce((sum, r) => sum + remaining(r.amountMinor, r.payments), 0),
  };
}
