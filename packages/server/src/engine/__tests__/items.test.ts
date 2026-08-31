import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Focus Sash', () => {
  it('survives OHKO at 1 HP when at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 999; // high atk → guaranteed OHKO
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 100; p2.maxHp = 100; p2.stats.def = 1; // def=1 → guaranteed OHKO
    p2.heldItem = 'focus-sash';
    p2.speciesId = 1; // bulbasaur: Grass/Poison, not immune to Ground by type
    p2.ability = 'overgrow'; // clear any Ground-immunity ability
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // replace roost to avoid self-heal
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(1);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'focus-sash')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed')).toBe(true);
  });

  it('does not trigger when not at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 999; // high atk → guaranteed OHKO
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 99; p2.maxHp = 100; p2.stats.def = 1; // not at full HP
    p2.heldItem = 'focus-sash';
    p2.speciesId = 1; // bulbasaur: Grass/Poison, not immune to Ground by type
    p2.ability = 'overgrow'; // clear any Ground-immunity ability
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // replace roost to avoid self-heal
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.fainted).toBe(true);
  });
});

describe('Air Balloon', () => {
  it('grants immunity to Ground moves', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'air-balloon';
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 1; // bulbasaur: not Ground-immune by type
    state.teams[1]!.slots[0]!.party[0]!.ability = 'overgrow'; // no levitate
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});
