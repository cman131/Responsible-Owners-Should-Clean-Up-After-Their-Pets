import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

function actions(aIdx = 0, bIdx = 0): Record<string, MoveAction> {
  return {
    'slot-a1': { type: 'move', moveIndex: aIdx, targetSlotId: 'slot-b1' },
    'slot-b1': { type: 'move', moveIndex: bIdx, targetSlotId: 'slot-a1' },
  };
}

describe('Outrage / Petaldance / Thrash lock mechanics', () => {
  it('applies outrage-active volatile on first use', () => {
    const engine = new BattleEngine({ rng: () => 0.4 }); // rng<0.5 → 2 turns
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, actions());

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const lockV = p1.volatileStatus.find((v: any) => v.name === 'outrage-active');
    expect(lockV).toBeDefined();
    expect(events.some(e => e.type === 'volatile-applied' && (e.data as any)['volatile'] === 'outrage-active')).toBe(true);
  });

  it('applies confusion and clears volatile when outrage sequence ends', () => {
    const engine = new BattleEngine({ rng: () => 0.4 }); // 2-turn sequence
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };
    // Pre-set the volatile as if it's the final turn (counter=1 means 1 remaining, will hit 0 this turn)
    (state.teams[0]!.slots[0]!.party[0]!.volatileStatus as any[]).push({
      name: 'outrage-active', moveId: 'outrage', counter: 1,
    });

    const { newState, events } = engine.resolveTurn(state, actions());

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some((v: any) => v.name === 'outrage-active')).toBe(false);
    expect(p1.volatileStatus.some((v: any) => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any)['volatile'] === 'outrage-active')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied' && (e.data as any)['volatile'] === 'confusion')).toBe(true);
  });

  it('locks user into outrage on second turn regardless of chosen move', () => {
    const engine = new BattleEngine({ rng: () => 0.4 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    (state.teams[0]!.slots[0]!.party[0]!.volatileStatus as any[]).push({
      name: 'outrage-active', moveId: 'outrage', counter: 1,
    });

    // Player tries to use flamethrower (move index 1) but is locked
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const moveUsed = events.find(e => e.type === 'move-used' && (e.data as any)['attackerSlotId'] === 'slot-a1');
    expect((moveUsed!.data as any)['moveId']).toBe('outrage');
  });

  it('thrash and petaldance behave identically to outrage', () => {
    for (const moveId of ['thrash', 'petaldance']) {
      const engine = new BattleEngine({ rng: () => 0.4 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId, currentPp: 10, maxPp: 10 };
      (state.teams[0]!.slots[0]!.party[0]!.volatileStatus as any[]).push({
        name: `${moveId}-active`, moveId, counter: 1,
      });

      const { newState } = engine.resolveTurn(state, actions());
      const p1 = newState.teams[0]!.slots[0]!.party[0]!;
      expect(p1.volatileStatus.some((v: any) => v.name === 'confusion')).toBe(true);
    }
  });
});
