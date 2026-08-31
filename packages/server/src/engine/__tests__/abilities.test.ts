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

describe('onDefenderModifier — Multiscale', () => {
  it('halves damage at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Use tackle (physical Normal move, BP 40) so Charizard's Fire/Flying typing doesn't affect it
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'multiscale';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    // Tackle BP40 neutral = 17; halved by Multiscale = 8; target HP: 100 - 8 = 92
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(92);
  });

  it('does not reduce damage when HP is below max', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'multiscale';
    p2.currentHp = 99; // not at full HP
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    // 17 damage (no halving): 99 - 17 = 82
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(82);
  });
});

describe('onDefenderModifier — Thick Fat', () => {
  it('reduces Fire damage by half on defender', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Default move at index 0 is flamethrower (Fire special)
    // P2 (Charizard, Fire/Flying) with Thick Fat should take half fire damage
    const engineWithTF = new BattleEngine({ rng: () => 0.5 });
    state.teams[1]!.slots[0]!.party[0]!.ability = 'thick-fat';
    const { newState: withTF } = engineWithTF.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const state2 = make1v1State();
    const engineNoTF = new BattleEngine({ rng: () => 0.5 });
    state2.teams[1]!.slots[0]!.party[0]!.ability = 'blaze'; // no modifier
    const { newState: noTF } = engineNoTF.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const dmgWithTF = 100 - withTF.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoTF = 100 - noTF.teams[1]!.slots[0]!.party[0]!.currentHp;
    // With Thick Fat, damage is halved
    expect(dmgWithTF).toBe(Math.floor(dmgNoTF * 0.5));
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
