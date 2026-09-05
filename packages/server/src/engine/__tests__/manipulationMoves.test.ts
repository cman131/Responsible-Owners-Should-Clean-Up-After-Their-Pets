import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

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
