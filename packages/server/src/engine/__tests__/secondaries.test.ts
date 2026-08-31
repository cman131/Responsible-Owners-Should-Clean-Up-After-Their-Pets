import { describe, it, expect } from 'vitest';
import { applySecondaries } from '../effects.js';
import type { SecondaryContext } from '../effects.js';
import { makePokemon, make1v1State } from './fixtures.js';
import type { BattleState, PokemonType } from '@poke-fighter/shared';

const emptyBattle = { field: {} } as unknown as BattleState;

function makeCtx(overrides: Partial<SecondaryContext> = {}): SecondaryContext {
  return {
    secondaries: [],
    totalDamage: 50,
    user: makePokemon({ currentHp: 80, maxHp: 100 }),
    userSlotId: 'slot-a1',
    target: makePokemon({ ability: '', currentHp: 80, maxHp: 100 }),
    targetSlotId: 'slot-b1',
    targetTypes: ['Normal'] as PokemonType[],
    battle: emptyBattle,
    rng: Math.random,
    movedSlotIds: new Set<string>(),
    ...overrides,
  };
}

describe('applySecondaries — stat kind', () => {
  it('drops target def by 1 when rng roll succeeds', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'def', stages: -1, chance: 20, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    expect(ctx.target.statBoosts.def).toBe(-1);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('does not apply stat drop when rng roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'def', stages: -1, chance: 20, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.statBoosts.def).toBe(0);
  });

  it('boosts user spa when target is user', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'spa', stages: 1, chance: 70, target: 'user' }],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.user.statBoosts.spa).toBe(1);
  });
});

describe('applySecondaries — status kind', () => {
  it('burns target when roll succeeds', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 10, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    expect(ctx.target.status).toBe('brn');
    expect(events.some(e => e.type === 'status-applied')).toBe(true);
  });

  it('does not burn Fire-type target (type immunity)', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 100, target: 'target' }],
      targetTypes: ['Fire'] as PokemonType[],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.target.status).toBeUndefined();
  });

  it('does not apply when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 10, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.status).toBeUndefined();
  });
});

describe('applySecondaries — flinch kind', () => {
  it('adds flinch volatile when roll succeeds and target has not moved', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 30 }],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });

  it('does not flinch when target has already moved this turn', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 100 }],
      rng: () => 0,
      movedSlotIds: new Set(['slot-b1']),
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });

  it('does not flinch when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 30 }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });

  it('does not flinch a fainted target', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 100 }],
      rng: () => 0,
      target: makePokemon({ currentHp: 0, maxHp: 100, fainted: true }),
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });
});

describe('applySecondaries — confusion kind', () => {
  it('applies confusion volatile when roll succeeds', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'confusion', chance: 10, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
  });

  it('does not apply confusion when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'confusion', chance: 10, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });
});

describe('applySecondaries — drain kind', () => {
  it('heals user for half of totalDamage', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 80,
      user: makePokemon({ currentHp: 50, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(90);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    expect(events.find(e => e.type === 'heal')!.data['amount']).toBe(40);
  });

  it('caps heal at maxHp', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 100,
      user: makePokemon({ currentHp: 95, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(100);
    expect(events.find(e => e.type === 'heal')!.data['amount']).toBe(5);
  });

  it('emits no event when user is already at full HP', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 60,
      user: makePokemon({ currentHp: 100, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(events.some(e => e.type === 'heal')).toBe(false);
    expect(ctx.user.currentHp).toBe(100);
  });
});

describe('applySecondaries — recoil kind', () => {
  it('damages user for 1/3 of totalDamage', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil', fraction: [1, 3] }],
      totalDamage: 90,
      user: makePokemon({ currentHp: 80, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(50);
    expect(events.some(e => e.type === 'damage-dealt')).toBe(true);
    expect(events.find(e => e.type === 'damage-dealt')!.data['damage']).toBe(30);
  });

  it('faints user if recoil exceeds remaining HP', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil', fraction: [1, 3] }],
      totalDamage: 90,
      user: makePokemon({ currentHp: 20, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(0);
    expect(ctx.user.fainted).toBe(true);
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });
});

describe('applySecondaries — recoil-hp kind', () => {
  it('damages user for fraction of maxHp', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil-hp', fraction: [1, 4] }],
      totalDamage: 999,
      user: makePokemon({ currentHp: 100, maxHp: 100 }),
    });
    applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(75);
  });
});

describe('applySecondaries — selfdestruct kind (normal)', () => {
  it('faints the user and emits faint event', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'selfdestruct', variant: 'normal' }],
      user: makePokemon({ currentHp: 60, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(0);
    expect(ctx.user.fainted).toBe(true);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-a1')).toBe(true);
  });
});

describe('applySecondaries — selfdestruct kind (memento)', () => {
  it('faints user and drops target atk+spa by 2', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'selfdestruct', variant: 'memento' }],
    });
    applySecondaries(ctx);
    expect(ctx.user.fainted).toBe(true);
    expect(ctx.target.statBoosts.atk).toBe(-2);
    expect(ctx.target.statBoosts.spa).toBe(-2);
  });
});

describe('applySecondaries — recharge kind', () => {
  it('adds recharge volatile to user', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recharge' }],
    });
    applySecondaries(ctx);
    expect(ctx.user.volatileStatus.some(v => v.name === 'recharge')).toBe(true);
  });
});

function makeSecCtx(overrides: Partial<SecondaryContext> = {}): SecondaryContext {
  const state = make1v1State();
  return {
    secondaries: [],
    totalDamage: 50,
    user: state.teams[0]!.slots[0]!.party[0]!,
    userSlotId: 'slot-a1',
    target: state.teams[1]!.slots[0]!.party[0]!,
    targetSlotId: 'slot-b1',
    targetTypes: ['Normal'],
    battle: state,
    rng: () => 0,
    movedSlotIds: new Set(),
    ...overrides,
  };
}

describe('applySecondaries — clear-hazards-self', () => {
  it('clears Stealth Rock from the user side and emits hazard-cleared', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'clear-hazards-self' }],
    });
    ctx.battle.field.sideConditions[0]!.stealthRock = true;
    const events = applySecondaries(ctx);
    expect(ctx.battle.field.sideConditions[0]!.stealthRock).toBe(false);
    expect(events.some(e => e.type === 'hazard-cleared')).toBe(true);
  });

  it('clears all hazard types and emits an event for each', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'clear-hazards-self' }],
    });
    const side = ctx.battle.field.sideConditions[0]!;
    side.stealthRock = true;
    side.spikes = 3;
    side.toxicSpikes = 2;
    side.stickyWeb = true;
    const events = applySecondaries(ctx);
    expect(side.stealthRock).toBe(false);
    expect(side.spikes).toBe(0);
    expect(side.toxicSpikes).toBe(0);
    expect(side.stickyWeb).toBe(false);
    expect(events.filter(e => e.type === 'hazard-cleared')).toHaveLength(4);
  });

  it('grants +1 Spe to the user', () => {
    const ctx = makeSecCtx({ secondaries: [{ kind: 'clear-hazards-self' }] });
    applySecondaries(ctx);
    expect(ctx.user.statBoosts.spe).toBe(1);
  });

  it('does not fire when totalDamage is 0', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'clear-hazards-self' }],
      totalDamage: 0,
    });
    ctx.battle.field.sideConditions[0]!.stealthRock = true;
    applySecondaries(ctx);
    expect(ctx.battle.field.sideConditions[0]!.stealthRock).toBe(true); // unchanged
  });
});

describe('applySecondaries — break-screens', () => {
  it('removes Reflect and Light Screen from the target side (screensOnly: true)', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'break-screens', screensOnly: true }],
    });
    ctx.battle.field.sideConditions[1]!.reflect = 3;
    ctx.battle.field.sideConditions[1]!.lightScreen = 2;
    ctx.battle.field.sideConditions[1]!.auroraVeil = 4;
    const events = applySecondaries(ctx);
    expect(ctx.battle.field.sideConditions[1]!.reflect).toBe(0);
    expect(ctx.battle.field.sideConditions[1]!.lightScreen).toBe(0);
    expect(ctx.battle.field.sideConditions[1]!.auroraVeil).toBe(4); // not cleared by screensOnly
    expect(events.filter(e => e.type === 'screen-broken')).toHaveLength(2);
  });

  it('removes all three screens from the target side (screensOnly: false)', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'break-screens', screensOnly: false }],
    });
    ctx.battle.field.sideConditions[1]!.reflect = 3;
    ctx.battle.field.sideConditions[1]!.lightScreen = 2;
    ctx.battle.field.sideConditions[1]!.auroraVeil = 4;
    const events = applySecondaries(ctx);
    expect(ctx.battle.field.sideConditions[1]!.auroraVeil).toBe(0);
    expect(events.filter(e => e.type === 'screen-broken')).toHaveLength(3);
  });

  it('emits no events when no screens are active', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'break-screens', screensOnly: false }],
    });
    const events = applySecondaries(ctx);
    expect(events.filter(e => e.type === 'screen-broken')).toHaveLength(0);
  });

  it('does not fire when totalDamage is 0', () => {
    const ctx = makeSecCtx({
      secondaries: [{ kind: 'break-screens', screensOnly: false }],
      totalDamage: 0,
    });
    ctx.battle.field.sideConditions[1]!.reflect = 3;
    applySecondaries(ctx);
    expect(ctx.battle.field.sideConditions[1]!.reflect).toBe(3); // unchanged
  });
});
