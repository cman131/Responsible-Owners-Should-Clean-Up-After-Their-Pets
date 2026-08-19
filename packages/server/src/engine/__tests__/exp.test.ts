import { describe, it, expect } from 'vitest';
import { calcExpYield, distributeExp } from '../exp.js';
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
  });

  it('does not award exp when no living recipients', () => {
    const fainted = [makeMon({ fainted: true })];
    expect(distributeExp({ expYield: 1000, recipients: fainted })).toHaveLength(0);
  });
});
