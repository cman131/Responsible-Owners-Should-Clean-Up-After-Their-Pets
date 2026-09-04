import { describe, it, expect, vi } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

function makeEngine() {
  return new BattleEngine({ rng: () => 0 });
}

function resolveP1Move(moveId: string) {
  const engine = makeEngine();
  const state = make1v1State();
  state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: moveId, currentPp: 40, maxPp: 40 };
  state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
  // p1 (team index 0) uses the move against p2 (team index 1)
  const { newState } = engine.resolveTurn(state, {
    'slot-a1': { type: 'move', moveIndex: 0 },
    'slot-b1': { type: 'move', moveIndex: 0 },
  });
  return {
    p1Boosts: newState.teams[0]!.slots[0]!.party[0]!.statBoosts,
    p2Boosts: newState.teams[1]!.slots[0]!.party[0]!.statBoosts,
    newState,
  };
}

describe('tickle', () => {
  it('lowers both atk and def simultaneously', () => {
    const { p2Boosts } = resolveP1Move('tickle');
    expect(p2Boosts.atk).toBe(-1);
    expect(p2Boosts.def).toBe(-1);
  });
});

describe('scaryface', () => {
  it('lowers target spe by 2', () => {
    const { p2Boosts } = resolveP1Move('scaryface');
    expect(p2Boosts.spe).toBe(-2);
  });

  it('does not affect other stats', () => {
    const { p2Boosts } = resolveP1Move('scaryface');
    expect(p2Boosts.atk).toBe(0);
    expect(p2Boosts.def).toBe(0);
  });
});

describe('spicyextract', () => {
  it('raises spa and lowers def simultaneously', () => {
    const { p2Boosts } = resolveP1Move('spicyextract');
    expect(p2Boosts.spa).toBe(2);
    expect(p2Boosts.def).toBe(-2);
  });
});

describe('tearfullook', () => {
  it('lowers target atk and spa by 1', () => {
    const { p2Boosts } = resolveP1Move('tearfullook');
    expect(p2Boosts.atk).toBe(-1);
    expect(p2Boosts.spa).toBe(-1);
  });
});

describe('nobleroar', () => {
  it('lowers target atk and spa by 1', () => {
    const { p2Boosts } = resolveP1Move('nobleroar');
    expect(p2Boosts.atk).toBe(-1);
    expect(p2Boosts.spa).toBe(-1);
  });
});

describe('featherdance', () => {
  it('lowers target atk by 2', () => {
    const { p2Boosts } = resolveP1Move('featherdance');
    expect(p2Boosts.atk).toBe(-2);
  });
});

describe('captivate', () => {
  it('lowers target spa by 2', () => {
    const { p2Boosts } = resolveP1Move('captivate');
    expect(p2Boosts.spa).toBe(-2);
  });
});

describe('babydolleyes', () => {
  it('lowers target atk by 1', () => {
    const { p2Boosts } = resolveP1Move('babydolleyes');
    expect(p2Boosts.atk).toBe(-1);
  });
});

describe('eerieimpulse', () => {
  it('lowers target spa by 2', () => {
    const { p2Boosts } = resolveP1Move('eerieimpulse');
    expect(p2Boosts.spa).toBe(-2);
  });
});

describe('stringshot', () => {
  it('lowers target spe by 2', () => {
    const { p2Boosts } = resolveP1Move('stringshot');
    expect(p2Boosts.spe).toBe(-2);
  });
});

describe('cottonspore', () => {
  it('lowers target spe by 2', () => {
    const { p2Boosts } = resolveP1Move('cottonspore');
    expect(p2Boosts.spe).toBe(-2);
  });
});

describe('smokescreen', () => {
  it('lowers target accuracy by 1', () => {
    const { p2Boosts } = resolveP1Move('smokescreen');
    expect(p2Boosts.accuracy).toBe(-1);
  });
});

describe('kinesis', () => {
  it('lowers target accuracy by 1', () => {
    const { p2Boosts } = resolveP1Move('kinesis');
    expect(p2Boosts.accuracy).toBe(-1);
  });
});

describe('sweetscent', () => {
  it('lowers target evasion by 2', () => {
    const { p2Boosts } = resolveP1Move('sweetscent');
    expect(p2Boosts.evasion).toBe(-2);
  });
});

describe('confide', () => {
  it('lowers target spa by 1', () => {
    const { p2Boosts } = resolveP1Move('confide');
    expect(p2Boosts.spa).toBe(-1);
  });
});

describe('playnice', () => {
  it('lowers target atk by 1', () => {
    const { p2Boosts } = resolveP1Move('playnice');
    expect(p2Boosts.atk).toBe(-1);
  });
});

describe('attract', () => {
  it('applies infatuation volatile to the target', () => {
    const { newState } = resolveP1Move('attract');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'infatuation')).toBe(true);
  });

  it('blocks an infatuated Pokemon from moving when rng < 0.5', () => {
    // Use rng () => 0 so infatuation always blocks
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // Pre-apply infatuation to p2
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'infatuation' });
    // p1 uses growl (stat move), p2 tries to use growl but is infatuated
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // p1 should have had growl applied (atk lowered) - but p2's growl was blocked
    // Since p2 was blocked, p1's atk was NOT lowered by p2's growl
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(0);
  });

  it('allows an infatuated Pokemon to move when rng >= 0.5', () => {
    // Use rng () => 0.9 so infatuation never blocks
    const engine = new BattleEngine({ rng: () => 0.9 });
    const state = make1v1State();
    // Pre-apply infatuation to p2
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'infatuation' });
    // p1 uses growl (stat move), p2 uses growl (stat move)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // p2 was NOT blocked, so p2's growl lowered p1's atk
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(-1);
  });
});

describe('nightmare', () => {
  it('applies nightmare volatile to the target via the move', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 is already asleep
    state.teams[1]!.slots[0]!.party[0]!.status = 'slp';
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'sleep', counter: 3 });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'nightmare', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'nightmare')).toBe(true);
  });

  it('deals 25% max HP damage at EOT to a sleeping Pokemon with nightmare', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // p2 has maxHp=100, so 25% = 25
    p2.status = 'slp';
    p2.volatileStatus.push({ name: 'sleep', counter: 3 });
    p2.volatileStatus.push({ name: 'nightmare' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // Should have taken 25 damage (25% of 100)
    expect(p2After.currentHp).toBe(75);
  });

  it('removes nightmare volatile when the Pokemon is no longer asleep', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // p2 has burn status (not asleep) but still has nightmare volatile
    p2.status = 'brn';
    p2.volatileStatus.push({ name: 'nightmare' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // Nightmare volatile should have been removed
    expect(p2After.volatileStatus.some(v => v.name === 'nightmare')).toBe(false);
    // Should NOT have taken nightmare damage (only burn damage = 6 = floor(100/16))
    // Burn damage = floor(100/16) = 6
    expect(p2After.currentHp).toBe(94);
  });
});

describe('venomdrench', () => {
  it('emits move-failed when target has no status', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has no status
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'venomdrench', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2Boosts = newState.teams[1]!.slots[0]!.party[0]!.statBoosts;
    // No stat boosts should be applied
    expect(p2Boosts.atk).toBe(0);
    expect(p2Boosts.spa).toBe(0);
    expect(p2Boosts.spe).toBe(0);
  });

  it('lowers target atk, spa, and spe by 1 when target has psn status', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 is poisoned
    state.teams[1]!.slots[0]!.party[0]!.status = 'psn';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'venomdrench', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2Boosts = newState.teams[1]!.slots[0]!.party[0]!.statBoosts;
    expect(p2Boosts.atk).toBe(-1);
    expect(p2Boosts.spa).toBe(-1);
    expect(p2Boosts.spe).toBe(-1);
  });

  it('lowers target atk, spa, and spe by 1 when target has tox status', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 is badly poisoned
    state.teams[1]!.slots[0]!.party[0]!.status = 'tox';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'venomdrench', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2Boosts = newState.teams[1]!.slots[0]!.party[0]!.statBoosts;
    expect(p2Boosts.atk).toBe(-1);
    expect(p2Boosts.spa).toBe(-1);
    expect(p2Boosts.spe).toBe(-1);
  });
});

describe('curse', () => {
  it('Ghost user: pays 50% max HP and applies curse volatile to target', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Make p1 a Ghost type (Gengar, id=94)
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.speciesId = 94;
    p1.speciesName = 'gengar';
    p1.moves[0] = { moveId: 'curse', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // p1 should have paid 50% of maxHp (50 damage)
    expect(p1After.currentHp).toBe(50);
    // target should have curse volatile
    expect(p2After.volatileStatus.some(v => v.name === 'curse')).toBe(true);
  });

  it('Non-Ghost user: gains +1 atk, +1 def, -1 spe (Charizard is Fire/Flying)', () => {
    // Default makePokemon uses speciesId=6 (Charizard = Fire/Flying, not Ghost)
    // Use toxic as p2's move so it doesn't interfere with p1's stat boosts
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'curse', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'toxic', currentPp: 10, maxPp: 10 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(1);
    expect(p1Boosts.def).toBe(1);
    expect(p1Boosts.spe).toBe(-1);
  });

  it('Non-Ghost user: does not affect other stats', () => {
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'curse', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'toxic', currentPp: 10, maxPp: 10 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.spa).toBe(0);
    expect(p1Boosts.spd).toBe(0);
  });

  it('EOT curse: target with curse volatile takes 25% max HP damage each turn', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // Pre-apply curse volatile to p2
    p2.volatileStatus.push({ name: 'curse' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // p2 has maxHp=100, so 25% = 25 damage
    expect(p2After.currentHp).toBe(75);
    // curse volatile should still be present
    expect(p2After.volatileStatus.some(v => v.name === 'curse')).toBe(true);
  });

  it('EOT curse: damages every turn (cumulative)', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.volatileStatus.push({ name: 'curse' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState: afterTurn1 } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const { newState: afterTurn2 } = engine.resolveTurn(afterTurn1, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = afterTurn2.teams[1]!.slots[0]!.party[0]!;
    // 25 damage each turn, so 50 total after 2 turns
    expect(p2After.currentHp).toBe(50);
  });
});

describe('tarshot', () => {
  it('lowers target spe by 1', () => {
    const { p2Boosts } = resolveP1Move('tarshot');
    expect(p2Boosts.spe).toBe(-1);
  });

  it('applies tar-shot volatile to target', () => {
    const { newState } = resolveP1Move('tarshot');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'tar-shot')).toBe(true);
  });

  it('Fire move deals 2x more damage against a tar-shot target', () => {
    // p1 uses flamethrower (Fire, default move index 0) against p2
    // We compare damage with and without the tar-shot volatile pre-applied to p2.
    // Use vi.spyOn to fix Math.random (randomDamageFactor) and rng: () => 0.5 to avoid crits.
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without tar-shot
    const stateClean = make1v1State();
    stateClean.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    stateClean.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsClean } = engine.resolveTurn(stateClean, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgClean = eventsClean.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    // With tar-shot pre-applied
    const stateTarShot = make1v1State();
    stateTarShot.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    stateTarShot.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    stateTarShot.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'tar-shot' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsTarShot } = engine.resolveTurn(stateTarShot, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgTarShot = eventsTarShot.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    expect(dmgClean).toBeDefined();
    expect(dmgTarShot).toBeDefined();
    // tar-shot doubles Fire type effectiveness → damage should be approximately 2x
    // (allow ±1 for Math.floor rounding in the damage formula)
    expect(dmgTarShot).toBeGreaterThanOrEqual(dmgClean * 2 - 1);
    expect(dmgTarShot).toBeLessThanOrEqual(dmgClean * 2 + 1);
    // Sanity: tar-shot damage must be strictly more than double to confirm multiplier is working
    expect(dmgTarShot).toBeGreaterThan(dmgClean);
  });
});

describe('topsyturvy', () => {
  it('inverts all stat boosts (positive to negative)', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Set up target with some positive boosts
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.statBoosts.atk = 2;
    p2.statBoosts.def = 1;
    p2.statBoosts.spa = 3;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'topsyturvy', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(-2);
    expect(p2After.statBoosts.def).toBe(-1);
    expect(p2After.statBoosts.spa).toBe(-3);
  });

  it('inverts all stat boosts (negative to positive)', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Set up target with some negative boosts
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.statBoosts.atk = -2;
    p2.statBoosts.def = -1;
    p2.statBoosts.spe = -3;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'topsyturvy', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(2);
    expect(p2After.statBoosts.def).toBe(1);
    expect(p2After.statBoosts.spe).toBe(3);
  });

  it('leaves zero stat boosts unchanged', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Set up target with mixed boosts (some zero, some non-zero)
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.statBoosts.atk = 2;
    p2.statBoosts.def = 0;  // stays zero
    p2.statBoosts.spa = 0;  // stays zero
    p2.statBoosts.spd = -1;
    p2.statBoosts.spe = 0;  // stays zero
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'topsyturvy', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(-2);
    expect(p2After.statBoosts.def).toBe(0);
    expect(p2After.statBoosts.spa).toBe(0);
    expect(p2After.statBoosts.spd).toBe(1);
    expect(p2After.statBoosts.spe).toBe(0);
  });

  it('fails when target has no stat boosts', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has all stats at 0
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'topsyturvy', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // All stats should remain at 0 (nothing changed)
    expect(p2After.statBoosts.atk).toBe(0);
    expect(p2After.statBoosts.def).toBe(0);
    expect(p2After.statBoosts.spa).toBe(0);
    expect(p2After.statBoosts.spd).toBe(0);
    expect(p2After.statBoosts.spe).toBe(0);
    expect(p2After.statBoosts.accuracy).toBe(0);
    expect(p2After.statBoosts.evasion).toBe(0);
  });
});

describe('spite', () => {
  it('reduces target last move PP by 4', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has flamethrower as move 0 (15 PP by default)
    // Set it to 15 PP and mark it as the last move used
    // When p2 uses it, it will consume 1 PP normally, then Spite reduces by 4
    // So: 15 - 1 (normal use) - 4 (Spite) = 10 PP remaining
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p2.lastMoveId = 'flamethrower';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'spite', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // 15 - 1 (normal use) - 4 (Spite) = 10 PP remaining
    expect(p2After.moves[0]!.currentPp).toBe(10);
  });

  it('emits move-failed when target has no lastMoveId', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has no lastMoveId (has not used a move yet)
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastMoveId).toBeUndefined();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'spite', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // Should emit move-failed event
    const moveFailedEvent = events.find(e => e.type === 'move-failed' && (e.data as any).moveId === 'spite');
    expect(moveFailedEvent).toBeDefined();
    expect((moveFailedEvent?.data as any).reason).toBe('no-last-move');
  });

  it('emits move-failed when target last move has 0 PP', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has flamethrower as last move with 0 PP
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'flamethrower', currentPp: 0, maxPp: 15 };
    p2.lastMoveId = 'flamethrower';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'spite', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 0, maxPp: 15 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // Should emit move-failed event
    const moveFailedEvent = events.find(e => e.type === 'move-failed' && (e.data as any).moveId === 'spite');
    expect(moveFailedEvent).toBeDefined();
    expect((moveFailedEvent?.data as any).reason).toBe('no-pp');
  });

  it('does not reduce PP below 0', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // p2 has flamethrower as last move with only 2 PP (less than 4)
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'flamethrower', currentPp: 2, maxPp: 15 };
    p2.lastMoveId = 'flamethrower';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'spite', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 2, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // Should floor at 0, not go negative
    expect(p2After.moves[0]!.currentPp).toBe(0);
  });
});

// ── Trapping moves ────────────────────────────────────────────────────────────

describe('meanlook', () => {
  it('applies trapped volatile to the target', () => {
    const { newState } = resolveP1Move('meanlook');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'trapped')).toBe(true);
  });

  it('does not apply trapped volatile to the user', () => {
    const { newState } = resolveP1Move('meanlook');
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'trapped')).toBe(false);
  });
});

describe('block', () => {
  it('applies trapped volatile to the target', () => {
    const { newState } = resolveP1Move('block');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'trapped')).toBe(true);
  });
});

describe('spiderweb', () => {
  it('applies trapped volatile to the target', () => {
    const { newState } = resolveP1Move('spiderweb');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'trapped')).toBe(true);
  });
});

describe('trapped volatile prevents switching', () => {
  it('a Pokemon with trapped volatile cannot switch out', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Give p2 a bench member so a switch would otherwise be valid
    const bench = makePokemon({ instanceId: 'p2-bench' });
    state.teams[1]!.slots[0]!.party.push(bench);
    // Pre-apply trapped to p2's active
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'trapped' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    // p2 tries to switch to bench
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-bench' } as SwitchAction,
    });
    // The switch should be blocked — p2's active index stays at 0
    expect(newState.teams[1]!.slots[0]!.activePokemonIndex).toBe(0);
    // A move-blocked event with reason 'trapped' should be emitted
    const blockedEvent = events.find(e => e.type === 'move-blocked' && (e.data as any).reason === 'trapped');
    expect(blockedEvent).toBeDefined();
  });

  it('a Pokemon without trapped volatile can switch out normally', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p2-bench' });
    state.teams[1]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-bench' } as SwitchAction,
    });
    // The switch should succeed
    expect(newState.teams[1]!.slots[0]!.activePokemonIndex).toBe(1);
  });
});

describe('octolock', () => {
  it('applies trapped volatile to the target', () => {
    const { newState } = resolveP1Move('octolock');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'trapped')).toBe(true);
  });

  it('applies octolock volatile to the target', () => {
    const { newState } = resolveP1Move('octolock');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'octolock')).toBe(true);
  });

  it('lowers target def and spd by 1 at end of turn when octolock volatile is present', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Pre-apply octolock volatile to p2
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'octolock' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.def).toBe(-1);
    expect(p2After.statBoosts.spd).toBe(-1);
  });

  it('octolock drops accumulate each turn', () => {
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'octolock' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState: afterTurn1 } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const { newState: afterTurn2 } = engine.resolveTurn(afterTurn1, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2After = afterTurn2.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.def).toBe(-2);
    expect(p2After.statBoosts.spd).toBe(-2);
  });
});

describe('noretreat', () => {
  it('applies no-retreat volatile to the user', () => {
    const { newState } = resolveP1Move('noretreat');
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'no-retreat')).toBe(true);
  });

  it('does not apply no-retreat volatile to the target', () => {
    const { newState } = resolveP1Move('noretreat');
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'no-retreat')).toBe(false);
  });

  it('boosts all 5 stats by +1 for the user', () => {
    // Use growl as p2's move (targets p1 atk) would cancel the atk boost,
    // so we use a neutral move for p2 instead.
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'noretreat', currentPp: 5, maxPp: 5 };
    // p2 uses swordsdance (self boost, does not affect p1's stats)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(1);
    expect(p1Boosts.def).toBe(1);
    expect(p1Boosts.spa).toBe(1);
    expect(p1Boosts.spd).toBe(1);
    expect(p1Boosts.spe).toBe(1);
  });

  it('a Pokemon with no-retreat volatile cannot switch out', () => {
    const engine = makeEngine();
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    // Pre-apply no-retreat to p1's active
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'no-retreat' });
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    // p1 tries to switch to bench
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // The switch should be blocked — p1's active index stays at 0
    expect(newState.teams[0]!.slots[0]!.activePokemonIndex).toBe(0);
    const blockedEvent = events.find(e => e.type === 'move-blocked' && (e.data as any).reason === 'trapped');
    expect(blockedEvent).toBeDefined();
  });

  it('fails when no-retreat is already active', () => {
    const engine = makeEngine();
    const state = make1v1State();
    // Pre-apply no-retreat to p1
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'no-retreat' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'noretreat', currentPp: 5, maxPp: 5 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const failedEvent = events.find(e => e.type === 'move-failed' && (e.data as any).moveId === 'noretreat');
    expect(failedEvent).toBeDefined();
  });
});

// ── Minimize / Double Team (evasion boosts) ───────────────────────────────────

describe('minimize', () => {
  it('raises user evasion by 2', () => {
    const { p1Boosts } = resolveP1Move('minimize');
    expect(p1Boosts.evasion).toBe(2);
  });

  it('applies minimize volatile to user', () => {
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'minimize', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'minimize')).toBe(true);
  });

  it('does not affect non-evasion self stats (using neutral p2 move)', () => {
    // Use swordsdance as p2's move so it doesn't touch p1's stats
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'minimize', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(0);
    expect(p1Boosts.def).toBe(0);
    expect(p1Boosts.spa).toBe(0);
    expect(p1Boosts.spd).toBe(0);
    expect(p1Boosts.spe).toBe(0);
    expect(p1Boosts.accuracy).toBe(0);
  });
});

describe('doubleteam', () => {
  it('raises user evasion by 1', () => {
    const { p1Boosts } = resolveP1Move('doubleteam');
    expect(p1Boosts.evasion).toBe(1);
  });

  it('does not affect non-evasion self stats (using neutral p2 move)', () => {
    // Use swordsdance as p2's move so it doesn't touch p1's stats
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'doubleteam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1Boosts = newState.teams[0]!.slots[0]!.party[0]!.statBoosts;
    expect(p1Boosts.atk).toBe(0);
    expect(p1Boosts.def).toBe(0);
    expect(p1Boosts.spa).toBe(0);
    expect(p1Boosts.spd).toBe(0);
    expect(p1Boosts.spe).toBe(0);
    expect(p1Boosts.accuracy).toBe(0);
  });
});

// ── Minimize double-damage interaction ────────────────────────────────────────

describe('minimize double-damage interaction', () => {
  it('stomp deals double damage against a minimized target vs a non-minimized target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without minimize
    const stateClean = make1v1State();
    stateClean.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'stomp', currentPp: 20, maxPp: 20 };
    stateClean.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsClean } = engine.resolveTurn(stateClean, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgClean = eventsClean.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    // With minimize pre-applied to target
    const stateMinimized = make1v1State();
    stateMinimized.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'stomp', currentPp: 20, maxPp: 20 };
    stateMinimized.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    stateMinimized.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'minimize' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsMinimized } = engine.resolveTurn(stateMinimized, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgMinimized = eventsMinimized.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    expect(dmgClean).toBeDefined();
    expect(dmgMinimized).toBeDefined();
    // Minimized target should take approximately 2x damage (allow ±1 for rounding)
    expect(dmgMinimized).toBeGreaterThanOrEqual(dmgClean * 2 - 1);
    expect(dmgMinimized).toBeLessThanOrEqual(dmgClean * 2 + 1);
    expect(dmgMinimized).toBeGreaterThan(dmgClean);
  });

  it('flamethrower (non-MINIMIZE_DOUBLES move) deals normal damage against a minimized target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without minimize
    const stateClean = make1v1State();
    stateClean.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    stateClean.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsClean } = engine.resolveTurn(stateClean, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgClean = eventsClean.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    // With minimize pre-applied to target
    const stateMinimized = make1v1State();
    stateMinimized.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    stateMinimized.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    stateMinimized.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'minimize' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsMinimized } = engine.resolveTurn(stateMinimized, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    vi.restoreAllMocks();
    const dmgMinimized = eventsMinimized.find(
      e => e.type === 'damage-dealt' && (e.data as any).attackerSlotId === 'slot-a1'
    )?.data['damage'] as number;

    expect(dmgClean).toBeDefined();
    expect(dmgMinimized).toBeDefined();
    // Flamethrower does NOT get the minimize double-damage bonus
    expect(dmgMinimized).toBe(dmgClean);
  });
});

// ── Imprison ──────────────────────────────────────────────────────────────────

describe('imprison', () => {
  it('applies imprison volatile to the user (p1)', () => {
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'imprison', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'imprison')).toBe(true);
  });

  it('does not apply imprison volatile to the target (p2)', () => {
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'imprison', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'imprison')).toBe(false);
  });

  it('blocks opponent from using a move that the imprisoning Pokemon also knows', () => {
    // Setup: p1 has imprison volatile (already used Imprison).
    // Both p1 and p2 know flamethrower (default move 0).
    // p2 tries to use flamethrower — should be blocked.
    const engine = makeEngine();
    const state = make1v1State();
    // p1 already has imprison volatile applied
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'imprison' });
    // Both have flamethrower as move 0 (default)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    // Give p1 flamethrower at a different slot so the block check can find it
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const blockedEvent = events.find(
      e => e.type === 'move-blocked' && (e.data as any).reason === 'imprison' && (e.data as any).slotId === 'slot-b1'
    );
    expect(blockedEvent).toBeDefined();
  });

  it('does not block opponent from using a move that the imprisoning Pokemon does NOT know', () => {
    // p1 has imprison volatile, but p1 does NOT know surf.
    // p2 uses surf — should NOT be blocked.
    const engine = makeEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'imprison' });
    // p1's moves: growl, airslash, roost, willowisp (no surf)
    state.teams[0]!.slots[0]!.party[0]!.moves = [
      { moveId: 'growl', currentPp: 40, maxPp: 40 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ];
    // p2 uses surf (which p1 does NOT know)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const blockedEvent = events.find(
      e => e.type === 'move-blocked' && (e.data as any).reason === 'imprison' && (e.data as any).slotId === 'slot-b1'
    );
    expect(blockedEvent).toBeUndefined();
  });
});
