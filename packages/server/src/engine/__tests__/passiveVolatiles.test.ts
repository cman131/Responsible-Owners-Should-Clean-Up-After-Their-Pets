import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

describe('Focus Energy', () => {
  it('registration: using focusenergy applies volatile', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'focusenergy', currentPp: 30, maxPp: 30 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'focusenergy')).toBe(true);
  });
});

describe('Aqua Ring', () => {
  it('heals 1/16 max HP at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 160;
    p2.currentHp = 100; p2.maxHp = 100;
    p1.volatileStatus.push({ name: 'aqua-ring' });
    // Use protect-like move that won't damage
    p1.moves[2] = { moveId: 'protect', currentPp: 10, maxPp: 10 };
    p2.moves[2] = { moveId: 'protect', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(60); // 50 + floor(160/16) = 50 + 10
  });
});

describe('Ingrain', () => {
  it('heals 1/16 max HP at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 160;
    p2.currentHp = 100; p2.maxHp = 100;
    p1.volatileStatus.push({ name: 'ingrain' });
    // Use protect-like move that won't damage
    p1.moves[2] = { moveId: 'protect', currentPp: 10, maxPp: 10 };
    p2.moves[2] = { moveId: 'protect', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(60);
  });
});
