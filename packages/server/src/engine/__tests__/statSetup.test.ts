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
  it('raises atk and spa by +1 with no weather', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('growth', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.spa).toBe(1);
  });

  it('raises atk and spa by +2 in sun', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('growth', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(2);
    expect(user.statBoosts.spa).toBe(2);
  });

  it('raises atk and spa by +2 in harsh-sun', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0] = user;
    invoke('growth', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(2);
    expect(user.statBoosts.spa).toBe(2);
  });

  it('raises by +1 in rain (not sun)', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0] = user;
    invoke('growth', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.atk).toBe(1);
    expect(user.statBoosts.spa).toBe(1);
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
  it('on turn 1 adds geomancy-charge volatile and does not boost stats', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('geomancy', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.volatileStatus.some(v => v.name === 'geomancy-charge')).toBe(true);
    expect(user.statBoosts.spa).toBe(0);
    expect(events.some(e => e.type === 'stat-change')).toBe(false);
  });

  it('on turn 2 applies +2 to spa/spd/spe and removes charge volatile', () => {
    const user = makePokemon({ volatileStatus: [{ name: 'geomancy-charge' }] });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('geomancy', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spa).toBe(2);
    expect(user.statBoosts.spd).toBe(2);
    expect(user.statBoosts.spe).toBe(2);
    expect(user.volatileStatus.some(v => v.name === 'geomancy-charge')).toBe(false);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('with Power Herb boosts immediately without charging', () => {
    const user = makePokemon({ heldItem: 'power-herb' });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('geomancy', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spa).toBe(2);
    expect(user.statBoosts.spd).toBe(2);
    expect(user.statBoosts.spe).toBe(2);
    expect(user.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed')).toBe(true);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
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

describe('acupressure', () => {
  it('boosts a random eligible stat by +2 (rng=0 → atk)', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('acupressure', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      rng: () => 0,  // selects first eligible = atk
    });
    expect(user.statBoosts.atk).toBe(2);
    expect(events[0]!.type).toBe('stat-change');
  });

  it('fails if all stats are at +6', () => {
    const user = makePokemon({
      statBoosts: { atk: 6, def: 6, spa: 6, spd: 6, spe: 6, accuracy: 6, evasion: 6 }
    });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('acupressure', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('skips already-maxed stats (rng=0 with atk=6 → selects def)', () => {
    const user = makePokemon({
      statBoosts: { atk: 6, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }
    });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('acupressure', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      rng: () => 0,  // first eligible with atk excluded = def
    });
    expect(user.statBoosts.def).toBe(2);
    expect(user.statBoosts.atk).toBe(6); // unchanged
  });
});

describe('takeheart', () => {
  it('clears user status and boosts spa and spd by +1', () => {
    const user = makePokemon({ status: 'brn' as const });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('takeheart', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.status).toBeUndefined();
    expect(user.statBoosts.spa).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(events[0]!.type).toBe('status-cured');
    expect((events[0]! as any).data.status).toBe('brn');
    expect(events[1]!.type).toBe('stat-change');
  });

  it('boosts spa and spd even with no status', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('takeheart', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.spa).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
    expect(events.every(e => e.type !== 'move-failed')).toBe(true);
  });
});

describe('stockpile', () => {
  it('adds stockpile volatile with counter=1 and raises def/spd by +1', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('stockpile', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    const stockpile = user.volatileStatus.find(v => v.name === 'stockpile');
    expect(stockpile).toBeDefined();
    expect(stockpile!.counter).toBe(1);
    expect(user.statBoosts.def).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('increments counter on second use (counter=2)', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    user.volatileStatus.push({ name: 'stockpile', counter: 1 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    invoke('stockpile', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    const stockpile = user.volatileStatus.find(v => v.name === 'stockpile');
    expect(stockpile!.counter).toBe(2);
  });

  it('increments counter on third use (counter=3)', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    user.volatileStatus.push({ name: 'stockpile', counter: 2 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    invoke('stockpile', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    const stockpile = user.volatileStatus.find(v => v.name === 'stockpile');
    expect(stockpile!.counter).toBe(3);
  });

  it('fails on fourth use (already at 3)', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    user.volatileStatus.push({ name: 'stockpile', counter: 3 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('stockpile', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect((events[0]! as any).data.reason).toBe('max-stockpile');
    // counter should remain at 3
    const stockpile = user.volatileStatus.find(v => v.name === 'stockpile');
    expect(stockpile!.counter).toBe(3);
  });
});

describe('swallow', () => {
  it('heals floor(1/3 maxHp) at count=1 and removes stockpile', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 10 });
    user.volatileStatus.push({ name: 'stockpile', counter: 1 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('swallow', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(10 + Math.floor(100 * 1 / 3)); // 10 + 33 = 43
    expect(user.volatileStatus.find(v => v.name === 'stockpile')).toBeUndefined();
    expect(events.some(e => e.type === 'heal')).toBe(true);
    const healEvent = events.find(e => e.type === 'heal') as any;
    expect(healEvent.data.amount).toBe(33);
  });

  it('heals floor(2/3 maxHp) at count=2 and removes stockpile', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 10 });
    user.volatileStatus.push({ name: 'stockpile', counter: 2 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('swallow', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(10 + Math.floor(100 * 2 / 3)); // 10 + 66 = 76
    expect(user.volatileStatus.find(v => v.name === 'stockpile')).toBeUndefined();
    const healEvent = events.find(e => e.type === 'heal') as any;
    expect(healEvent.data.amount).toBe(66);
  });

  it('heals 100% maxHp at count=3 and removes stockpile', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 10 });
    user.volatileStatus.push({ name: 'stockpile', counter: 3 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('swallow', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(100);
    expect(user.volatileStatus.find(v => v.name === 'stockpile')).toBeUndefined();
    const healEvent = events.find(e => e.type === 'heal') as any;
    expect(healEvent.data.amount).toBe(90); // heals from 10 to 100
  });

  it('fails with no stockpile', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('swallow', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(events[0]!.type).toBe('move-failed');
    expect((events[0]! as any).data.reason).toBe('no-stockpile');
  });
});

describe('defendorder', () => {
  it('raises def and spd by +1', () => {
    const user = makePokemon();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('defendorder', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.statBoosts.def).toBe(1);
    expect(user.statBoosts.spd).toBe(1);
    expect(events[0]!.type).toBe('stat-change');
  });
});

describe('healorder', () => {
  it('heals 50% of max HP', () => {
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('healorder', { battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 });
    expect(user.currentHp).toBe(200);
    expect(events[0]!.type).toBe('heal');
  });
});

describe('laserfocus', () => {
  it('guarantees a crit on the next attack', () => {
    const state = make1v1State();
    // p1 uses laserfocus move slot 0, has a damaging move in slot 1
    state.teams[0]!.slots[0]!.party[0]!.moves = [
      { moveId: 'laserfocus', currentPp: 5, maxPp: 5 },
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
    ];
    // p2 uses any move
    state.teams[1]!.slots[0]!.party[0]!.moves = [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
    ];

    const engine = new BattleEngine({ rng: () => 0.5 });

    // Turn 1: p1 uses laserfocus
    const { newState: s1 } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Verify laser-focus volatile is set
    const p1 = s1.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'laser-focus')).toBe(true);

    // Turn 2: p1 uses flamethrower
    const { events: t2Events } = engine.resolveTurn(s1, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Expect a crit event on the turn p1 attacks
    expect(t2Events.some(e => e.type === 'crit')).toBe(true);
  });
});
