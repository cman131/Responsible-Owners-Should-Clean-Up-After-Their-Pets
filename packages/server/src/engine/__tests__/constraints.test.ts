import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('lastMoveId tracking', () => {
  it('records the last move used by the attacker', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.lastMoveId).toBe('flamethrower');
  });
});

describe('Taunt', () => {
  it('applies taunt volatile with 3 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'taunt', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    const tauntEntry = defender.volatileStatus.find(v => v.name === 'taunt');
    expect(tauntEntry).toBeDefined();
    expect(tauntEntry?.turnsRemaining).toBe(3);
  });

  it('blocks status moves while taunted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'taunt', turnsRemaining: 2 });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'calmmind', currentPp: 20, maxPp: 20 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'taunted')).toBe(true);
  });

  it('expires after turns remaining reaches 0 at EoT', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'taunt', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'taunt')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'taunt')).toBe(true);
  });
});

describe('Encore', () => {
  it('forces the encored move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // p1 has encore forcing 'airslash' (moveIndex 1), but p1 submits moveIndex 0 (flamethrower)
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'encore', moveId: 'airslash', turnsRemaining: 3 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // Should use airslash, not flamethrower
    const moveUsed = events.find(e => e.type === 'move-used');
    expect((moveUsed?.data as any)?.moveId).toBe('airslash');
  });

  it('expires after 3 turns', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'encore', moveId: 'flamethrower', turnsRemaining: 1 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'encore')).toBe(false);
  });
});

describe('Torment', () => {
  it('blocks using the same move consecutively', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'torment' });
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower again
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'torment')).toBe(true);
  });
});

describe('Disable', () => {
  it('fails if target has no lastMoveId', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'disable', currentPp: 20, maxPp: 20 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'no-last-move')).toBe(true);
  });

  it('applies disable volatile targeting lastMoveId', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'disable', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    const disableEntry = defender.volatileStatus.find(v => v.name === 'disable');
    expect(disableEntry).toBeDefined();
    expect(disableEntry?.moveId).toBe('flamethrower');
    expect(disableEntry?.turnsRemaining).toBe(4);
  });

  it('blocks the disabled move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'disable', moveId: 'flamethrower', turnsRemaining: 4 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 }, // flamethrower (moveIndex 0) is disabled
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'disabled')).toBe(true);
  });

  it('expires after 4 turns and emits volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'disable', moveId: 'airslash', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defender.volatileStatus.some(v => v.name === 'disable')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'disable')).toBe(true);
  });
});
