import exponents from "./catalog.json";

export type Currency = keyof typeof exponents;
export const currencies = Object.keys(exponents).sort() as Currency[];
export const LEGACY_CURRENCY: Currency = "AED";
export const MAX_MINOR = 1_000_000_000;

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && Object.hasOwn(exponents, value);
}

export function exponent(currency: Currency) {
  return exponents[currency].minorUnits;
}

export function amountToMinor(
  input: string,
  currency: Currency = LEGACY_CURRENCY,
  allowZero = false,
): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(input.trim());
  const places = exponent(currency);
  if (!match || (match[2]?.length ?? 0) > places) return null;
  const minor =
    Number(match[1]) * 10 ** places +
    Number((match[2] ?? "").padEnd(places, "0"));
  return Number.isSafeInteger(minor) &&
    minor <= MAX_MINOR &&
    (allowZero || minor > 0)
    ? minor
    : null;
}

function formatMinor(
  minor: number | bigint,
  currency: Currency,
  group: boolean,
) {
  const value = BigInt(minor);
  const places = exponent(currency);
  const units = 10n ** BigInt(places);
  const absolute = value < 0n ? -value : value;
  const whole = absolute / units;
  const digits = group ? whole.toLocaleString("en-US") : String(whole);
  const fraction = places
    ? `.${String(absolute % units).padStart(places, "0")}`
    : "";
  return `${value < 0n ? "-" : ""}${digits}${fraction}`;
}

export function amountInput(minor: number, currency: Currency) {
  return formatMinor(minor, currency, false);
}

export function money(
  minor: number | bigint,
  currency: Currency = LEGACY_CURRENCY,
) {
  return `${currency} ${formatMinor(minor, currency, true)}`;
}

export type Quote = {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: string;
  source: "manual" | "suggested";
  asOf: string;
};
export type CurrencySettings = { mainCurrency: Currency; rates: Quote[] };
export const defaultSettings = (): CurrencySettings => ({
  mainCurrency: "USD",
  rates: [],
});

export function currencyName(currency: Currency) {
  return exponents[currency].name;
}

const verifiedAsOf = "2026-11-28T00:00:00.000Z";
export const suggestions: { quote: Quote; sourceName: string }[] = [
  {
    quote: {
      baseCurrency: "USD",
      quoteCurrency: "AED",
      rate: "3.6725",
      source: "suggested",
      asOf: verifiedAsOf,
    },
    sourceName: "Central Bank of the UAE",
  },
  {
    quote: {
      baseCurrency: "USD",
      quoteCurrency: "QAR",
      rate: "3.64",
      source: "suggested",
      asOf: verifiedAsOf,
    },
    sourceName: "Qatar Central Bank",
  },
  {
    quote: {
      baseCurrency: "OMR",
      quoteCurrency: "USD",
      rate: "2.6008",
      source: "suggested",
      asOf: verifiedAsOf,
    },
    sourceName: "Central Bank of Oman",
  },
  {
    quote: {
      baseCurrency: "USD",
      quoteCurrency: "BHD",
      rate: "0.376",
      source: "suggested",
      asOf: verifiedAsOf,
    },
    sourceName: "Central Bank of Bahrain",
  },
];

type Fraction = { numerator: bigint; denominator: bigint };
const zero = { numerator: 0n, denominator: 1n };
const one = { numerator: 1n, denominator: 1n };

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function decimal(value: string): Fraction | null {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,12})?$/.test(value)) return null;
  const [whole, digits = ""] = value.split(".");
  const numerator = BigInt(whole + digits);
  const denominator = 10n ** BigInt(digits.length);
  if (numerator <= 0n || numerator > 1_000_000_000n * denominator) return null;
  return fraction(numerator, denominator);
}

export function pairKey(a: Currency, b: Currency) {
  return a < b ? `${a}/${b}` : `${b}/${a}`;
}

export function validateSettings(value: unknown): CurrencySettings {
  const settings = value as CurrencySettings;
  if (
    !settings ||
    !isCurrency(settings.mainCurrency) ||
    !Array.isArray(settings.rates) ||
    settings.rates.length > 500
  )
    throw new Error("Invalid currency settings.");
  const pairs = new Set<string>();
  for (const quote of settings.rates) {
    if (
      !quote ||
      !isCurrency(quote.baseCurrency) ||
      !isCurrency(quote.quoteCurrency) ||
      quote.baseCurrency === quote.quoteCurrency
    )
      throw new Error("Choose two different currencies.");
    if (typeof quote.rate !== "string" || !decimal(quote.rate))
      throw new Error(
        "Enter a positive rate up to 1,000,000,000 with at most 12 decimal places and no extra leading zeros.",
      );
    if (
      (quote.source !== "manual" &&
        (quote.source !== "suggested" ||
          !suggestions.some(
            ({ quote: suggestion }) =>
              suggestion.baseCurrency === quote.baseCurrency &&
              suggestion.quoteCurrency === quote.quoteCurrency &&
              suggestion.rate === quote.rate,
          ))) ||
      typeof quote.asOf !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?Z$/.test(
        quote.asOf,
      ) ||
      !Number.isFinite(Date.parse(quote.asOf)) ||
      !new Date(quote.asOf)
        .toISOString()
        .startsWith(quote.asOf.split(/[.Z]/)[0])
    )
      throw new Error("Invalid rate source or date.");
    const pair = pairKey(quote.baseCurrency, quote.quoteCurrency);
    if (pairs.has(pair))
      throw new Error(
        "This currency pair already has a rate. Edit the saved rate to replace it.",
      );
    pairs.add(pair);
  }
  return settings;
}

function multiply(a: Fraction, b: Fraction) {
  return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}

function add(a: Fraction, b: Fraction) {
  return fraction(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

function round(value: Fraction): bigint {
  const { numerator, denominator } = value;
  const absolute = numerator < 0n ? -numerator : numerator;
  const minor = (absolute * 2n + denominator) / (denominator * 2n);
  return numerator < 0n ? -minor : minor;
}

/** One exact conversion table per settings snapshot. */
export function createValuation(settings: CurrencySettings) {
  const currency = settings.mainCurrency;
  const rates = new Map<string, Fraction>();
  for (const quote of settings.rates) {
    const rate = decimal(quote.rate);
    if (!rate) continue;
    rates.set(`${quote.baseCurrency}/${quote.quoteCurrency}`, rate);
    rates.set(`${quote.quoteCurrency}/${quote.baseCurrency}`, {
      numerator: rate.denominator,
      denominator: rate.numerator,
    });
  }
  function convert(minor: number | bigint, from: Currency) {
    if (minor === 0 || minor === 0n) return zero;
    let rate = from === currency ? one : rates.get(`${from}/${currency}`);
    if (!rate) {
      const first = rates.get(`${from}/USD`);
      const second = rates.get(`USD/${currency}`);
      if (first && second) rate = multiply(first, second);
    }
    return rate
      ? multiply(rate, {
          numerator: BigInt(minor) * 10n ** BigInt(exponent(currency)),
          denominator: 10n ** BigInt(exponent(from)),
        })
      : null;
  }
  return {
    currency,
    amount(minor: number, from: Currency) {
      const converted = convert(minor, from);
      return converted ? round(converted) : null;
    },
    balances(rows: Iterable<BalanceRow>) {
      let receivable = zero,
        payable = zero;
      const missing = new Set<Currency>();
      let knownReceivable = false,
        knownPayable = false;
      let missingReceivable = false,
        missingPayable = false;
      for (const row of rows) {
        const lent = convert(row.receivableMinor, row.currency);
        const borrowed = convert(row.payableMinor, row.currency);
        if (lent) {
          receivable = add(receivable, lent);
          knownReceivable ||= lent.numerator !== 0n;
        } else missingReceivable = true;
        if (borrowed) {
          payable = add(payable, borrowed);
          knownPayable ||= borrowed.numerator !== 0n;
        } else missingPayable = true;
        if (!lent || !borrowed) missing.add(row.currency);
      }
      return {
        currency,
        receivableMinor: round(receivable),
        payableMinor: round(payable),
        netMinor: round(
          add(receivable, {
            numerator: -payable.numerator,
            denominator: payable.denominator,
          }),
        ),
        missingCurrencies: [...missing].sort(),
        unknown: {
          receivableMinor: !knownReceivable && missingReceivable,
          payableMinor: !knownPayable && missingPayable,
          netMinor: !knownReceivable && !knownPayable && missing.size > 0,
        },
      };
    },
  };
}

export type BalanceRow = {
  currency: Currency;
  receivableMinor: number | bigint;
  payableMinor: number | bigint;
};
