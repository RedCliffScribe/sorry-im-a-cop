import { describe, expect, it } from 'vitest';
import {
  MAX_MONEY_AMOUNT,
  addMoneyAmount,
  isMoneyAmount,
  isMoneyDelta,
  normalizeLegacyMoneyAmount
} from './moneyAmount';

describe('money amount contract', () => {
  it('accepts whole-dollar balances through the full tens-of-billions range', () => {
    expect(isMoneyAmount(998_005_800)).toBe(true);
    expect(isMoneyAmount(50_000_000_000)).toBe(true);
    expect(isMoneyAmount(MAX_MONEY_AMOUNT)).toBe(true);
    expect(isMoneyAmount(MAX_MONEY_AMOUNT + 1)).toBe(false);
    expect(isMoneyAmount(1.5)).toBe(false);
  });

  it('accepts signed deltas through the same product ceiling', () => {
    expect(isMoneyDelta(50_000_000_000)).toBe(true);
    expect(isMoneyDelta(-50_000_000_000)).toBe(true);
    expect(isMoneyDelta(MAX_MONEY_AMOUNT + 1)).toBe(false);
  });

  it('applies valid arithmetic exactly without silently truncating an overflow', () => {
    expect(addMoneyAmount(50_000_000_000, 25_000_000_000)).toEqual({
      applied: true,
      value: 75_000_000_000
    });
    expect(addMoneyAmount(90_000_000_000, 20_000_000_000)).toEqual({
      applied: false,
      value: 90_000_000_000,
      reason: 'exceeds_limit'
    });
    expect(addMoneyAmount(5_000, -8_000)).toEqual({
      applied: true,
      value: 0
    });
  });

  it('uses bounded normalization only when loading legacy values', () => {
    expect(normalizeLegacyMoneyAmount('50000000000')).toBe(50_000_000_000);
    expect(normalizeLegacyMoneyAmount(MAX_MONEY_AMOUNT + 1)).toBe(MAX_MONEY_AMOUNT);
  });
});
