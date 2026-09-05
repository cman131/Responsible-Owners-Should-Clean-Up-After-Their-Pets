import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';
import { effectiveAbilityId } from '../abilities.js';

describe('Soak', () => {
  it('changes target type to Water, making Water moves deal 0.5× instead of 2×', () => {
    // p2 is Charizard (Fire/Flying, speciesId=6). Water vs Fire/Flying = 2×.
    // After Soak, p2 becomes Water-type. Water vs Water = 0.5×.
    const engine = new BattleEngine({ rng: () => 0.5 });

    // First: measure damage of Water move WITHOUT Soak
    const stateNoSoak = make1v1State();
    // p1 uses watergun (Water-type move), p2 is Charizard (Fire/Flying)
    stateNoSoak.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'watergun', currentPp: 25, maxPp: 25 };
    const noSoakResult = engine.resolveTurn(stateNoSoak, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgNoSoak = 100 - noSoakResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // Second: Soak p2, then use Water move
    const stateSoak = make1v1State();
    stateSoak.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'soak', currentPp: 20, maxPp: 20 };
    stateSoak.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'watergun', currentPp: 25, maxPp: 25 };

    // Turn 1: use Soak
    const afterSoak = engine.resolveTurn(stateSoak, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const p2afterSoak = afterSoak.newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2afterSoak.typeOverride).toEqual(['Water']);

    // Turn 2: use Water Gun on the now-Water-type p2
    const afterWaterGun = engine.resolveTurn(afterSoak.newState, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
    });
    const dmgAfterSoak = p2afterSoak.currentHp - afterWaterGun.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // After Soak: Water vs Water = 0.5× (resisted). Should deal less than Water vs Fire/Flying = 2×.
    expect(dmgAfterSoak).toBeLessThan(dmgNoSoak);
  });
});

describe('Reflect Type', () => {
  it('copies the target\'s types to the user', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    // p2 is Charizard (speciesId=6, Fire/Flying). p1 uses Reflect Type.
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'reflecttype', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    // p1 should now have Fire/Flying type override
    expect(p1.typeOverride).toBeDefined();
    expect(p1.typeOverride).toContain('Fire');
    expect(p1.typeOverride).toContain('Flying');
  });

  it('Reflect Type user gets STAB on copied type moves', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without Reflect Type
    const stateNoReflect = make1v1State();
    stateNoReflect.teams[0]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water)
    stateNoReflect.teams[0]!.slots[0]!.party[0]!.speciesName = 'blastoise';
    stateNoReflect.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    const noReflectResult = engine.resolveTurn(stateNoReflect, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgNoReflect = 100 - noReflectResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Reflect Type then Flamethrower
    const stateWithReflect = make1v1State();
    stateWithReflect.teams[0]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water)
    stateWithReflect.teams[0]!.slots[0]!.party[0]!.speciesName = 'blastoise';
    stateWithReflect.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'reflecttype', currentPp: 15, maxPp: 15 };
    stateWithReflect.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    // p2 = Charizard (Fire/Flying) — after Reflect Type, p1 becomes Fire/Flying
    const afterReflect = engine.resolveTurn(stateWithReflect, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const afterReflectFlame = engine.resolveTurn(afterReflect.newState, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
    });
    const dmgWithReflect = afterReflect.newState.teams[1]!.slots[0]!.party[0]!.currentHp
      - afterReflectFlame.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Fire STAB, Flamethrower should deal more damage than without STAB
    expect(dmgWithReflect).toBeGreaterThan(dmgNoReflect);
  });
});

describe('Trick-or-Treat', () => {
  it('adds Ghost type to target, making Ghost moves super-effective', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // p2 is Charizard (Fire/Flying, speciesId=6).
    // Ghost vs Fire/Flying = 1×. After Trick-or-Treat, Ghost vs Fire/Flying/Ghost = 2×.

    // Without Trick-or-Treat: Ghost move on Charizard (baseline damage)
    const stateNoTrick = make1v1State();
    stateNoTrick.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shadowball', currentPp: 15, maxPp: 15 };
    const noTrickResult = engine.resolveTurn(stateNoTrick, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgNoTrick = 100 - noTrickResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgNoTrick).toBeGreaterThan(0); // Ghost hits Fire/Flying normally

    // Apply Trick-or-Treat to Charizard, then use Ghost move
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'trickortreat', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'shadowball', currentPp: 15, maxPp: 15 };

    const afterTrick = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const p2 = afterTrick.newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.typeOverride).toContain('Ghost');
    expect(p2.typeOverride).toContain('Fire');   // original types preserved
    expect(p2.typeOverride).toContain('Flying'); // original types preserved

    const afterGhost = engine.resolveTurn(afterTrick.newState, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
    });
    const dmgWithTrick = p2.currentHp - afterGhost.newState.teams[1]!.slots[0]!.party[0]!.currentHp;
    // Ghost vs Fire/Flying/Ghost = 2× (super-effective), more damage than without Trick-or-Treat
    expect(dmgWithTrick).toBeGreaterThan(dmgNoTrick);
  });

  it('preserves original type and appends Ghost (type not replaced)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    // Use Snorlax (Normal) to verify type-append behavior
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 143; // Snorlax (Normal)
    state.teams[1]!.slots[0]!.party[0]!.speciesName = 'snorlax';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'trickortreat', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.typeOverride).toContain('Ghost');
    expect(p2.typeOverride).toContain('Normal'); // original type preserved
  });
});

describe("Forest's Curse", () => {
  it('adds Grass type to target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'forestscurse', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.typeOverride).toContain('Grass');
    // Original types preserved (Charizard = Fire/Flying)
    expect(p2.typeOverride).toContain('Fire');
    expect(p2.typeOverride).toContain('Flying');
  });
});

describe('Trick / Switcheroo', () => {
  it('swaps held items between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.heldItem = 'life-orb';
    p2.heldItem = 'leftovers';
    p1.moves[0] = { moveId: 'trick', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('leftovers');
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('life-orb');
  });

  it('swaps when user has no item (target loses item)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    delete p1.heldItem; // user has no item
    p2.heldItem = 'leftovers';
    p1.moves[0] = { moveId: 'switcheroo', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('leftovers');
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});

describe('Bestow', () => {
  it('gives user\'s item to itemless target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'leftovers';
    delete state.teams[1]!.slots[0]!.party[0]!.heldItem;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bestow', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('leftovers');
  });

  it('fails if user has no item', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    delete state.teams[0]!.slots[0]!.party[0]!.heldItem;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bestow', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'no-item')).toBe(true);
  });

  it('fails if target already holds an item', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'leftovers';
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'life-orb';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bestow', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'target-has-item')).toBe(true);
  });
});

describe('Skill Swap', () => {
  it('exchanges abilities between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.ability = 'blaze';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'intimidate';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'skillswap', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.ability).toBe('intimidate');
    expect(newState.teams[1]!.slots[0]!.party[0]!.ability).toBe('blaze');
  });
});

describe('Electrify', () => {
  it('makes the attacker\'s move Electric-type for the turn and clears the volatile', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // p2 is Dratini (Dragon-type, speciesId=147). p1 is Charizard (Fire/Flying).
    // Without Electrify: p2 uses Tackle (Normal) on p1 (Charizard Fire/Flying) = 1× effectiveness.
    // With Electrify on p2: p2's Tackle becomes Electric → 2× (Electric is super-effective vs Flying).
    // So damage with Electrify should be greater than without.

    // Baseline: p2 (Dratini) uses Tackle on p1 (Charizard) without Electrify
    const stateNoElec = make1v1State();
    stateNoElec.teams[1]!.slots[0]!.party[0]!.speciesId = 147;
    stateNoElec.teams[1]!.slots[0]!.party[0]!.speciesName = 'dratini';
    stateNoElec.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const noElecResult = engine.resolveTurn(stateNoElec, {
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const dmgNoElec = 100 - noElecResult.newState.teams[0]!.slots[0]!.party[0]!.currentHp;

    // With Electrify: p1 uses Electrify on p2 (p1 is faster), p2 uses Tackle (now Electric) on p1
    const stateElec = make1v1State();
    stateElec.teams[1]!.slots[0]!.party[0]!.speciesId = 147;
    stateElec.teams[1]!.slots[0]!.party[0]!.speciesName = 'dratini';
    stateElec.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'electrify', currentPp: 20, maxPp: 20 };
    stateElec.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const elecResult = engine.resolveTurn(stateElec, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const dmgElec = 100 - elecResult.newState.teams[0]!.slots[0]!.party[0]!.currentHp;

    // Electric vs Flying (Charizard) = 2×; Normal vs Fire/Flying = 1×; so dmgElec > dmgNoElec
    expect(dmgElec).toBeGreaterThan(dmgNoElec);

    // Electrify volatile must be cleared after the turn
    const p2After = elecResult.newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.volatileStatus.some(v => v.name === 'electrify')).toBe(false);
  });
});

describe('Gastro Acid', () => {
  it('suppresses the target\'s ability (effectiveAbilityId returns none)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'gastroacid', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'intimidate';

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const target = newState.teams[1]!.slots[0]!.party[0]!;
    expect(target.volatileStatus.some(v => v.name === 'gastro-acid')).toBe(true);
    expect(effectiveAbilityId(target)).toBe('none');
  });
});
