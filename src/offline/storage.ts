import { emptyLedger, Ledger, validateLedger, migrateLedger } from "./model";
export const LEDGER_KEY = "betweenus.offline-ledger.v1";
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export function createLedgerStore(storage: Storage) {
  let ledger: Ledger | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      const task = queue.then(async () => {
        const raw = await storage.getItem(LEDGER_KEY);
        const next =
          raw === null ? emptyLedger() : migrateLedger(JSON.parse(raw));
        ledger = next;
        return next;
      });
      queue = task.catch(() => {});
      return task;
    },
    commit(change: (current: Ledger) => Ledger): Promise<Ledger> {
      const task = queue.then(async () => {
        if (!ledger)
          throw new Error("Load local records before making changes.");
        const next = validateLedger(change(ledger));
        await storage.setItem(LEDGER_KEY, JSON.stringify(next));
        ledger = next;
        return next;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
