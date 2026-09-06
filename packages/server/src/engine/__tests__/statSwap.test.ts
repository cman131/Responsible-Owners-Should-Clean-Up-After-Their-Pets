import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('Guard Swap', () => {
  it('exchanges def and spd stat stages between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.def = 2;
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.spd = -1;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.def = -2;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.spd = 1;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'guardswap', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.def).toBe(-2);
    expect(p1.statBoosts.spd).toBe(1);
    expect(p2.statBoosts.def).toBe(2);
    expect(p2.statBoosts.spd).toBe(-1);
  });
});

describe('Power Swap', () => {
  it('exchanges atk and spa stat stages between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 3;
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.spa = -2;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.atk = -1;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.spa = 2;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'powerswap', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.atk).toBe(-1);
    expect(p1.statBoosts.spa).toBe(2);
    expect(p2.statBoosts.atk).toBe(3);
    expect(p2.statBoosts.spa).toBe(-2);
  });
});

describe('Heart Swap', () => {
  it('exchanges all 7 stat stages between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts = { atk: 2, def: -1, spa: 1, spd: 0, spe: 3, accuracy: -1, evasion: 0 };
    state.teams[1]!.slots[0]!.party[0]!.statBoosts = { atk: -2, def: 1, spa: 0, spd: 2, spe: -3, accuracy: 1, evasion: 0 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'heartswap', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.statBoosts).toEqual({ atk: -2, def: 1, spa: 0, spd: 2, spe: -3, accuracy: 1, evasion: 0 });
    expect(p2.statBoosts).toEqual({ atk: 2, def: -1, spa: 1, spd: 0, spe: 3, accuracy: -1, evasion: 0 });
  });
});

describe('Speed Swap', () => {
  it('exchanges spe stat stage between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.spe = 2;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.spe = -1;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'speedswap', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(-1);
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spe).toBe(2);
  });
});

describe('Guard Split', () => {
  it('averages def and spd base stats between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.stats.def = 100;
    state.teams[0]!.slots[0]!.party[0]!.stats.spd = 80;
    state.teams[1]!.slots[0]!.party[0]!.stats.def = 60;
    state.teams[1]!.slots[0]!.party[0]!.stats.spd = 40;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'guardsplit', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.stats.def).toBe(80); // floor((100+60)/2)
    expect(p1.stats.spd).toBe(60); // floor((80+40)/2)
    expect(p2.stats.def).toBe(80);
    expect(p2.stats.spd).toBe(60);
  });
});

describe('Power Split', () => {
  it('averages atk and spa base stats between user and target', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 120;
    state.teams[0]!.slots[0]!.party[0]!.stats.spa = 100;
    state.teams[1]!.slots[0]!.party[0]!.stats.atk = 40;
    state.teams[1]!.slots[0]!.party[0]!.stats.spa = 60;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'powersplit', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.stats.atk).toBe(80); // floor((120+40)/2)
    expect(p1.stats.spa).toBe(80); // floor((100+60)/2)
    expect(p2.stats.atk).toBe(80);
    expect(p2.stats.spa).toBe(80);
  });
});

describe('Power Trick', () => {
  it('swaps user atk and def stats; second use swaps back', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 130;
    state.teams[0]!.slots[0]!.party[0]!.stats.def = 50;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'powertrick', currentPp: 10, maxPp: 10 };

    const after1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = after1.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.stats.atk).toBe(50);
    expect(p1.stats.def).toBe(130);
    expect(p1.volatileStatus.some(v => v.name === 'power-trick')).toBe(true);

    // Second use toggles back
    const after2 = engine.resolveTurn(after1.newState, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1b = after2.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1b.stats.atk).toBe(130);
    expect(p1b.stats.def).toBe(50);
    expect(p1b.volatileStatus.some(v => v.name === 'power-trick')).toBe(false);
  });
});

describe('Power Shift', () => {
  it('swaps user atk and def stats (one-shot, no toggle)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 100;
    state.teams[0]!.slots[0]!.party[0]!.stats.def = 60;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'powershift', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.stats.atk).toBe(60);
    expect(p1.stats.def).toBe(100);
  });
});

describe('Haze', () => {
  it('resets all stat stages to 0 for all active Pokemon', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts = { atk: 3, def: -2, spa: 1, spd: 0, spe: 2, accuracy: -1, evasion: 0 };
    state.teams[1]!.slots[0]!.party[0]!.statBoosts = { atk: -3, def: 2, spa: 0, spd: 1, spe: -1, accuracy: 0, evasion: 1 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'haze', currentPp: 30, maxPp: 30 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    const zero = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    expect(p1.statBoosts).toEqual(zero);
    expect(p2.statBoosts).toEqual(zero);
  });

  it('emits no stat-change event when all boosts are already 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'haze', currentPp: 30, maxPp: 30 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.filter(e => e.type === 'stat-change').length).toBe(0);
  });
});
