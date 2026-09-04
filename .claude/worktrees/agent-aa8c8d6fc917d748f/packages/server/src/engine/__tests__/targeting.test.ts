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

describe('adjacency filtering in multi-slot battles', () => {
  function make3v3State() {
    const state = make1v1State();
    // Extend team A to 3 slots (indices 0, 1, 2)
    const a2 = structuredClone(state.teams[0]!.slots[0]!);
    a2.slotId = 'slot-a2';
    const a3 = structuredClone(state.teams[0]!.slots[0]!);
    a3.slotId = 'slot-a3';
    state.teams[0]!.slots.push(a2, a3);
    // Extend team B to 3 slots (indices 0, 1, 2)
    const b2 = structuredClone(state.teams[1]!.slots[0]!);
    b2.slotId = 'slot-b2';
    const b3 = structuredClone(state.teams[1]!.slots[0]!);
    b3.slotId = 'slot-b3';
    state.teams[1]!.slots.push(b2, b3);
    return state;
  }

  it('normal: left attacker (idx 0) reaches foe indices 0 and 1, not 2', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).not.toContain('slot-b3');
  });

  it('normal: center attacker (idx 1) reaches all 3 foe slots', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a2', 'normal');
    expect(targets).toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).toContain('slot-b3');
  });

  it('normal: right attacker (idx 2) reaches foe indices 1 and 2, not 0', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a3', 'normal');
    expect(targets).not.toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).toContain('slot-b3');
  });

  it('adjacentAlly: center attacker (idx 1) reaches allies at idx 0 and 2', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a2', 'adjacentAlly');
    expect(targets).toContain('slot-a1');
    expect(targets).toContain('slot-a3');
    expect(targets).not.toContain('slot-a2'); // not self
  });

  it('adjacentAlly: left attacker (idx 0) can only reach ally at idx 1', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'adjacentAlly');
    expect(targets).toEqual(['slot-a2']);
  });

  it('allAdjacentFoes returns all living foes regardless of position', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'allAdjacentFoes');
    expect(targets.sort()).toEqual(['slot-b1', 'slot-b2', 'slot-b3'].sort());
  });

  it('normal in 1v1 still returns the single foe (adjacency is no-op)', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual(['slot-b1']);
  });
});
