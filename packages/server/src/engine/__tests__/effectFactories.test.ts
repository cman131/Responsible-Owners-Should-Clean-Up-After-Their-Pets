import { describe, it, expect, vi } from 'vitest';
import { statModSelf, statModTarget, multiStatModSelf } from '../effectFactories.js';
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
