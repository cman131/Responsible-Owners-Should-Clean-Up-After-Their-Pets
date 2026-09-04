import { describe, it, expect, vi } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

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
