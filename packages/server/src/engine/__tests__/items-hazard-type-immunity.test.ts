import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { IMPLEMENTED_ITEM_IDS } from '../items.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { PokemonType, SwitchAction } from '@poke-fighter/shared';

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────
// Heavy-Duty Boots — prevents all entry hazard damage on switch-in
// ─────────────────────────────────────────────────────────────────
describe('Heavy-Duty Boots', () => {
  it('is registered in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('heavy-duty-boots')).toBe(true);
  });

  it('prevents Stealth Rock damage on switch-in', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', maxHp: 100, currentHp: 100, heldItem: 'heavy-duty-boots' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.stealthRock = true;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(events.some(e => e.type === 'hazard-damage' && (e.data as Record<string, unknown>)['hazard'] === 'stealthRock')).toBe(false);
    expect(newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!.currentHp).toBe(100);
  });

  it('prevents Spikes damage on switch-in', () => {
    const state = make1v1State();
    const bench = makePokemon({
      instanceId: 'p1-bench', speciesId: 9, speciesName: 'blastoise',
      maxHp: 100, currentHp: 100, heldItem: 'heavy-duty-boots',
    });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.spikes = 3;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(events.some(e => e.type === 'hazard-damage' && (e.data as Record<string, unknown>)['hazard'] === 'spikes')).toBe(false);
  });

  it('does not prevent hazard damage for Pokémon without Heavy-Duty Boots', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', maxHp: 100, currentHp: 100 });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.stealthRock = true;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(events.some(e => e.type === 'hazard-damage')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Iron Ball — grounds holder and halves Speed
// ─────────────────────────────────────────────────────────────────
describe('Iron Ball', () => {
  it('is registered in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('iron-ball')).toBe(true);
  });

  it('halves Speed, causing spe=100 holder to be outspeed by spe=80 opponent', () => {
    const state = make1v1State();
    // p1 spe=100 with iron-ball → effective 50, slower than p2 spe=80
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'iron-ball';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const dmgEvents = events.filter(e => e.type === 'damage-dealt');
    // p2 (spe=80) should outspeed iron-ball holder (effective spe=50)
    expect((dmgEvents[0]!.data as Record<string, unknown>)['attackerSlotId']).toBe('slot-b1');
  });

  it('makes a Flying-type holder vulnerable to Spikes on switch-in', () => {
    const state = make1v1State();
    // charizard (Fire/Flying) is normally ungrounded; iron-ball grounds it
    const bench = makePokemon({
      instanceId: 'p1-bench', maxHp: 100, currentHp: 100, heldItem: 'iron-ball',
    });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.spikes = 3;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(events.some(e => e.type === 'hazard-damage' && (e.data as Record<string, unknown>)['hazard'] === 'spikes')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Ring Target — suppresses type immunity on the holder
// ─────────────────────────────────────────────────────────────────
describe('Ring Target', () => {
  it('is registered in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('ring-target')).toBe(true);
  });

  it('Normal-type without Ring Target is immune to Ghost-type moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shadowball', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Normal' as PokemonType];
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('allows Ghost-type moves to deal damage to a Normal-type holder', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shadowball', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Normal' as PokemonType];
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'ring-target';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBeLessThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────
// Float Stone — halves holder's effective weight
// Charizard weighs 90.5 kg → Low Kick power=80; halved to 45.25 kg → power=60
// ─────────────────────────────────────────────────────────────────
describe('Float Stone', () => {
  it('is registered in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('float-stone')).toBe(true);
  });

  it('halves effective weight, reducing Low Kick power against the holder', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateBase = make1v1State();
    stateBase.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'lowkick', currentPp: 20, maxPp: 20 };
    stateBase.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: baseState } = engine.resolveTurn(stateBase, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const dmgBase = 100 - baseState.teams[1]!.slots[0]!.party[0]!.currentHp;

    const stateFS = make1v1State();
    stateFS.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'lowkick', currentPp: 20, maxPp: 20 };
    stateFS.teams[1]!.slots[0]!.party[0]!.heldItem = 'float-stone';
    stateFS.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: fsState } = engine.resolveTurn(stateFS, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const dmgFS = 100 - fsState.teams[1]!.slots[0]!.party[0]!.currentHp;

    expect(dmgFS).toBeLessThan(dmgBase);
  });
});
