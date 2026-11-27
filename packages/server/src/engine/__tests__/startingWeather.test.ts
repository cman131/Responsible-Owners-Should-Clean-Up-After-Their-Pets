import { describe, it, expect } from 'vitest';
import type { BattleState } from '@poke-fighter/shared';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

const ROOST = { type: 'move' as const, moveIndex: 2 };
const engine = new BattleEngine({ rng: () => 0.5 });

function stateWithStartingWeather(): BattleState {
  const state = make1v1State();
  state.field.weather = { type: 'sand', turnsRemaining: 0, fromAbility: false, indefinite: true };
  return state;
}

function idleTurns(state: BattleState, count: number): BattleState {
  let current = state;
  for (let i = 0; i < count; i++) {
    current = engine.resolveTurn(current, { 'slot-a1': ROOST, 'slot-b1': ROOST }).newState;
  }
  return current;
}

describe('indefinite starting weather', () => {
  it('lasts across many turns', () => {
    const after = idleTurns(stateWithStartingWeather(), 6);
    expect(after.field.weather).toMatchObject({ type: 'sand', indefinite: true });
  });

  it('is replaced by a weather move, which then expires to clear skies', () => {
    const state = stateWithStartingWeather();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'raindance', currentPp: 5, maxPp: 5 };
    const replaced = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': ROOST,
    }).newState;
    expect(replaced.field.weather).toEqual({ type: 'rain', turnsRemaining: 4, fromAbility: false });
    expect(idleTurns(replaced, 4).field.weather).toBeUndefined();
  });

  it('is replaced by a weather ability, which then expires to clear skies', () => {
    const state = stateWithStartingWeather();
    state.teams[0]!.slots[0]!.party.push(makePokemon({ instanceId: 'p1-bench', ability: 'drought' }));
    const replaced = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': ROOST,
    }).newState;
    expect(replaced.field.weather).toEqual({ type: 'sun', turnsRemaining: 4, fromAbility: true });
    expect(idleTurns(replaced, 4).field.weather).toBeUndefined();
  });
});
