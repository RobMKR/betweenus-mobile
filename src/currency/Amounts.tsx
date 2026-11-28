import React from "react";
import { Text, View } from "react-native";
import { useUi } from "../offline/ui";
import { money, type Currency, type createValuation } from "./model";

type Valuation = ReturnType<typeof createValuation>;
type Totals = ReturnType<Valuation["balances"]>;

export function AmountEstimate({
  minor,
  currency,
  valuation,
}: {
  minor: number;
  currency: Currency;
  valuation: Valuation;
}) {
  const { s } = useUi();
  if (currency === valuation.currency) return null;
  const converted = valuation.amount(minor, currency);
  return (
    <Text style={s.small}>
      {converted === null
        ? `Rate needed for ${currency} → ${valuation.currency}`
        : `≈ ${money(converted, valuation.currency)}`}
    </Text>
  );
}

export function totalAmount(totals: Totals, field: keyof Totals["unknown"]) {
  return totals.unknown[field] ? "—" : money(totals[field], totals.currency);
}

export function BalanceTotals({
  totals,
  accessibilityPrefix,
}: {
  totals: Totals;
  accessibilityPrefix?: string;
}) {
  const { s } = useUi();
  return (
    <View style={{ gap: 5 }}>
      <Text
        accessibilityLabel={
          accessibilityPrefix && `${accessibilityPrefix} receivable`
        }
        style={s.label}
      >
        Owed to you · {totalAmount(totals, "receivableMinor")}
      </Text>
      <Text
        accessibilityLabel={
          accessibilityPrefix && `${accessibilityPrefix} payable`
        }
        style={s.label}
      >
        You owe · {totalAmount(totals, "payableMinor")}
      </Text>
      {!!totals.missingCurrencies.length && (
        <Text style={s.small} accessibilityRole="status">
          {incompleteLabel(totals.missingCurrencies)}
        </Text>
      )}
    </View>
  );
}

export function incompleteLabel(currencies: Currency[]) {
  return `Incomplete total · Rate needed for ${currencies.join(", ")}`;
}
