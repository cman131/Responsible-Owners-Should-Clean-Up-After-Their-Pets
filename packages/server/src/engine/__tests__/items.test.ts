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
