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

describe('protect blocks status moves', () => {
  it('blocks Toxic from applying through protect', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'protect' });

    const attacker = state.teams[0]!.slots[0]!.party[0]!;
    attacker.moves[0] = { moveId: 'toxic', currentPp: 10, maxPp: 10 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'protect')).toBe(true);
    const defenderAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defenderAfter.status).toBeUndefined();
  });
});

describe('protect blocks damaging moves', () => {
  it('blocks an incoming physical move when protect is active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'protect' });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'protect')).toBe(true);
    expect(events.some(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1')).toBe(false);
  });

  it('Spiky Shield deals 1/8 HP damage to contact-move attacker', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'spikyshield' });

    const attacker = state.teams[0]!.slots[0]!.party[0]!;
    attacker.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked')).toBe(true);
    const attackerAfter = newState.teams[0]!.slots[0]!.party[0]!;
    expect(attackerAfter.currentHp).toBeLessThan(100); // took recoil
  });
});

describe('protect end-of-turn removal', () => {
  it('protect volatile is removed at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.volatileStatus.push({ name: 'protect', variant: 'protect' });
    p1.volatileStatus.push({ name: 'protect-streak', counter: 1 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.volatileStatus.some(v => v.name === 'protect')).toBe(false);
    // streak persists across turns
    expect(p1After.volatileStatus.some(v => v.name === 'protect-streak')).toBe(true);
  });
});

describe('endure', () => {
  it('leaves user at 1 HP when lethal damage would faint it', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'endure' });
    defender.currentHp = 1; // already at 1, incoming damage would KO

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'hyperbeam', currentPp: 5, maxPp: 5 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(1);
    expect(defAfter.fainted).toBe(false);
    expect(events.some(e => e.type === 'endure-survived')).toBe(true);
  });
});
