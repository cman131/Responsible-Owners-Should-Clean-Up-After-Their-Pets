import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';
import { protect } from '../effectFactories.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { Move } from '@poke-fighter/shared';

describe('switch clears volatiles', () => {
  it('clears confusion on switch-out', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.volatileStatus.push({ name: 'confusion', counter: 3 });

    const p2slot = state.teams[0]!.slots[0]!;
    const bench = makePokemon({ instanceId: 'bench-mon' });
    p2slot.party.push(bench);

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'bench-mon' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const switchedOut = newState.teams[0]!.slots[0]!.party[0]!;
    expect(switchedOut.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('resets statBoosts to zero on switch-out', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.statBoosts.atk = 3;
    p1.lastMoveId = 'swordsdance';

    const bench = makePokemon({ instanceId: 'bench2' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'bench2' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const switchedOut = newState.teams[0]!.slots[0]!.party[0]!;
    expect(switchedOut.statBoosts.atk).toBe(0);
    expect(switchedOut.lastMoveId).toBeUndefined();
  });
});

function makeProtectCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  const user = makePokemon();
  return {
    battle: make1v1State(),
    user,
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [],
    targetSlotIds: [],
    targetTypes: [],
    move: { id: 'protect', name: 'Protect', category: 'status', type: 'Normal', basePower: 0, accuracy: true, pp: 10, priority: 4, target: 'self', makesContact: false } as Move,
    rng: () => 0.5,
    ...overrides,
  };
}

describe('protect factory', () => {
  it('first use always succeeds (no streak)', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.99 }); // high roll, should still succeed
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect-streak')).toBe(true);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect-streak')?.counter).toBe(1);
  });

  it('second consecutive use fails when rng >= 1/3', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.5 }); // 0.5 >= 1/3, so fails
    ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect')).toBe(false);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect-streak')).toBe(false);
  });

  it('second consecutive use succeeds when rng < 1/3', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.1 }); // 0.1 < 1/3
    ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect-streak')?.counter).toBe(2);
  });

  it('protect variant stored on volatile', () => {
    const handler = protect('kingsshield');
    const ctx = makeProtectCtx({ rng: () => 0 });
    handler(ctx);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect')?.variant).toBe('kingsshield');
  });
});
