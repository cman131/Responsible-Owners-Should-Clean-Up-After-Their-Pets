import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { applyStatus } from '../effects.js';
import { make1v1State, makePokemon } from './fixtures.js';

describe('sleep counter', () => {
  it('survives switching out', () => {
    const state = make1v1State();
    const slot = state.teams[0]!.slots[0]!;
    slot.party[0]!.status = 'slp';
    slot.party[0]!.volatileStatus = [{ name: 'sleep', counter: 2 }];
    slot.party.push(makePokemon({ instanceId: 'bench' }));

    const result = new BattleEngine().processForceSwitch(state, 'slot-a1', 'bench', 'forced');

    const switchedOut = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(switchedOut.status).toBe('slp');
    expect(switchedOut.volatileStatus).toContainEqual({ name: 'sleep', counter: 2 });
  });

  it('replaces a stale entry when sleep is applied again', () => {
    const mon = makePokemon({ ability: '', volatileStatus: [{ name: 'sleep', counter: 0 }] });

    applyStatus(mon, 'slot-a1', 'slp', ['Normal']);

    const entries = mon.volatileStatus.filter((v) => v.name === 'sleep');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.counter).toBeGreaterThanOrEqual(1);
  });
});
