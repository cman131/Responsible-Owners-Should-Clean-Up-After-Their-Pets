import { describe, it, expect } from 'vitest';
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
