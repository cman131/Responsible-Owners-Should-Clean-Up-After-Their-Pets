import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { computeCritStage } from '../accuracy.js';
import { make1v1State } from './fixtures.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Absorb Bulb', () => {
  it('gives +1 SpA when hit by Water move and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'absorb-bulb';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.spa).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });

  it('does not trigger on non-Water move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // default move[0] is flamethrower (Fire type)
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'absorb-bulb';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.spa).toBe(0);
    expect(p2After.heldItem).toBe('absorb-bulb');
  });
});

describe('Cell Battery', () => {
  it('gives +1 Atk when hit by Electric move and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'cell-battery';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });
});

describe('Luminous Moss', () => {
  it('gives +1 SpD when hit by Water move and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'luminous-moss';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.spd).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });
});

describe('Snowball', () => {
  it('gives +1 Atk when hit by Ice move and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'icebeam', currentPp: 10, maxPp: 10 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'snowball';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });
});

describe('Enigma Berry', () => {
  it('heals floor(maxHp/4) on super-effective hit and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const p2With = stateWith.teams[1]!.slots[0]!.party[0]!;
    p2With.heldItem = 'enigma-berry';
    p2With.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withBerry } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    stateWithout.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: noBerry } = engine.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const hpWith = withBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    const hpWithout = noBerry.teams[1]!.slots[0]!.party[0]!.currentHp;

    expect(withBerry.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(hpWith - hpWithout).toBe(25); // floor(100/4) = 25
  });

  it('does not trigger on neutral hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'enigma-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.heldItem).toBe('enigma-berry');
  });
});

describe('Lansat Berry', () => {
  it('sets lansat-active volatile and consumes when HP drops to ≤25%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 26; // ~26-17=9 ≤ 25 → triggers
    p2.heldItem = 'lansat-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.heldItem).toBeUndefined();
    expect(p2After.volatileStatus.some(v => v.name === 'lansat-active')).toBe(true);
  });

  it('does not trigger when HP stays above 25%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // starts at 100 HP, tackle does ~17 → ends at ~83 > 25 → no trigger
    p2.heldItem = 'lansat-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.heldItem).toBe('lansat-berry');
    expect(p2After.volatileStatus.some(v => v.name === 'lansat-active')).toBe(false);
  });
});

describe('computeCritStage with lansat-active', () => {
  it('adds +2 to crit stage for lansat-active volatile', () => {
    expect(computeCritStage(0, [{ name: 'lansat-active' }])).toBe(2);
  });

  it('stacks with other crit stage bonuses', () => {
    expect(computeCritStage(0, [{ name: 'lansat-active' }, { name: 'focusenergy' }])).toBe(4);
  });
});

describe('Starf Berry', () => {
  it('boosts a random combat stat by +2 when HP drops to ≤25% and consumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 26; // ~26-17=9 ≤ 25 → triggers
    p2.heldItem = 'starf-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.heldItem).toBeUndefined();
    const combatStats = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
    const boostedStats = combatStats.filter(s => p2After.statBoosts[s] === 2);
    expect(boostedStats).toHaveLength(1);
  });

  it('does not trigger when HP stays above 25%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // 100 HP, tackle ~17 → 83 HP > 25 → no trigger
    p2.heldItem = 'starf-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.heldItem).toBe('starf-berry');
    const combatStats = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
    expect(combatStats.every(s => p2After.statBoosts[s] === 0)).toBe(true);
  });
});
