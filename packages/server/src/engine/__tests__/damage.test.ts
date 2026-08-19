import { describe, it, expect } from 'vitest';
import { calcDamage, type DamageInput } from '../damage.js';

describe('calcDamage', () => {
  it('Flamethrower (90 BP, Fire, special) from Charizard-spa167 vs Blissey-spd136 at neutral', () => {
    // Calculated damage with Gen 9 formula
    const input: DamageInput = {
      level: 50,
      attackStat: 167,
      defenseStat: 136,
      basePower: 90,
      typeEffectiveness: 1,
      stab: true,
      isBurned: false,
      randomFactor: 1.0, // max roll
    };
    const { damage } = calcDamage(input);
    // With max roll and STAB: expect 75
    expect(damage).toBe(75);
  });

  it('applies super effective multiplier (2x)', () => {
    const base: DamageInput = { level: 50, attackStat: 100, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    const superEff: DamageInput = { ...base, typeEffectiveness: 2 };
    expect(calcDamage(superEff).damage).toBe(calcDamage(base).damage * 2);
  });

  it('burn halves physical attack', () => {
    const normal: DamageInput = { level: 50, attackStat: 200, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    const burned: DamageInput = { ...normal, isBurned: true };
    expect(calcDamage(burned).damage).toBe(Math.floor(calcDamage(normal).damage / 2));
  });

  it('returns isCrit false when not critical', () => {
    const input: DamageInput = { level: 50, attackStat: 100, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    expect(calcDamage(input).isCrit).toBe(false);
  });
});
