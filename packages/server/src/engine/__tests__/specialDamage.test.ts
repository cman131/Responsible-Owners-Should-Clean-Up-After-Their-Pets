import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('lastDamageTaken tracking', () => {
  it('records physical damage on the target (target does not move this turn)', () => {
    const state = make1v1State();
    // Override p1's first move to tackle (physical) since default is flamethrower (special)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    // p2 does NOT take any action this turn so its lastDamageTaken is not cleared

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // slot-b1 submits no action
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeDefined();
    expect(p2.lastDamageTaken!.category).toBe('physical');
    expect(p2.lastDamageTaken!.amount).toBeGreaterThan(0);
    expect(p2.lastDamageTaken!.fromSlotId).toBe('slot-a1');
  });

  it('records special damage on the target (target does not move this turn)', () => {
    const state = make1v1State();
    // p1's default move is flamethrower (special), keep it
    // p2 does NOT take any action this turn

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // slot-b1 submits no action
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeDefined();
    expect(p2.lastDamageTaken!.category).toBe('special');
    expect(p2.lastDamageTaken!.amount).toBeGreaterThan(0);
    expect(p2.lastDamageTaken!.fromSlotId).toBe('slot-a1');
  });

  it('clears lastDamageTaken from the attacker at the start of their move', () => {
    const state = make1v1State();
    // p1 will move first (spe=100 > p2 spe=80)
    // Give p1 a status move (roost) so p2 does NOT get hit by p1, meaning p2's lastDamageTaken
    // should be cleared when p2 moves (p2 uses flamethrower on p1).
    // Pre-populate lastDamageTaken on p2 (the attacker who moves second)
    state.teams[1]!.slots[0]!.party[0]!.lastDamageTaken = {
      amount: 99,
      category: 'physical',
      fromSlotId: 'slot-a1',
    };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      // p1 uses roost (status, self-targeting) — does not deal damage to p2
      'slot-a1': { type: 'move', moveIndex: 2, targetSlotId: 'slot-a1' },
      // p2 uses flamethrower on p1 — p2 is the attacker, so p2's lastDamageTaken should be cleared
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // p2 executed a move, so their lastDamageTaken should have been cleared (deleted) at
    // the start of their move execution. Since nobody hit p2 this turn, it should remain undefined.
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeUndefined();
  });
});
