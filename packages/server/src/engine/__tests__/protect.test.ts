import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

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
