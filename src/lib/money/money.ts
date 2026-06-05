/**
 * Money value object (ADR 0005).
 *
 * Every amount in the system is minor units (øre/cents) + an ISO 4217
 * currency. No floats, no implicit currencies. All price arithmetic and
 * formatting goes through this module — components never touch raw cents.
 */

export const CURRENCIES = ["NOK", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  readonly amountCents: number;
  readonly currency: Currency;
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot operate on different currencies: ${a} vs ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/** Create a Money from minor units. Amount must be a safe integer. */
export function money(amountCents: number, currency: Currency = "NOK"): Money {
  if (!Number.isSafeInteger(amountCents)) {
    throw new InvalidAmountError(
      `Amount must be an integer number of minor units, got: ${amountCents}`,
    );
  }
  if (!CURRENCIES.includes(currency)) {
    throw new InvalidAmountError(`Unsupported currency: ${currency}`);
  }
  return Object.freeze({ amountCents, currency });
}

/** Create a Money from a whole-units value (e.g. "500 kr" -> 50000 øre). */
export function fromMajorUnits(amount: number, currency: Currency = "NOK"): Money {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || Math.abs(amount * 100 - cents) > 1e-6) {
    throw new InvalidAmountError(
      `Amount has more precision than minor units allow: ${amount}`,
    );
  }
  return money(cents, currency);
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountCents + b.amountCents, a.currency);
}

/** Multiply by an integer quantity (cart lines). */
export function multiply(m: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new InvalidAmountError(`Quantity must be a non-negative integer, got: ${quantity}`);
  }
  return money(m.amountCents * quantity, m.currency);
}

/** Sum a list of Money. The currency argument seeds the empty case. */
export function sum(items: readonly Money[], currency: Currency = "NOK"): Money {
  return items.reduce((acc, item) => add(acc, item), money(0, currency));
}

export function equals(a: Money, b: Money): boolean {
  return a.amountCents === b.amountCents && a.currency === b.currency;
}

const LOCALE_MAP: Record<string, string> = {
  no: "nb-NO",
  en: "en-GB",
};

/**
 * Format for display in the given app locale ("no" | "en").
 * Whole amounts drop decimals ("1 300 kr"), fractional ones keep two.
 */
export function formatMoney(m: Money, appLocale: "no" | "en"): string {
  const hasFraction = m.amountCents % 100 !== 0;
  return new Intl.NumberFormat(LOCALE_MAP[appLocale] ?? appLocale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(m.amountCents / 100);
}
