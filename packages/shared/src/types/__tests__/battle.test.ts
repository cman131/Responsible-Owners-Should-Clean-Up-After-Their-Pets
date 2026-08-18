import { describe, it, expectTypeOf } from 'vitest';
import type { BattleState, SlotState, PartyMember, StatBoosts } from '../battle.js';

describe('BattleState type', () => {
  it('has two teams', () => {
    expectTypeOf<BattleState>().toHaveProperty('teams');
    expectTypeOf<BattleState['teams']>().toEqualTypeOf<[import('../battle.js').TeamState, import('../battle.js').TeamState]>();
  });

  it('PartyMember has stat boosts', () => {
    expectTypeOf<PartyMember>().toHaveProperty('statBoosts');
  });
});
