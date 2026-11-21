import type { Balance, Debt } from "../api";
/** Presentation grouping inside one authenticated session; invitations use email until identity is known. */
export function accountPeople(debts: Debt[], ownId: string | undefined) {
  const identities = new Map<string, Set<string>>();
  for (const debt of debts) {
    const lender = debt.lenderId === ownId,
      email = (lender ? debt.borrowerEmail : debt.lenderEmail).toLowerCase(),
      id = lender ? debt.borrowerId : debt.lenderId;
    if (id) {
      const ids = identities.get(email) ?? new Set<string>();
      ids.add(id);
      identities.set(email, ids);
    }
  }
  const groups = new Map<
    string,
    { key: string; email: string; debts: Debt[] }
  >();
  for (const debt of debts) {
    const lender = debt.lenderId === ownId,
      email = (lender ? debt.borrowerEmail : debt.lenderEmail).toLowerCase(),
      id = lender ? debt.borrowerId : debt.lenderId,
      known = identities.get(email);
    const key = id
      ? `id:${id}`
      : known?.size === 1
        ? `id:${[...known][0]}`
        : `email:${email}`;
    const group = groups.get(key) ?? { key, email, debts: [] };
    group.debts.push(debt);
    groups.set(key, group);
  }
  return groups;
}
export function confirmedPersonBalances(
  debts: Debt[],
  ownId: string | undefined,
): Balance[] {
  const balances = new Map<string, Balance>();
  for (const debt of debts) {
    const balance = balances.get(debt.currency) ?? {
      currency: debt.currency,
      receivableMinor: 0,
      payableMinor: 0,
      netMinor: 0,
    };
    if (debt.status === "accepted") {
      if (debt.lenderId === ownId) balance.receivableMinor += debt.amountMinor;
      else if (debt.borrowerId === ownId)
        balance.payableMinor += debt.amountMinor;
    }
    balance.netMinor = balance.receivableMinor - balance.payableMinor;
    balances.set(debt.currency, balance);
  }
  return [...balances.values()];
}
