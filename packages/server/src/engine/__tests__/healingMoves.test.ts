import { describe, it, expect } from 'vitest';
import { buildDefaultRegistry } from '../registrations.js';
import { makePokemon, make1v1State } from './fixtures.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { Move } from '@poke-fighter/shared';

function makeCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  const state = make1v1State();
  return {
    battle: state,
    user: state.teams[0]!.slots[0]!.party[0]!,
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [state.teams[1]!.slots[0]!.party[0]!],
    targetSlotIds: ['slot-b1'],
    targetTypes: [['Normal']],
    move: { id: 'test', effectId: 'test' } as Move,
    rng: () => 0.5,
    ...overrides,
  };
}

const registry = buildDefaultRegistry();

function invoke(moveId: string, ctxOverrides: Partial<MoveContext> = {}) {
  const handler = registry.get(moveId);
  if (!handler) throw new Error(`No handler for ${moveId}`);
  return handler(makeCtx(ctxOverrides));
}

describe('slackoff', () => {
  it('heals 50% of max HP', () => {
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('slackoff', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(200);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('does not overheal past max HP', () => {
    const user = makePokemon({ maxHp: 200, currentHp: 180 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('slackoff', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(200);
    expect(events[0]!.data['amount']).toBe(20);
  });
});

describe('shoreup', () => {
  it('heals 50% of max HP with no weather', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('shoreup', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('does not overheal past max HP', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 90 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('shoreup', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(10);
  });
});

describe('morningsun', () => {
  it('heals 50% of max HP with no weather', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('morningsun', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('does not overheal past max HP', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 90 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('morningsun', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(10);
  });
});
