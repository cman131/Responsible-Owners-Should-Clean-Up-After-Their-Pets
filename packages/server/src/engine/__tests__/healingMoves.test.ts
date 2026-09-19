import { describe, it, expect } from 'vitest';
import { buildDefaultRegistry } from '../registrations.js';
import { makePokemon, make1v1State } from './fixtures.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { Move } from '@poke-fighter/shared';
import { BattleEngine } from '../BattleEngine.js';

function makeCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  const state = make1v1State();
  return {
    battle: state,
    user: state.teams[0]!.slots[0]!.party[0]!,
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    userTypes: [],
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

describe('wish', () => {
  it('sets slot.wish with half of user max HP and turnsRemaining=2', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('wish')!(ctx);

    expect(state.teams[0]!.slots[0]!.wish).toEqual({ hp: 100, turnsRemaining: 2 });
  });

  it('fails if a wish is already pending on the slot', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[0]!.slots[0]!.wish = { hp: 50, turnsRemaining: 2 };

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('wish')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(state.teams[0]!.slots[0]!.wish).toEqual({ hp: 50, turnsRemaining: 2 }); // unchanged
  });

  it('heals the active pokemon at end of next turn', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 200, currentHp: 100 });
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = foe;
    // Simulate: wish was used last turn, now at turnsRemaining=1
    state.teams[0]!.slots[0]!.wish = { hp: 100, turnsRemaining: 1 };

    const engine = new BattleEngine();
    // Both Pokemon use a registered move (willowisp on foe; foe uses any registered move)
    // We need a no-op move. Use 'protect' on self for foe, and any move for user.
    // Simplest: both use willowisp (it may miss, but the EoT still runs)
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-b1' }, // willowisp
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // willowisp
    });

    const healed = newState.teams[0]!.slots[0]!.party[0]!;
    expect(healed.currentHp).toBe(200);
    expect(newState.teams[0]!.slots[0]!.wish).toBeUndefined();
  });

  it('does not heal if slot Pokemon is fainted when wish resolves', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 200, currentHp: 0, fainted: true });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[0]!.slots[0]!.wish = { hp: 100, turnsRemaining: 1 };

    // Fainted pokemon: EoT loop skips them but still needs to decrement/clear wish
    // Just test state doesn't crash and wish is cleared
    const engine = new BattleEngine();
    // Only foe acts since user is fainted
    const { newState } = engine.resolveTurn(state, {
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.wish).toBeUndefined();
  });
});

describe('refresh', () => {
  it('clears the user status condition', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('refresh')!(ctx);

    expect(user.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('fails if user has no status', () => {
    const state = make1v1State();
    const user = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('refresh')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('clears sleep volatile when curing slp', () => {
    const state = make1v1State();
    const user = makePokemon({
      status: 'slp' as const,
      volatileStatus: [{ name: 'sleep', counter: 1 }],
    });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('refresh')!(ctx);

    expect(user.status).toBeUndefined();
    expect(user.volatileStatus.some(v => v.name === 'sleep')).toBe(false);
  });
});

describe('purify', () => {
  it('cures target status and heals user 50% if target had status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ status: 'psn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('purify')!(ctx);

    expect(target.status).toBeUndefined();
    expect(user.currentHp).toBe(200);
  });

  it('fails if target has no status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('purify')!(ctx);

    expect(user.currentHp).toBe(100);
    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('cures target status but skips self-heal if user is heal-blocked', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, volatileStatus: [{ name: 'heal-block', turnsRemaining: 2 }] });
    const target = makePokemon({ status: 'psn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('purify')!(ctx);

    expect(target.status).toBeUndefined(); // status cured
    expect(user.currentHp).toBe(100); // no heal
  });
});

describe('psychoshift', () => {
  it('transfers user status to target and clears user status', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('psychoshift')!(ctx);

    expect(user.status).toBeUndefined();
    expect(target.status).toBe('brn');
  });

  it('fails if user has no status', () => {
    const state = make1v1State();
    const user = makePokemon();
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('psychoshift')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('fails if target already has status', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    const target = makePokemon({ status: 'par' as const });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('psychoshift')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.status).toBe('brn');
  });
});

describe('painsplit', () => {
  it('averages HP between user and target', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 30 });
    const target = makePokemon({ maxHp: 200, currentHp: 90 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('painsplit')!(ctx);

    expect(user.currentHp).toBe(60);
    expect(target.currentHp).toBe(60);
    // user gained 30 HP → heal event
    const healEvt = events.find(e => e.type === 'heal');
    expect(healEvt?.data['slotId']).toBe('slot-a1');
    expect(healEvt?.data['amount']).toBe(30);
    // target lost 30 HP → damage-dealt event
    const dmgEvt = events.find(e => e.type === 'damage-dealt');
    expect(dmgEvt?.data['slotId']).toBe('slot-b1');
    expect(dmgEvt?.data['damage']).toBe(30);
  });

  it('caps HP at max for each pokemon', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 50, currentHp: 10 });
    const target = makePokemon({ maxHp: 50, currentHp: 40 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('painsplit')!(ctx);

    expect(user.currentHp).toBe(25);
    expect(target.currentHp).toBe(25);
  });

  it('fails if user and target have equal HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const target = makePokemon({ maxHp: 100, currentHp: 50 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('painsplit')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('does not emit event for user when user HP is capped and does not change', () => {
    const state = make1v1State();
    // avg = floor((100+200)/2) = 150; user capped at maxHp=100 (no change), target goes to 150 (-50)
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const target = makePokemon({ maxHp: 300, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('painsplit')!(ctx);

    expect(user.currentHp).toBe(100); // capped at max, no change
    expect(target.currentHp).toBe(150); // lost 50 HP
    const dmgEvt = events.find(e => e.type === 'damage-dealt');
    expect(dmgEvt?.data['slotId']).toBe('slot-b1');
    expect(dmgEvt?.data['damage']).toBe(50);
    expect(events.some(e => e.type === 'heal')).toBe(false); // user unchanged, no heal
  });
});

describe('strengthsap', () => {
  it('heals user by target effective Atk and drops target Atk by 1', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('strengthsap')!(ctx);

    expect(user.currentHp).toBe(200);
    expect(target.statBoosts.atk).toBe(-1);
  });

  it('fails if target Atk is at -6', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ statBoosts: { atk: -6, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('strengthsap')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.currentHp).toBe(100);
  });
});

describe('healpulse', () => {
  it('heals the target (opponent in 1v1) by 50% max HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const target = makePokemon({ maxHp: 200, currentHp: 80 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('healpulse')!(ctx);

    expect(target.currentHp).toBe(180); // 80 + 100 (50% of 200)
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(100);
  });
});

describe('floralhealing', () => {
  it('heals target 50% max HP normally', () => {
    const state = make1v1State();
    const target = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('floralhealing')!(ctx);

    expect(target.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('heals target floor(2/3) in grassy terrain', () => {
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    const target = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('floralhealing')!(ctx);

    expect(target.currentHp).toBe(200); // floor(300 * 2/3) = 200
    expect(events[0]!.data['amount']).toBe(200);
  });
});

describe('lifedew', () => {
  it('heals user 25% max HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('lifedew')!(ctx);

    expect(user.currentHp).toBe(150);
    expect(events[0]!.data['amount']).toBe(50);
  });
});

describe('junglehealing', () => {
  it('heals user 25% and cures status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'psn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('junglehealing')!(ctx);

    expect(user.currentHp).toBe(150);
    expect(user.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('heals user 25% even if no status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('junglehealing')!(ctx);

    expect(user.currentHp).toBe(150);
  });
});

describe('lunarblessing', () => {
  it('heals user 25% and cures user status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('lunarblessing')!(ctx);

    expect(user.currentHp).toBe(150);
    expect(user.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });
});

describe('moonlight (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('heals floor(2/3) in sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(200); // floor(300 * 2/3) = 200
    expect(events[0]!.data['amount']).toBe(200);
  });

  it('heals floor(2/3) in harsh-sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(200);
  });

  it('heals 25% in rain', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(50); // floor(200 * 0.25) = 50
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('heals 25% in sand', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(50);
  });
});

describe('synthesis (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('synthesis')!(ctx);

    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('heals floor(2/3) in sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('synthesis')!(ctx);

    expect(user.currentHp).toBe(200);
    expect(events[0]!.data['amount']).toBe(200);
  });

  it('heals 25% in rain', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('synthesis')!(ctx);

    expect(user.currentHp).toBe(50);
    expect(events[0]!.data['amount']).toBe(50);
  });
});

describe('morningsun (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('morningsun')!(ctx);

    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('heals floor(2/3) in harsh-sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('morningsun')!(ctx);

    expect(user.currentHp).toBe(200);
    expect(events[0]!.data['amount']).toBe(200);
  });

  it('heals 25% in sand', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('morningsun')!(ctx);

    expect(user.currentHp).toBe(50);
    expect(events[0]!.data['amount']).toBe(50);
  });
});

describe('shoreup (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(100);
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('heals floor(2/3) in sand', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(200); // floor(300 * 2/3) = 200
    expect(events[0]!.data['amount']).toBe(200);
  });

  it('heals 25% in rain', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(50);
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('heals 50% in sun (not boosted for shoreup)', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(100); // sun doesn't boost shoreup, stays at 50%
  });

  it('heals 25% in harsh-sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(50); // 25% of 200 = 50
  });
});

describe('rest', () => {
  it('heals user to full HP and applies sleep with counter=2', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(user.currentHp).toBe(200);
    expect(user.status).toBe('slp');
    const sleepEntry = user.volatileStatus.find(v => v.name === 'sleep');
    expect(sleepEntry?.counter).toBe(2);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    expect(events.find(e => e.type === 'heal')?.data['amount']).toBe(100);
    expect(events.some(e => e.type === 'status-applied')).toBe(true);
  });

  it('clears an existing status before sleeping', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(user.status).toBe('slp');
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('fails if user is already asleep', () => {
    const state = make1v1State();
    const user = makePokemon({
      maxHp: 200, currentHp: 100,
      status: 'slp' as const,
      volatileStatus: [{ name: 'sleep', counter: 1 }],
    });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.currentHp).toBe(100);
  });

  it('fails if user HP is already full', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.status).toBeUndefined();
  });

  it('sets sleep counter to exactly 2 (not random)', () => {
    const state = make1v1State();
    for (let i = 0; i < 20; i++) {
      const user = makePokemon({ maxHp: 200, currentHp: 100 });
      state.teams[0]!.slots[0]!.party[0] = user;
      const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
      registry.get('rest')!(ctx);
      const sleepEntry = user.volatileStatus.find(v => v.name === 'sleep');
      expect(sleepEntry?.counter).toBe(2);
    }
  });

  it('clears toxic volatile when curing prior tox status', () => {
    const state = make1v1State();
    const user = makePokemon({
      maxHp: 200, currentHp: 100,
      status: 'tox' as const,
      volatileStatus: [{ name: 'toxic', counter: 3 }],
    });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('rest')!(ctx);

    expect(user.status).toBe('slp');
    expect(user.volatileStatus.some(v => v.name === 'toxic')).toBe(false);
  });
});

describe('healingwish', () => {
  it('faints the user and sets pendingHeal on the slot', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 100, currentHp: 80 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('healingwish')!(ctx);

    expect(user.fainted).toBe(true);
    expect(user.currentHp).toBe(0);
    expect(state.teams[0]!.slots[0]!.pendingHeal).toBe('healingwish');
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });

  it('fully heals the next pokemon that switches in', () => {
    const state = make1v1State();
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[1]!.slots[0]!.party[0] = foe;

    const active = makePokemon({ instanceId: 'p1', fainted: true, currentHp: 0 });
    // Use a very large maxHp so the bench is clearly at full after healing, even after taking foe damage
    const bench = makePokemon({ instanceId: 'p1-bench', maxHp: 10000, currentHp: 80 });
    state.teams[0]!.slots[0]!.party = [active, bench];
    state.teams[0]!.slots[0]!.pendingHeal = 'healingwish';

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const slot = newState.teams[0]!.slots[0]!;
    const incoming = slot.party[slot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    // Bench was healed to maxHp (10000) on switch-in; even after foe's attack it's well above original 80
    expect(incoming.currentHp).toBeGreaterThan(80);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    expect(slot.pendingHeal).toBeUndefined();
  });
});

describe('lunardance', () => {
  it('faints the user and sets pendingHeal=lunardance', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1' });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('lunardance')!(ctx);

    expect(user.fainted).toBe(true);
    expect(user.currentHp).toBe(0);
    expect(state.teams[0]!.slots[0]!.pendingHeal).toBe('lunardance');
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });

  it('restores HP and PP for the next switch-in', () => {
    const state = make1v1State();
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[1]!.slots[0]!.party[0] = foe;

    const active = makePokemon({ instanceId: 'p1', fainted: true, currentHp: 0 });
    // Use a very large maxHp so we can confirm healing even after foe's attack
    const bench = makePokemon({
      instanceId: 'p1-bench',
      maxHp: 10000,
      currentHp: 50,
      moves: [
        { moveId: 'flamethrower', currentPp: 0, maxPp: 15 },
        { moveId: 'airslash',     currentPp: 3, maxPp: 15 },
        { moveId: 'roost',        currentPp: 0, maxPp: 10 },
        { moveId: 'willowisp',    currentPp: 15, maxPp: 15 },
      ],
    });
    state.teams[0]!.slots[0]!.party = [active, bench];
    state.teams[0]!.slots[0]!.pendingHeal = 'lunardance';

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const slot = newState.teams[0]!.slots[0]!;
    const incoming = slot.party[slot.activePokemonIndex]!;
    // Bench was healed to maxHp on switch-in; even after foe's attack it's well above original 50
    expect(incoming.currentHp).toBeGreaterThan(50);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    // PP fully restored
    expect(incoming.moves[0]!.currentPp).toBe(15);
    expect(incoming.moves[1]!.currentPp).toBe(15);
    expect(incoming.moves[2]!.currentPp).toBe(10);
    expect(slot.pendingHeal).toBeUndefined();
  });
});
