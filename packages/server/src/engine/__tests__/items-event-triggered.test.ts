import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────
// Throat Spray — +1 SpA after using a sound move
// ─────────────────────────────────────────────────────────────────
describe('Throat Spray', () => {
  it('grants +1 SpA and is consumed after holder uses a sound move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'throat-spray';
    p1.moves[0] = { moveId: 'hypervoice', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.statBoosts.spa).toBe(1);
    expect(newP1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'throat-spray')).toBe(true);
    expect(events.some(e => e.type === 'stat-change' && (e.data as any).slotId === 'slot-a1' && (e.data as any).changes?.spa === 1)).toBe(true);
  });

  it('does NOT fire when holder uses a non-sound move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'throat-spray';
    // flamethrower is not a sound move
    p1.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.statBoosts.spa).toBe(0);
    expect(newP1.heldItem).toBe('throat-spray');
  });
});

// ─────────────────────────────────────────────────────────────────
// Blunder Policy — +2 Speed when holder's move misses
// ─────────────────────────────────────────────────────────────────
describe('Blunder Policy', () => {
  it('grants +2 Speed and is consumed when holder move misses', () => {
    // thunder has 70% accuracy; rng=0.8 → 80 >= 70 → miss
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'blunder-policy';
    p1.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.8 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.statBoosts.spe).toBe(2);
    expect(newP1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'blunder-policy')).toBe(true);
    expect(events.some(e => e.type === 'stat-change' && (e.data as any).slotId === 'slot-a1' && (e.data as any).changes?.spe === 2)).toBe(true);
  });

  it('does NOT fire when move hits', () => {
    // thunder has 70% accuracy; rng=0.5 → 50 < 70 → hit
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'blunder-policy';
    p1.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.statBoosts.spe).toBe(0);
    expect(newP1.heldItem).toBe('blunder-policy');
  });
});

// ─────────────────────────────────────────────────────────────────
// Adrenaline Orb — +1 Speed when holder is Intimidated
// ─────────────────────────────────────────────────────────────────
describe('Adrenaline Orb', () => {
  it('grants +1 Speed and is consumed when holder is Intimidated', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'adrenaline-orb';
    state.teams[0]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    // Add bench Pokémon with intimidate to P2's team
    const intimidator = makePokemon({
      instanceId: 'p2-intimidator',
      ability: 'intimidate',
      currentHp: 100, maxHp: 100,
    });
    intimidator.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party.push(intimidator);

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-intimidator' } as SwitchAction,
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    // Intimidate lowers P1's atk by 1
    expect(newP1.statBoosts.atk).toBe(-1);
    // Adrenaline Orb gives +1 Speed and is consumed
    expect(newP1.statBoosts.spe).toBe(1);
    expect(newP1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'adrenaline-orb')).toBe(true);
  });

  it('does NOT fire when no stat drop occurs on switch-in', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'adrenaline-orb';
    state.teams[0]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    // Add bench Pokémon with a non-intimidating ability to P2's team
    const bench = makePokemon({
      instanceId: 'p2-bench',
      ability: 'blaze',
      currentHp: 100, maxHp: 100,
    });
    bench.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party.push(bench);

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-bench' } as SwitchAction,
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.statBoosts.spe).toBe(0);
    expect(newP1.heldItem).toBe('adrenaline-orb');
  });
});

// ─────────────────────────────────────────────────────────────────
// Leppa Berry — restores 10 PP when a move's PP hits 0
// ─────────────────────────────────────────────────────────────────
describe('Leppa Berry', () => {
  it('restores 10 PP to the used move when its PP reaches 0, and is consumed', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'leppa-berry';
    // Set the move's PP to 1 so using it drops it to 0
    p1.moves[0] = { moveId: 'flamethrower', currentPp: 1, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    // PP was 1 → decremented to 0 → Leppa Berry restores 10
    expect(newP1.moves[0]!.currentPp).toBe(10);
    expect(newP1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'leppa-berry')).toBe(true);
  });

  it('does NOT fire when move PP does not reach 0', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'leppa-berry';
    // Move has 5 PP; after use it goes to 4 (not 0)
    p1.moves[0] = { moveId: 'flamethrower', currentPp: 5, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const newP1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(newP1.moves[0]!.currentPp).toBe(4);
    expect(newP1.heldItem).toBe('leppa-berry');
  });
});
