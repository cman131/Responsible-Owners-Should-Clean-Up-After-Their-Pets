import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('lastMoveId tracking', () => {
  it('records the last move used by the attacker', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.lastMoveId).toBe('flamethrower');
  });
});
