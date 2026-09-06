import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

describe('Swagger', () => {
  it('raises target Atk by 2 and inflicts confusion', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swagger', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.atk).toBe(2);
    expect(p2.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
  });

  it('fails when Safeguard is active on the target side', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.sideConditions[1]!.safeguard = 5;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swagger', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'safeguard')).toBe(true);
  });
});

describe('Flatter', () => {
  it('raises target SpA by 1 and inflicts confusion', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flatter', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.spa).toBe(1);
    expect(p2.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
  });
});

describe('Toxic Thread', () => {
  it('inflicts poison and drops target Speed by 1', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'toxicthread', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.status).toBe('psn');
    expect(p2.statBoosts.spe).toBe(-1);
  });
});

describe('Memento', () => {
  it('user faints and target loses -2 Atk / -2 SpA', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'memento', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.fainted).toBe(true);
    expect(p2.statBoosts.atk).toBe(-2);
    expect(p2.statBoosts.spa).toBe(-2);
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });

  it('fails if target Atk and SpA are already at -6', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.atk = -6;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.spa = -6;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'memento', currentPp: 10, maxPp: 10 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.fainted).toBe(false);
  });
});

describe('Revival Blessing', () => {
  it('restores a fainted party member to half HP', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const faintedMon = makePokemon({ instanceId: 'fainted-mon', fainted: true, currentHp: 0, maxHp: 100 });
    state.teams[0]!.slots[0]!.party.push(faintedMon);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'revivalblessing', currentPp: 1, maxPp: 1 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const revived = newState.teams[0]!.slots[0]!.party[1]!;
    expect(revived.fainted).toBe(false);
    expect(revived.currentHp).toBe(50);
  });

  it('fails if no fainted ally exists', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'revivalblessing', currentPp: 1, maxPp: 1 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'no-fainted-ally')).toBe(true);
  });
});

describe('Stuff Cheeks', () => {
  it('consumes a held berry and raises Def by 2', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'sitrus-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'stuffcheeks', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.heldItem).toBeUndefined();
    expect(p1.statBoosts.def).toBe(2);
    expect(events.some(e => e.type === 'item-consumed')).toBe(true);
  });

  it('fails if user holds no berry', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'life-orb';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'stuffcheeks', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'no-berry')).toBe(true);
  });
});

describe('Corrosive Gas', () => {
  it('destroys target held item', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'leftovers';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'corrosivegas', currentPp: 40, maxPp: 40 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).reason === 'corrosive-gas')).toBe(true);
  });
});

describe('Chilly Reception', () => {
  it('sets snow weather', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'chillyreception', currentPp: 10, maxPp: 10 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.weather?.type).toBe('snow');
    expect(events.some(e => e.type === 'weather-started')).toBe(true);
  });
});
