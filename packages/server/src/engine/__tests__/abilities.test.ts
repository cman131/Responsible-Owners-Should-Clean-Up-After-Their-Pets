import { describe, it, expect, vi, afterEach } from 'vitest';
import { canApplyStatus } from '../status.js';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

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

describe('onAfterHit — Rough Skin / Iron Barbs', () => {
  it('deals floor(maxHp/8) to contact attacker', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'rough-skin';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Attacker (p1) takes floor(100/8) = 12 from Rough Skin
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(88);
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // index 0 is flamethrower (special, makesContact: false)
    state.teams[1]!.slots[0]!.party[0]!.ability = 'rough-skin';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // P1 HP unchanged (no Rough Skin damage from non-contact move)
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});

describe('onDefenderModifier — Filter / Solid Rock', () => {
  it('reduces super-effective damage by 0.75', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    // P2 is Charizard (Fire/Flying), Surf is 2× — Filter gives ×0.75
    const engineFilter = new BattleEngine({ rng: () => 0.5 });
    state.teams[1]!.slots[0]!.party[0]!.ability = 'filter';
    const { newState: withFilter } = engineFilter.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const engineNo = new BattleEngine({ rng: () => 0.5 });
    state2.teams[1]!.slots[0]!.party[0]!.ability = 'blaze';
    const { newState: noFilter } = engineNo.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — no HP change for P2
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    const dmgFilter = 100 - withFilter.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoFilter = 100 - noFilter.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgFilter).toBe(Math.floor(dmgNoFilter * 0.75));
  });
});

describe('onDefenderModifier — Fur Coat', () => {
  it('halves physical damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'fur-coat';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // P2 uses will-o-wisp targeting P1 — non-healing move so P2 HP stays reduced
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    // Tackle 17 halved = floor(17*0.5) = 8; HP: 100-8=92
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(92);
  });

  it('does not affect special damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Default move[0] is flamethrower (special)
    state.teams[1]!.slots[0]!.party[0]!.ability = 'fur-coat';
    const engineFC = new BattleEngine({ rng: () => 0.5 });
    const { newState: withFC } = engineFC.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const state2 = make1v1State();
    state2.teams[1]!.slots[0]!.party[0]!.ability = 'blaze';
    const engineNo = new BattleEngine({ rng: () => 0.5 });
    const { newState: noFC } = engineNo.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(withFC.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(noFC.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});

describe('onMoveImmunity — Volt Absorb', () => {
  it('blocks Electric move and heals 25% maxHp', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'volt-absorb';
    p2.currentHp = 60;
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // will-o-wisp, not roost
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.currentHp).toBe(85); // 60 + floor(100*0.25)
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });
});

describe('onMoveImmunity — Motor Drive', () => {
  it('blocks Electric move and grants +1 Spe', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'motor-drive';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spe).toBe(1);
  });
});

describe('onMoveImmunity — Sap Sipper', () => {
  it('blocks Grass move and grants +1 Atk', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'energyball', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'sap-sipper';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(1);
  });
});

describe('Flash Fire', () => {
  it('blocks Fire move and sets flash-fire-charged volatile', () => {
    const state = make1v1State();
    // Move at index 0 is flamethrower (Fire)
    state.teams[1]!.slots[0]!.party[0]!.ability = 'flash-fire';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flash-fire-charged')).toBe(true);
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
  });

  it('boosts Fire moves by 1.5× when charged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.ability = 'flash-fire';
    p1.volatileStatus.push({ name: 'flash-fire-charged' });
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: charged } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // will-o-wisp (no self-heal)
    });

    const state2 = make1v1State();
    const { newState: normal } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const dmgCharged = 100 - charged.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNormal = 100 - normal.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgCharged).toBeGreaterThan(dmgNormal);
  });
});

describe('onAfterHit — Static', () => {
  it('applies par on contact when rng fires (rng=0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'static';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → 0 < 0.3 → triggers
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.ability = 'static';
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (non-contact)
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('onAfterHit — Gooey', () => {
  it('lowers attacker Spe by 1 on contact', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'gooey';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(-1);
  });
});

describe('onAfterHit — Mummy', () => {
  it('overwrites attacker ability with mummy on contact', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'mummy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.ability).toBe('mummy');
  });
});

describe('Weather summoners — Drizzle', () => {
  it('sets rain on switch-in', () => {
    const state = make1v1State();
    // Add a bench Pokémon with Drizzle to P1's party
    const benchMon = makePokemon({ instanceId: 'p1-bench', ability: 'drizzle' });
    state.teams[0]!.slots[0]!.party.push(benchMon);

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('rain');
  });

  it('permanent weather is not decremented', () => {
    const state = make1v1State();
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.turnsRemaining).toBe(999);
  });

  it('weather decrements and expires', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 1, fromAbility: true };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather).toBeUndefined();
    expect(events.some(e => e.type === 'weather-ended')).toBe(true);
  });
});

describe('Mold Breaker — ability suppression', () => {
  it('bypasses Levitate', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'mold-breaker';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 1; // Bulbasaur (not Flying), Ground-type immunity only from Levitate
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // Earthquake hits despite Levitate because of Mold Breaker
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBeLessThan(100);
  });

  it('bypasses Multiscale', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'mold-breaker';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'multiscale';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // 17 damage (Multiscale bypassed), not 8
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(83);
  });
});

describe('Weather summoners — primordial weather', () => {
  it('Primordial Sea sets permanent heavy-rain', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'primordial-sea' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('heavy-rain');
    expect(newState.field.weather?.permanent).toBe(true);
  });

  it('Drought cannot overwrite Primordial Sea', () => {
    const state = make1v1State();
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const bench = makePokemon({ instanceId: 'p2-bench', ability: 'drought' });
    state.teams[1]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-bench' } as any,
    });
    expect(newState.field.weather?.type).toBe('heavy-rain');
  });

  it('Drought sets 5-turn sun', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'drought' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('sun');
    expect(newState.field.weather?.turnsRemaining).toBe(4); // set to 5, decremented by 1 at end of turn
  });

  it('permanent weather is not decremented', () => {
    const state = make1v1State();
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.turnsRemaining).toBe(999); // not decremented
  });
});

describe('Serene Grace — doubles secondary chance', () => {
  it('Body Slam 30% par fires at rng=0.5 with Serene Grace (60% chance)', () => {
    // Without Serene Grace: rng()*100=50 >= 30 → no par
    // With Serene Grace: rng()*100=50 < 60 → par applies
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'serene-grace';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('Body Slam 30% par does not fire at rng=0.5 without Serene Grace', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Sheer Force — removes secondaries and boosts power', () => {
  it('no secondary effect fires', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'sheer-force';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → secondary would normally fire
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Own Tempo — confusion immunity', () => {
  it('prevents confusion secondary from landing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // psybeam: Psychic, Special, 10% confusion secondary
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'psybeam', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'own-tempo';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → secondary fires without Own Tempo
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });
});

describe('Inner Focus — flinch immunity', () => {
  it('prevents flinch from landing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // airslash: Flying, Special, 30% flinch secondary
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'airslash', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'inner-focus';
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });
});
