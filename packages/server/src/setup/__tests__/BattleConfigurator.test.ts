import { describe, it, expect } from 'vitest';
import { BattleConfigurator } from '../BattleConfigurator.js';
import type { PokemonSet } from '@poke-fighter/shared';

const mockSet: PokemonSet = {
  speciesId: 6, level: 50, ability: 'blaze',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('BattleConfigurator', () => {
  it('builds a valid BattleState from a slot configuration', () => {
    const config = new BattleConfigurator();
    const state = config.build({
      battleId: 'test-battle',
      label: 'Test',
      turnTimerSeconds: 60,
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [mockSet] }] },
      ],
    });

    expect(state.battleId).toBe('test-battle');
    expect(state.teams[0]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(0);
    expect(state.teams[0]!.slots[0]!.party[0]!.moves).toHaveLength(4);
    expect(state.teams[0]!.slots[0]!.party[0]!.stats.spe).toBeGreaterThan(0);
  });

  it('calculates correct HP from EVs/IVs/nature', () => {
    const config = new BattleConfigurator();
    const state = config.build({
      battleId: 'x', label: 'x', turnTimerSeconds: 60,
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
      ],
    });
    // Charizard base HP=78, L50, 0 EVs, 31 IVs: floor((2*78+31+0)*50/100)+50+10 = 153
    expect(state.teams[0]!.slots[0]!.party[0]!.maxHp).toBe(153);
  });
});
