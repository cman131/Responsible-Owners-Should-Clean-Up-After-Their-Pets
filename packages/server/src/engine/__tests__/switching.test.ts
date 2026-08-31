import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

function makeStateWithBench() {
  const state = make1v1State();
  // Give slot-a1 a bench member so a switch is valid
  const bench = makePokemon({ instanceId: 'p1-bench' });
  state.teams[0]!.slots[0]!.party.push(bench);
  return state;
}

describe('switch-out cleanup', () => {
  it('clears confusion volatile on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'confusion' }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('resets stat boosts on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 3;
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.statBoosts.atk).toBe(0);
  });

  it('toxic counter volatile persists through switch-out (Gen 5+ behavior)', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.status = 'tox';
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'toxic', counter: 3 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    const toxEntry = outgoing.volatileStatus.find(v => v.name === 'toxic');
    expect(toxEntry).toBeDefined();
    expect(toxEntry!.counter).toBe(3);
  });
});
