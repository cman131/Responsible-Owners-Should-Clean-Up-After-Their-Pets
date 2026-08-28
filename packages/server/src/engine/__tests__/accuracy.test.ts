import { describe, it, expect } from 'vitest';
import {
  accuracyStageMultiplier,
  evasionStageMultiplier,
  computeHitChance,
} from '../accuracy.js';

describe('accuracyStageMultiplier', () => {
  it('returns 1 at stage 0', () => {
    expect(accuracyStageMultiplier(0)).toBe(1);
  });

  it('returns 1/3 at stage -6', () => {
    expect(accuracyStageMultiplier(-6)).toBeCloseTo(1 / 3, 5);
  });

  it('returns 3 at stage +6', () => {
    expect(accuracyStageMultiplier(6)).toBe(3);
  });

  it('clamps below -6', () => {
    expect(accuracyStageMultiplier(-10)).toBeCloseTo(1 / 3, 5);
  });

  it('clamps above +6', () => {
    expect(accuracyStageMultiplier(10)).toBe(3);
  });
});

describe('evasionStageMultiplier', () => {
  it('mirrors accuracyStageMultiplier at stage 0', () => {
    expect(evasionStageMultiplier(0)).toBe(1);
  });

  it('mirrors accuracyStageMultiplier at stage -3', () => {
    expect(evasionStageMultiplier(-3)).toBe(accuracyStageMultiplier(-3));
  });
});

describe('computeHitChance', () => {
  it('returns always for accuracy true', () => {
    expect(computeHitChance(true, 0, 0)).toBe('always');
  });

  it('returns base accuracy at neutral stages', () => {
    expect(computeHitChance(70, 0, 0)).toBe(70);
  });

  it('reduces hit chance when attacker accuracy is -1', () => {
    // 70 * (3/4) / 1 = 52.5 → floor → 52
    expect(computeHitChance(70, -1, 0)).toBe(52);
  });

  it('increases hit chance when attacker accuracy is +1', () => {
    // 70 * (4/3) / 1 = 93.33 → floor → 93
    expect(computeHitChance(70, 1, 0)).toBe(93);
  });

  it('reduces hit chance when defender evasion is +1', () => {
    // 70 * 1 / (4/3) = 52.5 → floor → 52
    expect(computeHitChance(70, 0, 1)).toBe(52);
  });

  it('clamps to minimum 1', () => {
    // Low accuracy + max negative attacker stage
    expect(computeHitChance(30, -6, 0)).toBeGreaterThanOrEqual(1);
    expect(computeHitChance(30, -6, 0)).toBeLessThanOrEqual(100);
  });

  it('clamps to maximum 100', () => {
    expect(computeHitChance(100, 6, 0)).toBe(100);
  });
});
