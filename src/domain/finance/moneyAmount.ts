/**
 * Product-level money ceiling.
 *
 * The game stores whole Hong Kong dollars locally. 99,999,999,999 keeps the
 * full "tens of billions" magnitude available while remaining far below
 * JavaScript's maximum safe integer.
 */
export const MAX_MONEY_AMOUNT = 99_999_999_999;

export const isMoneyAmount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_MONEY_AMOUNT;

export const isMoneyDelta = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= MAX_MONEY_AMOUNT;

/**
 * Read-path compatibility only. Existing malformed/legacy values are made
 * loadable; live writeback must use the strict validators above.
 */
export const normalizeLegacyMoneyAmount = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(MAX_MONEY_AMOUNT, Math.trunc(parsed)));
};

export interface MoneyArithmeticResult {
  applied: boolean;
  value: number;
  reason?: 'invalid_current' | 'invalid_delta' | 'exceeds_limit';
}

/**
 * Applies a whole-dollar delta without silently truncating an overflow.
 * Existing finance behavior for overdrafts is retained: a valid negative
 * result settles at zero.
 */
export const addMoneyAmount = (current: number, delta: number): MoneyArithmeticResult => {
  if (!isMoneyAmount(current)) {
    return { applied: false, value: current, reason: 'invalid_current' };
  }
  if (!isMoneyDelta(delta)) {
    return { applied: false, value: current, reason: 'invalid_delta' };
  }

  const result = current + delta;
  if (!Number.isSafeInteger(result) || result > MAX_MONEY_AMOUNT) {
    return { applied: false, value: current, reason: 'exceeds_limit' };
  }

  return { applied: true, value: Math.max(0, result) };
};
