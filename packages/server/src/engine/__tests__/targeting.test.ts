import { describe, it, expect } from 'vitest';
import { getLegalTargets } from '../targeting.js';
import { make1v1State } from './fixtures.js';

describe('getLegalTargets', () => {
  it('single-target move on 1v1 returns the one foe slot', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual(['slot-b1']);
  });

  it('self-target move returns only the user slot', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'self');
    expect(targets).toEqual(['slot-a1']);
  });

  it('spread move returns all foe slots', () => {
    const state = make1v1State();
    // Manually add a second foe slot
    const extraSlot = structuredClone(state.teams[1]!.slots[0]!);
    extraSlot.slotId = 'slot-b2';
    state.teams[1]!.slots.push(extraSlot);

    const targets = getLegalTargets(state, 'slot-a1', 'allAdjacentFoes');
    expect(targets.sort()).toEqual(['slot-b1', 'slot-b2'].sort());
  });

  it('excludes fainted pokemon slots', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual([]);
  });

  it('adjacentAlly returns ally slots excluding self', () => {
    const state = make1v1State();
    // Add a second ally slot
    const extraAlly = structuredClone(state.teams[0]!.slots[0]!);
    extraAlly.slotId = 'slot-a2';
    state.teams[0]!.slots.push(extraAlly);

    const targets = getLegalTargets(state, 'slot-a1', 'adjacentAlly');
    expect(targets).toEqual(['slot-a2']);
  });
});
