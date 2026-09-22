import { describe, it, expect } from 'vitest';
import { applyTransform } from '../transform.js';
import { makePokemon } from './fixtures.js';

describe('applyTransform', () => {
  it('copies target stats (except hp), ability, stat boosts, type, and moves at 5 pp', () => {
    const user = makePokemon({ instanceId: 'user' });
    const userOriginalHp = user.stats.hp;
    const target = makePokemon({
      instanceId: 'target',
      ability: 'intimidate',
      stats: { hp: 200, atk: 120, def: 90, spa: 110, spd: 95, spe: 80 },
      statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 1, accuracy: 0, evasion: 0 },
      moves: [
        { moveId: 'surf', currentPp: 10, maxPp: 15 },
        { moveId: 'dragonrush', currentPp: 15, maxPp: 15 },
        { moveId: 'ice-beam', currentPp: 5, maxPp: 10 },
        { moveId: 'splash', currentPp: 40, maxPp: 40 },
      ],
    });

    const events = applyTransform(user, 'slot-a1', target, ['Water']);

    expect(user.ability).toBe('intimidate');
    expect(user.stats).toEqual({ hp: userOriginalHp, atk: 120, def: 90, spa: 110, spd: 95, spe: 80 });
    expect(user.statBoosts).toEqual(target.statBoosts);
    expect(user.typeOverride).toEqual(['Water']);
    expect(user.moves).toEqual([
      { moveId: 'surf', currentPp: 5, maxPp: 5 },
      { moveId: 'dragonrush', currentPp: 5, maxPp: 5 },
      { moveId: 'ice-beam', currentPp: 5, maxPp: 5 },
      { moveId: 'splash', currentPp: 5, maxPp: 5 },
    ]);
    expect(user.volatileStatus.some(v => v.name === 'transformed')).toBe(true);
    expect(events).toEqual([
      { type: 'volatile-applied', data: { targetSlotId: 'slot-a1', volatile: 'transformed' } },
    ]);
  });

  it('snapshots the original form only once across repeated transforms', () => {
    const user = makePokemon({ instanceId: 'user', ability: 'blaze' });
    const originalStats = { ...user.stats };
    const originalMoves = user.moves.map(m => ({ ...m }));

    const targetA = makePokemon({
      instanceId: 'target-a', ability: 'intimidate',
      stats: { hp: 50, atk: 111, def: 50, spa: 50, spd: 50, spe: 50 },
    });
    const targetB = makePokemon({
      instanceId: 'target-b', ability: 'levitate',
      stats: { hp: 50, atk: 222, def: 50, spa: 50, spd: 50, spe: 50 },
    });

    applyTransform(user, 'slot-a1', targetA, []);
    applyTransform(user, 'slot-a1', targetB, []);

    expect(user.ability).toBe('levitate'); // latest transform wins
    expect(user.originalForm).toBeDefined();
    expect(user.originalForm!.ability).toBe('blaze'); // true original, not targetA
    expect(user.originalForm!.stats).toEqual(originalStats);
    expect(user.originalForm!.moves).toEqual(originalMoves);
  });

  it('deletes typeOverride when no target types are passed', () => {
    const user = makePokemon({ instanceId: 'user', typeOverride: ['Fire'] });
    const target = makePokemon({ instanceId: 'target' });

    applyTransform(user, 'slot-a1', target, []);

    expect(user.typeOverride).toBeUndefined();
  });
});
