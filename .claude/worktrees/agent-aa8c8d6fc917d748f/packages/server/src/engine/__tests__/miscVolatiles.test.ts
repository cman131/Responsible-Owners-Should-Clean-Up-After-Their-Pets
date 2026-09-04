import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

describe('Foresight', () => {
  it('applies foresight volatile to target', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'foresight', currentPp: 40, maxPp: 40 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'foresight')).toBe(true);
  });
});

describe('Miracle Eye', () => {
  it('applies miracle-eye volatile to target', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'miracleeye', currentPp: 40, maxPp: 40 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'miracle-eye')).toBe(true);
  });
});

describe('Destiny Bond', () => {
  it('applies destiny-bond volatile to user', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'destinybond', currentPp: 5, maxPp: 5 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'destiny-bond')).toBe(true);
  });

  it('faints the attacker if destiny-bond user faints from their attack', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1;
    p2.volatileStatus.push({ name: 'destiny-bond' });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'faint' && (e.data as any).slotId === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'faint' && (e.data as any).slotId === 'slot-a1')).toBe(true);
  });
});

describe('Embargo', () => {
  it('applies embargo with 5 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'embargo', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'embargo')?.turnsRemaining).toBe(5);
  });

  it('expires after 5 turns emitting volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'embargo', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'embargo')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'embargo')).toBe(true);
  });
});

describe('Heal Block', () => {
  it('applies heal-block with 5 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'healblock', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'heal-block')?.turnsRemaining).toBe(5);
  });

  it('prevents Recover from healing when heal-block active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 100;
    p1.volatileStatus.push({ name: 'heal-block', turnsRemaining: 3 });
    p1.moves[0] = { moveId: 'recover', currentPp: 10, maxPp: 10 };
    p2.moves[0] = { moveId: 'protect', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'heal-blocked')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(50);
  });
});

describe('Roost', () => {
  it('heals 50% max HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.currentHp = 40; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };
    p2.moves[0] = { moveId: 'protect', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(90);
  });

  it('roost volatile removed at EoT', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'roost')).toBe(false);
  });
});
