import { describe, it, expect } from 'vitest';
import { calcExpYield, distributeExp, checkLevelUps, expForLevel } from '../exp.js';
import type { PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 6, level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze', moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

describe('calcExpYield', () => {
  it('matches Fire Red formula: floor((baseExpYield * level) / 7)', () => {
    // Charizard base exp yield = 240, level 50
    expect(calcExpYield({ baseExpYield: 240, level: 50 })).toBe(Math.floor((240 * 50) / 7)); // 1714
  });

  it('Pikachu (base exp 112) at level 30', () => {
    expect(calcExpYield({ baseExpYield: 112, level: 30 })).toBe(Math.floor((112 * 30) / 7)); // 480
  });

  it('minimum yield is 1', () => {
    expect(calcExpYield({ baseExpYield: 1, level: 1 })).toBeGreaterThanOrEqual(1);
  });
});

describe('distributeExp', () => {
  it('awards exp to all living party members across all winning slots', () => {
    const recipients = [
      makeMon({ instanceId: 'a1', fainted: false }),
      makeMon({ instanceId: 'a2', fainted: false }),
      makeMon({ instanceId: 'a3', fainted: true }),
    ];

    const awards = distributeExp({ expYield: 1714, recipients });

    expect(awards).toHaveLength(2);
    expect(awards.find((a) => a.instanceId === 'a1')?.amount).toBe(1714);
    expect(awards.find((a) => a.instanceId === 'a2')?.amount).toBe(1714);
    expect(awards.find((a) => a.instanceId === 'a3')).toBeUndefined();
    expect(awards.find((a) => a.instanceId === 'a1')?.newTotal).toBe(1714); // expTotal was 0
    expect(awards.find((a) => a.instanceId === 'a2')?.newTotal).toBe(1714);
  });

  it('does not award exp when no living recipients', () => {
    const fainted = [makeMon({ fainted: true })];
    expect(distributeExp({ expYield: 1000, recipients: fainted })).toHaveLength(0);
  });
});

describe('expForLevel', () => {
  it('MediumFast: level^3', () => {
    expect(expForLevel('MediumFast', 50)).toBe(125000); // 50^3
  });
  it('Fast: floor(4 * level^3 / 5)', () => {
    expect(expForLevel('Fast', 50)).toBe(Math.floor(4 * 125000 / 5)); // 100000
  });
  it('Slow: floor(5 * level^3 / 4)', () => {
    expect(expForLevel('Slow', 50)).toBe(Math.floor(5 * 125000 / 4)); // 156250
  });
  it('clamps level to 100', () => {
    expect(expForLevel('MediumFast', 101)).toBe(expForLevel('MediumFast', 100));
  });
});

describe('checkLevelUps', () => {
  it('returns null when exp total does not reach next level', () => {
    const mon = makeMon({ level: 5, expTotal: 0 });
    expect(checkLevelUps(mon, 100, 'MediumFast')).toBeNull(); // need 216 for level 6
  });

  it('returns newLevel when exp total reaches next level', () => {
    const mon = makeMon({ level: 5, expTotal: 0 });
    const result = checkLevelUps(mon, expForLevel('MediumFast', 6), 'MediumFast');
    expect(result?.newLevel).toBe(6);
    expect(result?.instanceId).toBe(mon.instanceId);
  });

  it('handles multi-level jump correctly', () => {
    const mon = makeMon({ level: 5, expTotal: 0 });
    // expForLevel('MediumFast', 10) = 1000
    const result = checkLevelUps(mon, 1000, 'MediumFast');
    expect(result?.newLevel).toBe(10);
  });

  it('caps at level 100', () => {
    const mon = makeMon({ level: 99, expTotal: 0 });
    const result = checkLevelUps(mon, expForLevel('MediumFast', 100) + 999999, 'MediumFast');
    expect(result?.newLevel).toBe(100);
  });
});
