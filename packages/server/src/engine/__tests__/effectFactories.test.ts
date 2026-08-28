import { describe, it, expect, vi } from 'vitest';
import { statModSelf, statModTarget, multiStatModSelf, applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent } from '../effectFactories.js';
import { makePokemon } from './fixtures.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { BattleState, Move } from '@poke-fighter/shared';

function makeCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  return {
    battle: null as unknown as BattleState,
    user: makePokemon(),
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [makePokemon()],
    targetSlotIds: ['slot-b1'],
    targetTypes: [['Normal']],
    move: { id: 'test', effectId: 'test' } as Move,
    ...overrides,
  };
}

describe('statModSelf', () => {
  it('boosts the user stat by the given stages', () => {
    const ctx = makeCtx();
    statModSelf('atk', 2)(ctx);
    expect(ctx.user.statBoosts.atk).toBe(2);
  });

  it('returns a stat-change event for userSlotId', () => {
    const ctx = makeCtx();
    const { events } = statModSelf('spa', 2)(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('stat-change');
    expect(events[0]!.data['slotId']).toBe('slot-a1');
  });

  it('does not affect targets', () => {
    const ctx = makeCtx();
    statModSelf('atk', 2)(ctx);
    expect(ctx.targets[0]!.statBoosts.atk).toBe(0);
  });
});

describe('statModTarget', () => {
  it('drops the target stat by the given stages', () => {
    const ctx = makeCtx();
    statModTarget('def', -1)(ctx);
    expect(ctx.targets[0]!.statBoosts.def).toBe(-1);
  });

  it('returns a stat-change event for targetSlotId', () => {
    const ctx = makeCtx();
    const { events } = statModTarget('def', -1)(ctx);
    expect(events[0]!.data['slotId']).toBe('slot-b1');
  });

  it('applies to every target when multiple are present', () => {
    const t1 = makePokemon();
    const t2 = makePokemon();
    const ctx = makeCtx({
      targets: [t1, t2],
      targetSlotIds: ['slot-b1', 'slot-b2'],
      targetTypes: [['Normal'], ['Normal']],
    });
    statModTarget('atk', -1)(ctx);
    expect(t1.statBoosts.atk).toBe(-1);
    expect(t2.statBoosts.atk).toBe(-1);
  });

  it('does not affect user', () => {
    const ctx = makeCtx();
    statModTarget('def', -1)(ctx);
    expect(ctx.user.statBoosts.def).toBe(0);
  });
});

describe('multiStatModSelf', () => {
  it('applies all boosts to the user in one call', () => {
    const ctx = makeCtx();
    multiStatModSelf({ atk: 1, spe: 1 })(ctx);
    expect(ctx.user.statBoosts.atk).toBe(1);
    expect(ctx.user.statBoosts.spe).toBe(1);
  });

  it('returns exactly one stat-change event', () => {
    const ctx = makeCtx();
    const { events } = multiStatModSelf({ spa: 1, spd: 1 })(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('stat-change');
  });

  it('handles negative stages (Shell Smash Def drop)', () => {
    const ctx = makeCtx();
    multiStatModSelf({ def: -1, atk: 2 })(ctx);
    expect(ctx.user.statBoosts.def).toBe(-1);
    expect(ctx.user.statBoosts.atk).toBe(2);
  });
});

describe('applyStatusTarget', () => {
  it('applies the status to a non-immune target', () => {
    const ctx = makeCtx({ targetTypes: [['Normal']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(ctx.targets[0]!.status).toBe('brn');
    expect(events[0]!.type).toBe('status-applied');
  });

  it('returns no events when target is type-immune (Fire immune to burn)', () => {
    const ctx = makeCtx({ targetTypes: [['Fire']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(events).toHaveLength(0);
    expect(ctx.targets[0]!.status).toBeUndefined();
  });

  it('returns no events when target already has a status', () => {
    const target = makePokemon({ status: 'par' });
    const ctx = makeCtx({ targets: [target], targetTypes: [['Normal']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(events).toHaveLength(0);
  });

  it('applies to each target independently', () => {
    const t1 = makePokemon();
    const t2 = makePokemon();
    const ctx = makeCtx({
      targets: [t1, t2],
      targetSlotIds: ['slot-b1', 'slot-b2'],
      targetTypes: [['Normal'], ['Normal']],
    });
    applyStatusTarget('par')(ctx);
    expect(t1.status).toBe('par');
    expect(t2.status).toBe('par');
  });
});

describe('applyVolatileTarget', () => {
  it('applies the volatile to the target', () => {
    const ctx = makeCtx();
    const { events } = applyVolatileTarget('confusion')(ctx);
    expect(ctx.targets[0]!.volatileStatus.find(v => v.name === 'confusion')).toBeDefined();
    expect(events[0]!.type).toBe('volatile-applied');
  });

  it('uses the explicit counter when provided (yawn counter = 2)', () => {
    const ctx = makeCtx();
    applyVolatileTarget('yawn', 2)(ctx);
    expect(ctx.targets[0]!.volatileStatus.find(v => v.name === 'yawn')?.counter).toBe(2);
  });

  it('returns no events when target already has that volatile', () => {
    const target = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 3 }] });
    const ctx = makeCtx({ targets: [target], targetTypes: [['Normal']] });
    const { events } = applyVolatileTarget('confusion')(ctx);
    expect(events).toHaveLength(0);
  });
});

describe('applyVolatileSelf', () => {
  it('applies the volatile to the user', () => {
    const ctx = makeCtx();
    const { events } = applyVolatileSelf('focus-energy')(ctx);
    expect(ctx.user.volatileStatus.find(v => v.name === 'focus-energy')).toBeDefined();
    expect(events[0]!.type).toBe('volatile-applied');
  });

  it('returns no events when user already has the volatile', () => {
    const user = makePokemon({ volatileStatus: [{ name: 'focus-energy', counter: 0 }] });
    const ctx = makeCtx({ user });
    const { events } = applyVolatileSelf('focus-energy')(ctx);
    expect(events).toHaveLength(0);
  });
});

describe('healPercent', () => {
  it('heals the user for the given fraction of max HP', () => {
    const user = makePokemon({ currentHp: 50, maxHp: 100 });
    const ctx = makeCtx({ user });
    const { events } = healPercent(0.5)(ctx);
    expect(user.currentHp).toBe(100);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('does not overheal beyond max HP', () => {
    const user = makePokemon({ currentHp: 90, maxHp: 100 });
    const ctx = makeCtx({ user });
    healPercent(0.5)(ctx);
    expect(user.currentHp).toBe(100);
  });

  it('returns no events when already at full HP', () => {
    const user = makePokemon({ currentHp: 100, maxHp: 100 });
    const ctx = makeCtx({ user });
    const { events } = healPercent(0.5)(ctx);
    expect(events).toHaveLength(0);
  });
});
