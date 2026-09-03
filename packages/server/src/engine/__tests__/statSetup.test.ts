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

// ── Simple single-stat boosts ─────────────────────────────────────────────────

describe('rockpolish', () => {
  it('raises spe by 2', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('rockpolish', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spe).toBe(2);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('tailglow', () => {
  it('raises spa by 3', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('tailglow', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spa).toBe(3);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('howl', () => {
  it('raises atk by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('howl', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('meditate', () => {
  it('raises atk by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('meditate', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('sharpen', () => {
  it('raises atk by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('sharpen', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('harden', () => {
  it('raises def by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('harden', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('defensecurl', () => {
  it('raises def by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('defensecurl', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('withdraw', () => {
  it('raises def by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('withdraw', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('cottonguard', () => {
  it('raises def by 3', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('cottonguard', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(3);
    expect(events[0]!.type).toBe('stat-change');
  });
});

// ── Multi-stat self boosts ────────────────────────────────────────────────────

describe('growth', () => {
  it('raises atk and spa by 1 each', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('growth', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.spa).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('workup', () => {
  it('raises atk and spa by 1 each', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('workup', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.spa).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('cosmicpower', () => {
  it('raises def and spd by 1 each', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('cosmicpower', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('shiftgear', () => {
  it('raises spe by 2 and atk by 1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('shiftgear', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spe).toBe(2);
    expect(user.statBoosts.atk).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('geomancy', () => {
  it('raises spa, spd, and spe by 2 each', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('geomancy', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spa).toBe(2);
    expect(user.statBoosts.spd).toBe(2);
    expect(user.statBoosts.spe).toBe(2);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('victorydance', () => {
  it('raises atk, def, and spe by 1 each', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('victorydance', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.def).toBe(1);
    expect(user.statBoosts.spe).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('autotomize', () => {
  it('raises spe by 2', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('autotomize', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spe).toBe(2);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('filletaway', () => {
  it('costs half current HP and boosts atk/spa/spe by +2', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('filletaway', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(50);
    expect(user.statBoosts.atk).toBe(2);
    expect(user.statBoosts.spa).toBe(2);
    expect(user.statBoosts.spe).toBe(2);
    expect(events[0]!.type).toBe('damage-dealt');
    expect(events[1]!.type).toBe('stat-change');
  });

  it('fails if currentHp is 1', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 1 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('filletaway', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect(user.currentHp).toBe(1);
  });
});

describe('clangoroussoul', () => {
  it('costs floor(maxHp/3) HP and boosts all five stats by +1', () => {
    const user = makePokemon({ maxHp: 150, currentHp: 150 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('clangoroussoul', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(100);
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.def).toBe(1);
    expect(user.statBoosts.spa).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(user.statBoosts.spe).toBe(1);
    expect(events[0]!.type).toBe('damage-dealt');
    expect((events[0]! as any).data.damage).toBe(50);
    expect((events[0]! as any).data.remainingHp).toBe(100);
    expect(events[1]!.type).toBe('stat-change');
  });

  it('fails if currentHp is at or below floor(maxHp/3)', () => {
    const user = makePokemon({ maxHp: 150, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('clangoroussoul', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect(user.currentHp).toBe(50);
  });
});

describe('bellydrum', () => {
  it('costs 50% max HP and sets atk to +6', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('bellydrum', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(50);
    expect(user.statBoosts.atk).toBe(6);
    expect(events[0]!.type).toBe('damage-dealt');
    expect(events[1]!.type).toBe('stat-change');
  });

  it('fails if HP is at or below 50% of max', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('bellydrum', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect(user.currentHp).toBe(50);
  });

  it('fails if atk is already +6', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100, statBoosts: { atk: 6, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('bellydrum', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect(user.currentHp).toBe(100);
  });
});
