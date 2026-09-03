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

describe('aromatherapy', () => {
  it('cures status of all non-fainted party members on the user team', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'brn' as const });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'par' as const });
    const mon3 = makePokemon({ instanceId: 'a3', status: 'psn' as const });
    state.teams[0]!.slots[0]!.party = [mon1, mon2, mon3];

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      user: mon1,
      userSlotId: 'slot-a1',
      userTeamIndex: 0,
    };
    const handler = registry.get('aromatherapy')!;
    handler(ctx);

    expect(mon1.status).toBeUndefined();
    expect(mon2.status).toBeUndefined();
    expect(mon3.status).toBeUndefined();
  });

  it('emits a status-cured event for each cured pokemon', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'brn' as const });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'par' as const });
    state.teams[0]!.slots[0]!.party = [mon1, mon2];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('aromatherapy')!(ctx);

    expect(events.filter(e => e.type === 'status-cured')).toHaveLength(2);
  });

  it('does not affect fainted party members', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1' });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'brn' as const, fainted: true });
    state.teams[0]!.slots[0]!.party = [mon1, mon2];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('aromatherapy')!(ctx);

    expect(mon2.status).toBe('brn');
  });

  it('clears the toxic volatile counter', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'tox' as const, volatileStatus: [{ name: 'toxic', counter: 3 }] });
    state.teams[0]!.slots[0]!.party = [mon1];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('aromatherapy')!(ctx);

    expect(mon1.status).toBeUndefined();
    expect(mon1.volatileStatus.some(v => v.name === 'toxic')).toBe(false);
  });
});

describe('healbell', () => {
  it('cures status of all non-fainted party members (same as aromatherapy)', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'slp' as const });
    state.teams[0]!.slots[0]!.party = [mon1];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('healbell')!(ctx);

    expect(mon1.status).toBeUndefined();
  });
});
