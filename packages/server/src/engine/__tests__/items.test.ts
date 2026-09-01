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

describe('Rocky Helmet', () => {
  it('deals floor(maxHp/6) to contact attacker', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // p1 takes floor(100/6) = 16 from Rocky Helmet
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(84);
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Index 0 default is flamethrower (non-contact)
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});

describe('Air Balloon pop', () => {
  it('balloon pops when hit by non-Ground move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'air-balloon';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'air-balloon')).toBe(true);
  });
});

describe('Weakness Policy', () => {
  it('+2 Atk and SpA on super-effective hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    // P2 is Charizard (Fire/Flying), weak to Water 2×.
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'weakness-policy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(2);
    expect(p2After.statBoosts.spa).toBe(2);
    expect(p2After.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'weakness-policy')).toBe(true);
  });

  it('does not trigger on neutral hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'weakness-policy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0);
  });
});

describe('Sitrus Berry', () => {
  it('heals floor(maxHp/4) when HP drops to ≤50%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 51; // after 17 dmg → 34 ≤ 50 → triggers
    p2.heldItem = 'sitrus-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // avoid roost self-heal
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // 51 - 17 = 34, then +25 (floor(100/4)) = 59
    expect(p2After.currentHp).toBe(59);
    expect(p2After.heldItem).toBeUndefined();
  });

  it('does not trigger when HP stays above 50%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'sitrus-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // avoid roost self-heal
    // p2 at 100 HP, takes 17 → 83 > 50 → no trigger
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.currentHp).toBe(83);
    expect(p2After.heldItem).toBe('sitrus-berry');
  });
});

describe('Lum Berry', () => {
  it('cures status immediately on application', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'lum-berry';
    p2.speciesId = 1; // bulbasaur: Grass/Poison — not immune to burn
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.status).toBeUndefined();
    expect(p2After.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'lum-berry')).toBe(true);
  });
});

describe('Salac Berry', () => {
  it('+1 Spe when HP drops to ≤25%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 26; // 26-17=9 ≤ 25 → triggers
    p2.heldItem = 'salac-berry';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // avoid roost self-heal
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.spe).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });
});
