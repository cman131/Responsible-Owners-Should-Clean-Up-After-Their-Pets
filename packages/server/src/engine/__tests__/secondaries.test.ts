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
