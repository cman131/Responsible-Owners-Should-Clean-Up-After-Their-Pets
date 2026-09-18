import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { IMPLEMENTED_ITEM_IDS } from '../items.js';
import { make1v1State } from './fixtures.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('IMPLEMENTED_ITEM_IDS', () => {
  it('contains expected hyphenated item keys', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('leftovers')).toBe(true);
    expect(IMPLEMENTED_ITEM_IDS.has('choice-band')).toBe(true);
    expect(IMPLEMENTED_ITEM_IDS.has('focus-sash')).toBe(true);
    expect(IMPLEMENTED_ITEM_IDS.has('sitrus-berry')).toBe(true);
  });

  it('does not contain camelCase ids (those belong to items.json, not ITEM_HOOKS)', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('focussash')).toBe(false);
    expect(IMPLEMENTED_ITEM_IDS.has('choiceband')).toBe(false);
    expect(IMPLEMENTED_ITEM_IDS.has('sitrusberry')).toBe(false);
  });
});

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

describe('Assault Vest', () => {
  it('reduces special damage by 1/3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Use surf (special Water move) against Charizard (Fire/Flying) — 2x effective
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'assault-vest';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: withAV } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    state2.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: noAV } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const dmgAV = 100 - withAV.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoAV = 100 - noAV.teams[1]!.slots[0]!.party[0]!.currentHp;
    // AV reduces special damage by factor of 2/3
    expect(dmgAV).toBeLessThan(dmgNoAV);
    expect(dmgAV).toBe(Math.floor(dmgNoAV * 2/3));
  });
});

describe('Scope Lens — crit stage +1', () => {
  it('crits with rng=0.1 (stage 1 = 1/8 chance, 0.1 < 0.125)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'scope-lens';
    const engine = new BattleEngine({ rng: () => 0.1 });
    const { events: withSL } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(withSL.some(e => e.type === 'crit')).toBe(true);
  });

  it('does not crit without Scope Lens at rng=0.1 (stage 0 = 1/24 chance, 0.1 > 0.042)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const engine = new BattleEngine({ rng: () => 0.1 });
    const { events: noSL } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(noSL.some(e => e.type === 'crit')).toBe(false);
  });
});

describe('Eviolite', () => {
  it('reduces physical damage on eligible species (isEvioliteEligible=true)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'eviolite';
    p2.isEvioliteEligible = true;
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // Tackle 17 damage, Eviolite reduces by 2/3: floor(17*2/3) = 11 → HP = 89
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(89);
  });

  it('does not reduce damage on ineligible species', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'eviolite';
    p2.isEvioliteEligible = false;
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(83); // 17 damage, no reduction
  });
});

describe('Light Clay — screen extension', () => {
  it('sets Reflect to 8 turns instead of 5', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[2] = { moveId: 'reflect', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'light-clay';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.field.sideConditions[0]!.reflect).toBe(7);
  });
});

describe('Big Root — drain boost', () => {
  it('heals more than baseline from drain move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Giga Drain: Grass Special BP75, drains 50% of damage dealt
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'gigadrain', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50; // room to heal
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without Big Root
    const { newState: noBR } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const healNoBR = noBR.teams[0]!.slots[0]!.party[0]!.currentHp - 50;

    // With Big Root
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'gigadrain', currentPp: 10, maxPp: 10 };
    state2.teams[0]!.slots[0]!.party[0]!.currentHp = 50;
    state2.teams[0]!.slots[0]!.party[0]!.heldItem = 'big-root';
    const { newState: withBR } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const healWithBR = withBR.teams[0]!.slots[0]!.party[0]!.currentHp - 50;

    expect(healWithBR).toBeGreaterThan(healNoBR);
    expect(healWithBR).toBe(Math.floor(healNoBR * 2));
  });
});

describe('Shell Bell', () => {
  it('heals attacker floor(damage/8) after dealing damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; // not at full HP so there is room to heal
    p1.heldItem = 'shell-bell';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Tackle deals 17 damage. Shell Bell heals floor(17/8) = 2 HP.
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(52);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });

  it('does not heal beyond maxHp', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    // p1 already at full HP — shell bell heal (2) is capped to 0 headroom
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'shell-bell';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});

describe('Wide Lens', () => {
  it('boosts accuracy ×1.1 — willowisp (85%) hits at rng=0.88 when holder has Wide Lens', () => {
    // rng=0.88: 88 >= 85 → miss without Wide Lens; floor(85*1.1)=93, 88 < 93 → hit with Wide Lens
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'wide-lens';
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // Bulbasaur (Grass/Poison) — not immune to burn
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('without Wide Lens — willowisp misses at rng=0.88', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1;
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Zoom Lens', () => {
  it('boosts accuracy when holder moves second — willowisp hits at rng=0.88', () => {
    // p2 (spe=80) moves after p1 (spe=100) → isFirst=false → Zoom Lens activates
    // floor(85*1.2)=102 → capped to 100 → always hits at rng=0.88
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.speciesId = 1; // Bulbasaur — not immune to burn
    p1.ability = 'overgrow';
    // p2 uses willowisp (move index 3), holds Zoom Lens
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'zoom-lens';
    // p1 uses roost (move index 2) — no accuracy roll involved for its action
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },              // roost — self-target, no accuracy roll
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // willowisp
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('does not boost accuracy when holder moves first', () => {
    // p1 (spe=100) moves before p2 (spe=80) → isFirst=true → Zoom Lens does not activate
    // 85% accuracy, rng=0.88: 88 >= 85 → miss
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // not immune to burn
    p2.ability = 'overgrow';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'zoom-lens';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Bright Powder', () => {
  it('reduces attacker accuracy ×0.9 — willowisp (85%) misses at rng=0.78 when defender holds it', () => {
    // floor(85*0.9)=76, rng=0.78: 78 >= 76 → MISS; without Bright Powder: 78 < 85 → hit
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // not immune to burn
    p2.ability = 'overgrow';
    p2.heldItem = 'bright-powder';
    const engine = new BattleEngine({ rng: () => 0.78 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('without Bright Powder — willowisp hits at rng=0.78', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1;
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.78 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('brn');
  });
});

describe('Charcoal', () => {
  it('boosts Fire move by ×1.2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'charcoal';
    p1.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 }; // Fire move
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    // damage with charcoal should be more than without
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 };
    const engine2 = new BattleEngine({ rng: () => 0.5 });
    const { newState: newState2 } = engine2.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const hpWithCharcoal = newState.teams[1]!.slots[0]!.party[0]!.currentHp;
    const hpWithout = newState2.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(hpWithCharcoal).toBeLessThan(hpWithout);
  });

  it('does not boost Water moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'charcoal';
    p1.moves[0] = { moveId: 'watergun', currentPp: 25, maxPp: 25 }; // Water move
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'watergun', currentPp: 25, maxPp: 25 };
    const engine2 = new BattleEngine({ rng: () => 0.5 });
    const { newState: newState2 } = engine2.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(newState2.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});

describe('Expert Belt', () => {
  it('+20% on super-effective hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Ember (Fire) vs Grass type → ×2 effective
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'expert-belt';
    p1.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // Bulbasaur: Grass/Poison
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ember', currentPp: 25, maxPp: 25 };
    state2.teams[1]!.slots[0]!.party[0]!.speciesId = 1;
    const engine2 = new BattleEngine({ rng: () => 0.5 });
    const { newState: newState2 } = engine2.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const hpWithBelt = newState.teams[1]!.slots[0]!.party[0]!.currentHp;
    const hpWithout = newState2.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(hpWithBelt).toBeLessThan(hpWithout);
  });

  it('no boost on neutral hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'expert-belt';
    // tackle (Normal) vs default pokemon → neutral
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const state2 = make1v1State();
    const engine2 = new BattleEngine({ rng: () => 0.5 });
    const { newState: newState2 } = engine2.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(newState2.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});

describe('Protective Pads', () => {
  it('suppresses Rocky Helmet recoil on contact move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'protective-pads';
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('suppresses Rough Skin damage on contact move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'protective-pads';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'rough-skin';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('protective-pads')).toBe(true);
  });
});

describe('Punching Glove', () => {
  it('suppresses Rocky Helmet recoil on punch moves', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'firepunch', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'punching-glove';
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('does NOT suppress Rocky Helmet on non-punch contact move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'punching-glove';
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // bodyslam is contact but not a punch → Rocky Helmet still fires: floor(100/6) = 16
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(84);
  });

  it('gives 1.1x damage boost on punch moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'firepunch', currentPp: 15, maxPp: 15 };
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'punching-glove';
    // Use move index 3 (willowisp) so p2 doesn't heal with roost
    const engineWith = new BattleEngine({ rng: () => 0.5 });
    const { newState: withGlove } = engineWith.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'firepunch', currentPp: 15, maxPp: 15 };
    const engineWithout = new BattleEngine({ rng: () => 0.5 });
    const { newState: withoutGlove } = engineWithout.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const hpWithGlove = withGlove.teams[1]!.slots[0]!.party[0]!.currentHp;
    const hpWithoutGlove = withoutGlove.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(hpWithGlove).toBeLessThan(hpWithoutGlove);
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('punching-glove')).toBe(true);
  });
});

describe('Loaded Dice', () => {
  it('forces max hits (5) on a 2–5 hit move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rockblast', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'loaded-dice';
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1000; p2.maxHp = 1000; // prevent faint during multi-hit sequence
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost — no damage to p1
    });
    const hits = events.filter(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect(hits.length).toBe(5);
  });

  it('does not affect fixed-count multi-hit moves (hits: 2)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dualwingbeat', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'loaded-dice';
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1000; p2.maxHp = 1000;
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const hits = events.filter(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect(hits.length).toBe(2);
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('loaded-dice')).toBe(true);
  });
});

describe('Clear Amulet', () => {
  it('prevents incoming stat drops from opponent moves', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'charm', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'clear-amulet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0);
  });

  it('stat drops apply normally without Clear Amulet', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'charm', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-2);
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('clear-amulet')).toBe(true);
  });
});

describe('Covert Cloak', () => {
  it('prevents secondary flinch from airslash', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'covert-cloak';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });

  it('flinch applies normally without Covert Cloak', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });

  it('prevents secondary burn from scald', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'scald', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'covert-cloak';
    p2.speciesId = 1;
    p2.ability = 'overgrow';
    p2.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('covert-cloak')).toBe(true);
  });
});

describe('Mirror Herb', () => {
  it('copies opponent stat boosts when foe uses swords dance and consumes itself', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mirror-herb';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.atk).toBe(2);
    expect(p1.statBoosts.atk).toBe(2);
    expect(p1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'mirror-herb')).toBe(true);
  });

  it('does not trigger when foe uses a non-boosting move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mirror-herb';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('mirror-herb');
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0);
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('mirror-herb')).toBe(true);
  });
});

describe('Metronome item', () => {
  it('applies no power modifier on first use (no prior lastMoveId)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'metronome';
    // lastMoveId intentionally not set — this is the first use ever
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost — no damage to p1
    });
    const attacker = newState.teams[0]!.slots[0]!.party[0]!;
    expect(attacker.volatileStatus.find(v => v.name === 'metronome-count')).toBeUndefined();
    const dmgEvent = events.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect((dmgEvent!.data as any).damage).toBe(28); // no multiplier applied
  });

  it('adds metronome-count volatile (accumulated: 1) and boosts damage on 2nd consecutive use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'metronome';
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower'; // used flamethrower last turn
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower again
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const attacker = newState.teams[0]!.slots[0]!.party[0]!;
    const v = attacker.volatileStatus.find(v => v.name === 'metronome-count');
    expect(v).toBeDefined();
    expect(v?.accumulated).toBe(1);
    const dmgEvent = events.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect((dmgEvent!.data as any).damage).toBe(33); // floor(28 * 1.2) = 33
  });

  it('resets metronome-count volatile when switching to a different move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'metronome';
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'airslash'; // different move used last turn
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'metronome-count', accumulated: 3 });
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (differs from lastMoveId)
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const attacker = newState.teams[0]!.slots[0]!.party[0]!;
    expect(attacker.volatileStatus.find(v => v.name === 'metronome-count')).toBeUndefined();
  });

  it('caps modifier at ×2.0 regardless of streak length', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'metronome';
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'metronome-count', accumulated: 99 });
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const dmgEvent = events.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect((dmgEvent!.data as any).damage).toBe(56); // floor(28 * 2.0) = 56
  });

  it('appears in IMPLEMENTED_ITEM_IDS', () => {
    expect(IMPLEMENTED_ITEM_IDS.has('metronome')).toBe(true);
  });
});
