import { describe, it, expect } from 'vitest';
import { applySecondaries } from '../effects.js';
import type { SecondaryContext } from '../effects.js';
import { makePokemon } from './fixtures.js';
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
