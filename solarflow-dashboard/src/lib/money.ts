// ─────────────────────────────────────────────────────────────────────────────
// Money display switch
// ─────────────────────────────────────────────────────────────────────────────
// Financials are handled in Xero, OUTSIDE this platform, for now. Daniel owns all
// financial operations there. This module hides every dollar amount in the UI
// while leaving the underlying data (totals, rates, costs) intact in the data
// model and sync layer. To re-enable in-app money displays later, flip
// SHOW_MONEY back to true, nothing else needs to change.

export const SHOW_MONEY = false;

/** Rendered wherever a dollar amount used to appear while money is hidden. */
export const MONEY_HIDDEN = '-';

interface MoneyOpts {
  /** Decimal places when money is shown (default 2). */
  decimals?: number;
  /** String returned when value is null/undefined and money is shown. */
  blank?: string;
}

/**
 * Format a monetary value for display. While SHOW_MONEY is false (the default),
 * always returns the neutral placeholder so no figures leak into the UI. When
 * re-enabled, returns a `$`-prefixed, grouped currency string.
 *
 * Use this anywhere the UI previously rendered `$${n.toFixed(2)}`,
 * `formatCurrency(n)`, or similar.
 */
export function formatMoney(value: number | null | undefined, opts: MoneyOpts = {}): string {
  if (!SHOW_MONEY) return MONEY_HIDDEN;
  if (value == null || Number.isNaN(Number(value))) return opts.blank ?? MONEY_HIDDEN;
  const decimals = opts.decimals ?? 2;
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Compact money for dense stat cards (e.g. $1.2M, $3.4k). Hidden -> placeholder.
 */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (!SHOW_MONEY) return MONEY_HIDDEN;
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
