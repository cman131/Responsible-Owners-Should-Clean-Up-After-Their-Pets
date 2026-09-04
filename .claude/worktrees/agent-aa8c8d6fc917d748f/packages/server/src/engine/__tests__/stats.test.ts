import { describe, it, expect } from 'vitest';
import { calcStat, calcHp, calcAllStats, NATURES } from '../stats.js';

describe('calcHp', () => {
  it('calculates Blissey HP at L100 with 255 base, 252 EVs, 31 IVs', () => {
    // formula: floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10
    // (2*255 + 31 + 63) = 604, floor(604) + 100 + 10 = 714
    const hp = calcHp({ baseStat: 255, iv: 31, ev: 252, level: 100 });
    expect(hp).toBe(714);
  });

  it('calculates Shedinja HP (always 1)', () => {
    // Shedinja base HP = 1
    const hp = calcHp({ baseStat: 1, iv: 31, ev: 252, level: 100 });
    expect(hp).toBe(1); // special case: HP = 1 if base = 1
  });
});

describe('calcStat', () => {
  it('calculates Charizard Sp.Atk at L50, Timid nature, 252 EVs, 31 IVs', () => {
    // base spa = 109, timid = neutral on spa
    // (2*109 + 31 + 63) = 312, floor(312*50/100) + 5 = 156 + 5 = 161
    const spa = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.0 });
    expect(spa).toBe(161);
  });

  it('applies Modest nature (+spa) correctly', () => {
    const base = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.0 });
    const modest = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.1 });
    expect(modest).toBe(Math.floor(base * 1.1));
  });
});

describe('NATURES', () => {
  it('Timid boosts spe, lowers atk', () => {
    expect(NATURES['timid']).toEqual({ boost: 'spe', drop: 'atk' });
  });

  it('Hardy is neutral', () => {
    expect(NATURES['hardy']).toEqual({ boost: null, drop: null });
  });
});
