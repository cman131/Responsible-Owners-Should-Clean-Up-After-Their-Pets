import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────
// Utility Umbrella
// ─────────────────────────────────────────────────────────────────
describe('Utility Umbrella — offensive weather suppression', () => {
  // watergun (Water, BP=40) vs Charizard (Fire/Flying, 2× SE) with rng=0.5:
  //   base=19, random=floor(19*0.93)=17, SE 2×: 34, rain 1.5×: 51 → HP 49
  //   without rain boost: 34 → HP 66
  // P2 uses splash so no healing interferes.

  function makeRainState() {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'watergun', currentPp: 25, maxPp: 25 };
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    return state;
  }

  it('Water move in rain deals boosted damage without Utility Umbrella', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeRainState();
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(49);
  });

  it('attacker holding Utility Umbrella does not get Water boost in rain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeRainState();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'utility-umbrella';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // No rain boost: damage=34, HP=66
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(66);
  });

  it('defender holding Utility Umbrella negates incoming Water boost in rain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeRainState();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'utility-umbrella';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Defender's umbrella suppresses rain boost: damage=34, HP=66
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(66);
  });

  it('attacker holding Utility Umbrella does not get Fire boost in sun', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // ember (Fire, BP=40) from pikachu (Electric, no Fire STAB) vs Charizard (Fire/Flying)
    // Fire vs Fire = 0.5x, Fire vs Flying = 1x → effective = 0.5x
    // base=19, random=17, SE 0.5×: 8, sun 1.5×: 12 → HP 88
    // without sun boost: 8 → HP 92
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 };
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'pikachu';
    state.teams[0]!.slots[0]!.party[0]!.speciesId = 25;
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'utility-umbrella';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: withUmbrellaState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateNoUmbrella = make1v1State();
    stateNoUmbrella.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    stateNoUmbrella.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 };
    stateNoUmbrella.teams[0]!.slots[0]!.party[0]!.speciesName = 'pikachu';
    stateNoUmbrella.teams[0]!.slots[0]!.party[0]!.speciesId = 25;
    stateNoUmbrella.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: noUmbrellaState } = engine.resolveTurn(stateNoUmbrella, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(withUmbrellaState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(92);
    expect(noUmbrellaState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(88);
  });
});

describe('Utility Umbrella — weather chip immunity', () => {
  it('holder is immune to sandstorm chip damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    // Charizard is Fire/Flying — not immune to sand by type
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'utility-umbrella';
    p2.ability = 'blaze'; // no sand immunity
    const engine = new BattleEngine({ rng: () => 0.5 });
    // Use splash (no damage) so the only HP change is from weather chip
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // P2 has umbrella: should not take sand chip
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('non-holder still takes sandstorm chip', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // P1 (no umbrella, Fire/Flying): should take sand chip floor(100/16)=6
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(94);
  });

  it('holder is immune to snow chip damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 5, fromAbility: false };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'utility-umbrella';
    p2.ability = 'blaze';
    // Charizard is Fire/Flying — not Ice type → normally takes snow chip
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────
// Room Service
// ─────────────────────────────────────────────────────────────────
describe('Room Service', () => {
  it('is consumed when Trick Room is active', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.field.trickroom = 3;
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'room-service';
    // Use splash so there's no confusion about damage order
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'room-service')).toBe(true);
  });

  it('halves speed in Trick Room, changing move order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // P1 spe=80, P2 spe=120 + room-service. In Trick Room, slower moves first.
    // After RS halves P2 speed: P2 spe=60 < P1 spe=80 → P2 is slower → P2 moves first in TR.
    // Both use tackle. P2 moves first → P2 hits P1 → first damage on slot-a1.
    const state = make1v1State();
    state.field.trickroom = 3;
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.stats.spe = 80;
    p2.stats.spe = 120;
    p2.heldItem = 'room-service';
    p1.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    p2.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt');
    // P2 moves first → first damage event has attackerSlotId='slot-b1'
    expect(damageEvents[0]!.data['attackerSlotId']).toBe('slot-b1');
  });

  it('does not activate or consume when Trick Room is not active', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // No Trick Room
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'room-service';
    p2.stats.spe = 60;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // Item should NOT be consumed
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('room-service');
  });
});

// ─────────────────────────────────────────────────────────────────
// Booster Energy
// ─────────────────────────────────────────────────────────────────
describe('Booster Energy', () => {
  function makeStateWithBench(benchAbility: string) {
    const state = make1v1State();
    const bench = makePokemon({
      instanceId: 'p1-bench',
      ability: benchAbility,
      heldItem: 'booster-energy',
      stats: { hp: 100, atk: 80, def: 70, spa: 90, spd: 85, spe: 110 },
      currentHp: 100,
      maxHp: 100,
    });
    state.teams[0]!.slots[0]!.party.push(bench);
    return state;
  }

  it('is consumed on switch-in when ability is quark-drive and no terrain/weather', () => {
    const state = makeStateWithBench('quark-drive');
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'booster-energy')).toBe(true);
  });

  it('is consumed on switch-in when ability is protosynthesis and no sun/weather', () => {
    const state = makeStateWithBench('protosynthesis');
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'booster-energy')).toBe(true);
  });

  it('sets booster-energy-active volatile on activation', () => {
    const state = makeStateWithBench('quark-drive');
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.volatileStatus.some(v => v.name === 'booster-energy-active')).toBe(true);
  });

  it('is NOT consumed when electric terrain is active (quark-drive activates without item)', () => {
    const state = makeStateWithBench('quark-drive');
    state.field.terrain = { type: 'electric', turnsRemaining: 5 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.heldItem).toBe('booster-energy');
  });

  it('is NOT consumed when harsh sun is active (protosynthesis activates without item)', () => {
    const state = makeStateWithBench('protosynthesis');
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.heldItem).toBe('booster-energy');
  });

  it('does not activate for unrelated abilities', () => {
    const state = makeStateWithBench('blaze');
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const newActive = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(newActive.heldItem).toBe('booster-energy');
    expect(newActive.volatileStatus.some(v => v.name === 'booster-energy-active')).toBe(false);
  });
});

describe('Quark Drive — speed boost when booster-energy-active', () => {
  it('boosts speed when booster-energy-active volatile is set', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // P1: quark-drive + booster-energy-active volatile, spe=100
    // P2: spe=140 (faster without boost)
    // After boost P1 speed = floor(100 * 1.5) = 150 → P1 moves first
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.ability = 'quark-drive';
    p1.stats.spe = 100;
    p1.volatileStatus = [{ name: 'booster-energy-active', variant: 'spe' }];
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.stats.spe = 140;
    p1.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    p2.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt');
    // P1 moves first → first damage event has attackerSlotId='slot-a1'
    expect(damageEvents[0]!.data['attackerSlotId']).toBe('slot-a1');
  });
});

describe('Protosynthesis — speed boost when booster-energy-active', () => {
  it('boosts speed when booster-energy-active volatile is set', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.ability = 'protosynthesis';
    p1.stats.spe = 100;
    p1.volatileStatus = [{ name: 'booster-energy-active', variant: 'spe' }];
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.stats.spe = 140;
    p1.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    p2.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt');
    expect(damageEvents[0]!.data['attackerSlotId']).toBe('slot-a1');
  });
});
