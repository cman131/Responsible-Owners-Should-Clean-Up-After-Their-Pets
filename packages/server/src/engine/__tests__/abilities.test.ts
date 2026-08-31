import { describe, it, expect, vi, afterEach } from 'vitest';
import { canApplyStatus } from '../status.js';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('onStatusImmunity — canApplyStatus routing', () => {
  it('Limber blocks par', () => {
    expect(canApplyStatus({ status: 'par', types: [], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
  it('Limber allows brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'limber' })).toBe(true);
  });
  it('Immunity blocks psn', () => {
    expect(canApplyStatus({ status: 'psn', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Immunity blocks tox', () => {
    expect(canApplyStatus({ status: 'tox', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Magma Armor blocks frz', () => {
    expect(canApplyStatus({ status: 'frz', types: [], currentStatus: undefined, ability: 'magma-armor' })).toBe(false);
  });
  it('Water Veil blocks brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'water-veil' })).toBe(false);
  });
  it('Insomnia blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'insomnia' })).toBe(false);
  });
  it('Vital Spirit blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'vital-spirit' })).toBe(false);
  });
  it('Sweet Veil blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'sweet-veil' })).toBe(false);
  });
  it('Comatose blocks all status', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
  });
  it('Leaf Guard blocks status in sun', () => {
    const battle = { field: { weather: { type: 'sun', turnsRemaining: 3, fromAbility: true } } } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(false);
  });
  it('Leaf Guard allows status outside sun', () => {
    const battle = { field: {} } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(true);
  });
  it('old hardcoded limber entry is gone (no regression)', () => {
    // After refactor, limber still blocks par — routed through hook
    expect(canApplyStatus({ status: 'par', types: ['Electric'], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
});

describe('onMoveImmunity — Levitate', () => {
  it('blocks Ground move and emits ability-triggered', () => {
    const state = make1v1State();
    // P1 uses Earthquake; P2 is Bulbasaur (Grass/Poison) so Ground isn't already 0x by type
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 1; // bulbasaur: Grass/Poison, not immune to Ground by type
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('does not block non-Ground move', () => {
    const state = make1v1State();
    // P2 is Bulbasaur (Grass/Poison) with Levitate; P1 uses Flamethrower (Fire), not Ground
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 1; // bulbasaur: takes Fire damage normally
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBeLessThan(100);
  });
});
