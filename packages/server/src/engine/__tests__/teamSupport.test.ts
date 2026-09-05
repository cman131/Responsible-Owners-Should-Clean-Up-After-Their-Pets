import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

function makeEngine() {
  return new BattleEngine({ rng: () => 0 });
}

// ── Tailwind ──────────────────────────────────────────────────────────────────

describe('tailwind', () => {
  it('doubles speed of Pokemon on the active side', () => {
    // p1 spe=100, p2 spe=80 — p2 normally goes second
    // With Tailwind on p2's side (team 1), p2 effective spe=160 → acts first
    const state = make1v1State();
    state.field.sideConditions[1]!.tailwind = 4;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const moveEvents = events.filter((e) => e.type === 'move-used');
    expect(moveEvents[0]!.data['attackerSlotId']).toBe('slot-b1'); // p2 acts first under tailwind
  });

  it('registers tailwind as a side condition on the user side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tailwind', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // EOT decrements the counter, so value=3 after the turn where tailwind was used (set to 4, decremented once)
    expect(newState.field.sideConditions[0]!.tailwind).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'side-condition-set' && e.data['condition'] === 'tailwind' && e.data['value'] === 4)).toBe(true);
  });

  it('fails if tailwind is already active', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.tailwind = 3;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tailwind', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.tailwind).toBe(2); // decremented (turn passed), not reset to 4
    expect(events.some((e) => e.type === 'move-failed')).toBe(true);
  });

  it('decrements tailwind counter each turn and emits side-condition-ended', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.tailwind = 1;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.tailwind).toBe(0);
    expect(events.some((e) => e.type === 'side-condition-ended' && e.data['condition'] === 'tailwind')).toBe(true);
  });
});

// ── Safeguard ─────────────────────────────────────────────────────────────────

describe('safeguard', () => {
  it('registers safeguard on the user side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'safeguard', currentPp: 25, maxPp: 25 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // EOT decrements once; was set to 5
    expect(newState.field.sideConditions[0]!.safeguard).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'side-condition-set' && e.data['condition'] === 'safeguard' && e.data['value'] === 5)).toBe(true);
  });

  it('blocks external status conditions behind Safeguard', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.safeguard = 5;
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('does not block self-inflicted status (Rest)', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.safeguard = 5;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rest', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('slp');
  });
});

// ── Mist ──────────────────────────────────────────────────────────────────────

describe('mist', () => {
  it('registers mist on the user side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'mist', currentPp: 30, maxPp: 30 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // EOT decrements once; was set to 5
    expect(newState.field.sideConditions[0]!.mist).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'side-condition-set' && e.data['condition'] === 'mist' && e.data['value'] === 5)).toBe(true);
  });

  it('blocks opponent stat drops behind Mist', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.mist = 5;
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'leer', currentPp: 30, maxPp: 30 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.def).toBe(0); // Leer blocked by Mist
  });

  it('does not block self-inflicted stat drops', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.mist = 5;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'closecombat', currentPp: 5, maxPp: 5 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Close Combat's own stat drops still apply even behind Mist
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.def).toBe(-1);
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spd).toBe(-1);
  });
});

// ── Lucky Chant ───────────────────────────────────────────────────────────────

describe('luckychant', () => {
  it('registers luckychant on the user side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'luckychant', currentPp: 30, maxPp: 30 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // EOT decrements once; was set to 5
    expect(newState.field.sideConditions[0]!.luckychant).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'side-condition-set' && e.data['condition'] === 'luckychant' && e.data['value'] === 5)).toBe(true);
  });

  it('prevents critical hits against Lucky Chant-protected side', () => {
    // Give p1 Focus Energy — at stage 2 crit with rng=0 it would normally crit (0 < 0.5)
    // Lucky Chant on p2's side should force isCritical=false
    const state = make1v1State();
    state.field.sideConditions[1]!.luckychant = 5;
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'focusenergy', turnsRemaining: 5 }];
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Crits emit a separate 'crit' event; Lucky Chant should prevent this
    expect(events.some((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1')).toBe(false);
  });
});

// ── Magic Coat ────────────────────────────────────────────────────────────────

describe('magiccoat', () => {
  it('registers magic-coat volatile on the user', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'magiccoat', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some((v) => v.name === 'magic-coat')).toBe(true);
  });

  it('bounces Toxic back to the attacker when target has Magic Coat', () => {
    const state = make1v1State();
    // p2 has Magic Coat; p1 uses Toxic on p2
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'magic-coat', turnsRemaining: 1 }];
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'toxic', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // p2 (target) should NOT be poisoned; p1 (attacker) should be
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toMatch(/tox|psn/);
  });
});

// ── Snatch ────────────────────────────────────────────────────────────────────

describe('snatch', () => {
  it('registers snatch volatile on the user', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'snatch', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some((v) => v.name === 'snatch')).toBe(true);
  });

  it('steals Swords Dance from opponent — Snatch user gains +2 Atk, opponent gains nothing', () => {
    const state = make1v1State();
    // p1 has Snatch; p2 uses Swords Dance — p1 should steal it
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'snatch', turnsRemaining: 1 }];
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.atk).toBe(2); // Snatch user stole +2 Atk
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0); // Opponent gains nothing
  });
});

// ── Defog regression ──────────────────────────────────────────────────────────

describe('defog regression', () => {
  it('does not clear Tailwind from the foe side', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.tailwind = 3; // p1's side has Tailwind
    // p2 uses Defog on p1
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'defog', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Tailwind should be decremented (EOT) but NOT cleared by Defog
    expect(newState.field.sideConditions[0]!.tailwind).toBe(2); // was 3, decremented by EOT
  });

  it('still clears Stealth Rock from both sides (hazard clearing is unaffected)', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.stealthRock = true; // p1's side
    state.field.sideConditions[1]!.stealthRock = true; // p2's side
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'defog', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = makeEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.stealthRock).toBe(false);
    expect(newState.field.sideConditions[1]!.stealthRock).toBe(false);
  });
});
