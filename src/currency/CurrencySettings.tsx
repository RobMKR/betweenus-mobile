import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Field, Sheet, useUi } from "../offline/ui";
import {
  currencies,
  currencyName,
  pairKey,
  suggestions,
  validateSettings,
  type Currency,
  type CurrencySettings as Settings,
  type Quote,
} from "./model";

export function CurrencyField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Currency;
  onChange: (currency: Currency) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { s } = useUi();
  const search = query.trim().toLowerCase();
  const matches = currencies.filter((currency) =>
    `${currency} ${currencyName(currency)}`.toLowerCase().includes(search),
  );
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <Button
        secondary
        title={`${value} · ${currencyName(value)}`}
        accessibilityLabel={`${label}, ${value} ${currencyName(value)}`}
        disabled={disabled}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
      />
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <Field
          label="Search currencies"
          placeholder="Currency name or code"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {!matches.length && (
          <Text style={s.body}>No currencies match your search.</Text>
        )}
        {matches.map((currency) => (
          <Pressable
            key={currency}
            accessibilityRole="button"
            accessibilityState={{ selected: currency === value }}
            onPress={() => {
              onChange(currency);
              setOpen(false);
            }}
            style={[s.card, { minHeight: 48 }]}
          >
            <Text style={s.cardTitle}>
              {currency} · {currencyName(currency)}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

export default function CurrencySettings({
  settings,
  save,
  unavailable,
  onRetry,
}: {
  settings: Settings;
  save: (settings: Settings) => Promise<void>;
  unavailable?: string;
  onRetry?: () => void;
}) {
  const { s } = useUi();
  const [editor, setEditor] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [oldPair, setOldPair] = useState<string | null>(null);
  const [base, setBase] = useState<Currency>("USD");
  const [quoteCurrency, setQuoteCurrency] = useState<Currency>("AED");
  const [rate, setRate] = useState("");
  const [suggestion, setSuggestion] = useState<Quote | null>(null);

  async function persist(next: Settings, onSaved?: () => void) {
    setError("");
    setWorking(true);
    try {
      await save(validateSettings(next));
      onSaved?.();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  function edit(quote?: Quote, suggested = false) {
    setError("");
    setOldPair(
      quote && !suggested
        ? pairKey(quote.baseCurrency, quote.quoteCurrency)
        : null,
    );
    setBase(quote?.baseCurrency ?? "USD");
    setQuoteCurrency(
      quote?.quoteCurrency ??
        (settings.mainCurrency === "USD" ? "AED" : settings.mainCurrency),
    );
    setRate(quote?.rate ?? "");
    setSuggestion(suggested && quote ? quote : null);
    setEditor(true);
  }
  const disabled = working || !!unavailable;
  const replacedPair = pairKey(base, quoteCurrency);
  const duplicate = settings.rates.some((saved) => {
    const key = pairKey(saved.baseCurrency, saved.quoteCurrency);
    return key !== oldPair && key === replacedPair;
  });
  const saveRate = () => {
    const value = rate.trim();
    const exactSuggestion =
      suggestion?.baseCurrency === base &&
      suggestion.quoteCurrency === quoteCurrency &&
      suggestion.rate === value;
    const next: Quote = exactSuggestion
      ? suggestion
      : {
          baseCurrency: base,
          quoteCurrency,
          rate: value,
          source: "manual",
          asOf: new Date().toISOString(),
        };
    void persist(
      {
        ...settings,
        rates: [
          ...settings.rates.filter(
            (saved) =>
              pairKey(saved.baseCurrency, saved.quoteCurrency) !== oldPair,
          ),
          next,
        ],
      },
      () => setEditor(false),
    );
  };
  return (
    <>
      <View style={s.card}>
        <Text style={s.cardTitle}>Currency and exchange rates</Text>
        {!!unavailable && (
          <>
            <Text style={s.body} accessibilityRole="alert">
              {unavailable}
            </Text>
            {!!onRetry && (
              <Button
                title="Reload currency settings"
                onPress={onRetry}
                secondary
              />
            )}
          </>
        )}
        <CurrencyField
          label="Main currency"
          value={settings.mainCurrency}
          onChange={(mainCurrency) =>
            void persist({ ...settings, mainCurrency })
          }
          disabled={disabled}
        />
        <Text style={s.body}>
          Totals estimate outstanding balances using your saved rates.
        </Text>
        {!!error && !editor && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {settings.rates.map((quote) => (
          <View
            style={s.card}
            key={pairKey(quote.baseCurrency, quote.quoteCurrency)}
          >
            <Text style={s.cardTitle}>{rateLabel(quote)}</Text>
            <Text style={s.body}>
              {quote.source === "manual" ? "Manual" : "Suggested"} · As of{" "}
              {quote.asOf.slice(0, 10)}
            </Text>
            {quote.source === "suggested" && (
              <Text style={s.body}>
                {
                  suggestions.find(
                    ({ quote: hint }) =>
                      hint.baseCurrency === quote.baseCurrency &&
                      hint.quoteCurrency === quote.quoteCurrency,
                  )?.sourceName
                }
              </Text>
            )}
            <Button
              secondary
              disabled={disabled}
              title={`Edit ${quote.baseCurrency}/${quote.quoteCurrency} rate`}
              onPress={() => edit(quote)}
            />
          </View>
        ))}
        <Button
          title="Add exchange rate"
          disabled={disabled}
          onPress={() => edit()}
        />
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Reference rate suggestions</Text>
        <Text style={s.body}>
          Peg reference rates. Your bank’s rate may differ.
        </Text>
        {suggestions.map(({ quote, sourceName }) => {
          const exists = settings.rates.some(
            (saved) =>
              pairKey(saved.baseCurrency, saved.quoteCurrency) ===
              pairKey(quote.baseCurrency, quote.quoteCurrency),
          );
          return (
            <View key={quote.quoteCurrency + quote.baseCurrency} style={s.card}>
              <Text style={s.cardTitle}>{rateLabel(quote)}</Text>
              <Text style={s.body}>
                {sourceName} · Verified {quote.asOf.slice(0, 10)}
              </Text>
              <Button
                secondary
                title={
                  exists
                    ? `${quote.baseCurrency}/${quote.quoteCurrency} rate already saved`
                    : `Use ${quote.baseCurrency}/${quote.quoteCurrency} suggestion`
                }
                disabled={disabled || exists}
                onPress={() => edit(quote, true)}
              />
            </View>
          );
        })}
      </View>
      <Sheet
        visible={editor}
        title={oldPair ? "Edit exchange rate" : "Add exchange rate"}
        onClose={() => {
          if (!working) setEditor(false);
        }}
      >
        <CurrencyField
          label="Base currency"
          value={base}
          onChange={setBase}
          disabled={working}
        />
        <CurrencyField
          label="Quote currency"
          value={quoteCurrency}
          onChange={setQuoteCurrency}
          disabled={working}
        />
        <Field
          label={`1 ${base} = how many ${quoteCurrency}?`}
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          editable={!working}
        />
        <Text style={s.body}>
          {base === "USD" || quoteCurrency === "USD"
            ? "USD reference rate"
            : "Custom pair"}{" "}
          · {base} to {quoteCurrency}
        </Text>
        {duplicate && (
          <Text style={s.error} accessibilityRole="alert">
            This pair already has a saved rate. Edit it to replace the quote.
          </Text>
        )}
        {!!error && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button
          title="Save rate"
          disabled={disabled || duplicate}
          onPress={saveRate}
        />
        {oldPair && (
          <Button
            secondary
            title="Remove rate"
            disabled={disabled}
            onPress={() => {
              void persist(
                {
                  ...settings,
                  rates: settings.rates.filter(
                    (saved) =>
                      pairKey(saved.baseCurrency, saved.quoteCurrency) !==
                      oldPair,
                  ),
                },
                () => setEditor(false),
              );
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function rateLabel(quote: Quote) {
  return `1 ${quote.baseCurrency} = ${quote.rate} ${quote.quoteCurrency}`;
}
