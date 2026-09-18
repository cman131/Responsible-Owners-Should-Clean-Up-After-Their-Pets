import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Light Ball', () => {
  it('doubles damage dealt by Pikachu', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'pikachu';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'pikachu';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'light-ball';
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBe(baseDmg * 2);
  });

  it('does not boost damage for non-Pikachu', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'light-ball'; // charizard, not pikachu
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });
});

describe('Thick Club', () => {
  it('doubles physical damage for Cubone', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'cubone';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'cubone';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'thick-club';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBe(baseDmg * 2);
  });

  it('does not boost special moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'cubone';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'cubone';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'thick-club'; // default move[0] is flamethrower (special)
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });

  it('does not boost physical moves for non-Cubone/Marowak', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'thick-club'; // charizard, not cubone/marowak
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });
});

describe('Deep Sea Tooth', () => {
  it('doubles special damage dealt by Clamperl', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'clamperl';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'clamperl';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'deep-sea-tooth';
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBe(baseDmg * 2);
  });

  it('does not boost damage for non-Clamperl', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'deep-sea-tooth'; // charizard, not clamperl
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });
});

describe('Deep Sea Scale', () => {
  it('halves special damage taken by Clamperl', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[1]!.slots[0]!.party[0]!.speciesName = 'clamperl';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[1]!.slots[0]!.party[0]!.speciesName = 'clamperl';
    withItem.teams[1]!.slots[0]!.party[0]!.heldItem = 'deep-sea-scale';
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const reducedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(reducedDmg).toBe(Math.floor(baseDmg * 0.5));
  });

  it('does not reduce damage for non-Clamperl', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[1]!.slots[0]!.party[0]!.heldItem = 'deep-sea-scale'; // charizard, not clamperl
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });
});

describe('Lucky Punch', () => {
  it('gives Chansey +2 crit stage (crits at rng=0.4, stage 2 prob 0.5 > 0.4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'chansey';
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'lucky-punch';
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(true);
  });

  it('Chansey without Lucky Punch does not crit at rng=0.4 (stage 0 prob 1/24 < 0.4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'chansey';
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(false);
  });

  it('does not give crit bonus to non-Chansey', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State(); // default charizard
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'lucky-punch';
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(false);
  });
});

describe('Leek', () => {
  it('gives Farfetchd +2 crit stage (crits at rng=0.4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'farfetchd';
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'leek';
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(true);
  });

  it('also works for Sirfetchd', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'sirfetchd';
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'leek';
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(true);
  });

  it('does not give crit bonus to non-Farfetchd', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'leek'; // charizard
    const { events } = new BattleEngine({ rng: () => 0.4 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'crit')).toBe(false);
  });
});

describe('Quick Powder', () => {
  it('doubles speed of untransformed Ditto allowing it to move first', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // p1 spe=100, p2 Ditto spe=80. With Quick Powder: floor(80*2)=160 -> p2 moves first.
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesName = 'ditto';
    p2.heldItem = 'quick-powder';
    p2.volatileStatus = [];
    p2.stats.atk = 999;
    p2.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 999;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    const { newState } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // Ditto moved first -> p1 fainted, Ditto survived
    expect(newState.teams[0]!.slots[0]!.party[0]!.fainted).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.fainted).toBe(false);
  });

  it('does not double speed of transformed Ditto', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesName = 'ditto';
    p2.heldItem = 'quick-powder';
    p2.volatileStatus = [{ name: 'transformed' }];
    p2.stats.atk = 999;
    p2.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 999;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    const { newState } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // p1 moved first -> Ditto fainted, p1 survived
    expect(newState.teams[1]!.slots[0]!.party[0]!.fainted).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.fainted).toBe(false);
  });
});

describe('Metal Powder', () => {
  it('halves damage taken by untransformed Ditto', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[1]!.slots[0]!.party[0]!.speciesName = 'ditto';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[1]!.slots[0]!.party[0]!.speciesName = 'ditto';
    withItem.teams[1]!.slots[0]!.party[0]!.heldItem = 'metal-powder';
    withItem.teams[1]!.slots[0]!.party[0]!.volatileStatus = [];
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const reducedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(reducedDmg).toBe(Math.floor(baseDmg * 0.5));
  });

  it('does not reduce damage for transformed Ditto', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[1]!.slots[0]!.party[0]!.speciesName = 'ditto';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[1]!.slots[0]!.party[0]!.speciesName = 'ditto';
    withItem.teams[1]!.slots[0]!.party[0]!.heldItem = 'metal-powder';
    withItem.teams[1]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'transformed' }];
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const itemDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(itemDmg).toBe(baseDmg);
  });
});

describe('Adamant Orb', () => {
  it('boosts Dragon moves by 1.2× for Dialga', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'adamant-orb';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });

  it('boosts Steel moves by 1.2× for Dialga', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ironhead', currentPp: 15, maxPp: 15 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'adamant-orb';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'ironhead', currentPp: 15, maxPp: 15 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });

  it('does not boost non-Dragon/Steel moves for Dialga', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'adamant-orb';
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const noBoostDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(noBoostDmg).toBe(baseDmg);
  });

  it('does not boost moves for non-Dialga', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'adamant-orb'; // charizard, not dialga
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const noBoostDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(noBoostDmg).toBe(baseDmg);
  });
});

describe('Adamant Crystal', () => {
  it('boosts Dragon moves by 1.2× for Dialga (same as Adamant Orb)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'dialga';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'adamant-crystal';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });
});

describe('Lustrous Orb', () => {
  it('boosts Water moves by 1.2× for Palkia', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'lustrous-orb';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });

  it('boosts Dragon moves by 1.2× for Palkia', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'lustrous-orb';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });

  it('does not boost moves for non-Palkia', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'lustrous-orb'; // charizard, not palkia
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const noBoostDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(noBoostDmg).toBe(baseDmg);
  });
});

describe('Lustrous Globe', () => {
  it('boosts Water moves by 1.2× for Palkia (same as Lustrous Orb)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = make1v1State();
    base.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    base.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: baseEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(base, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const baseDmg = (baseEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    const withItem = make1v1State();
    withItem.teams[0]!.slots[0]!.party[0]!.speciesName = 'palkia';
    withItem.teams[0]!.slots[0]!.party[0]!.heldItem = 'lustrous-globe';
    withItem.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const { events: itemEvts } = new BattleEngine({ rng: () => 0.5 }).resolveTurn(withItem, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const boostedDmg = (itemEvts.find(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')!.data as any).damage as number;

    expect(boostedDmg).toBeGreaterThan(baseDmg);
  });
});
