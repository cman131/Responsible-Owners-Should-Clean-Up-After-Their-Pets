import { describe, it, expect } from 'vitest';
import { BattleConfigurator } from '../BattleConfigurator.js';
import { STARTING_WEATHERS, type PokemonSet, type StartingWeather } from '@poke-fighter/shared';

const mockSet: PokemonSet = {
  speciesId: 6, level: 50, ability: 'blaze',
  nickname: 'Charizard',
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
      battleId: 'x', label: 'x',
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
      ],
    });
    // Charizard base HP=78, L50, 0 EVs, 31 IVs: floor((2*78+31+0)*50/100)+50+10 = 153
    expect(state.teams[0]!.slots[0]!.party[0]!.maxHp).toBe(153);
  });

  it('sets growthRate from species data', () => {
    const config = new BattleConfigurator();
    const state = config.build({
      battleId: 'x', label: 'x',
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
      ],
    });
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    const validGrowthRates = ['Erratic', 'Fast', 'MediumFast', 'MediumSlow', 'Slow', 'Fluctuating'];
    expect(validGrowthRates).toContain(mon.growthRate);
  });

  describe('levelCap', () => {
    const level100Set: PokemonSet = {
      speciesId: 6, level: 100, ability: 'blaze',
      nickname: 'Charizard',
      moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'hardy',
    };

    function buildWith(set: PokemonSet, levelCap?: number) {
      const teams: [{ slots: Array<{ slotId: string; displayName: string; isNpc: boolean; party: PokemonSet[] }> }, { slots: Array<{ slotId: string; displayName: string; isNpc: boolean; party: PokemonSet[] }> }] = [
        { slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, party: [set] }] },
        { slots: [{ slotId: 'b1', displayName: 'B', isNpc: true, party: [set] }] },
      ];
      const baseConfig = {
        battleId: 'x',
        label: 'x',
        teams,
      };
      if (levelCap !== undefined) {
        return new BattleConfigurator().build({ ...baseConfig, levelCap });
      }
      return new BattleConfigurator().build(baseConfig);
    }

    it('clamps level and stats when levelCap is below set level', () => {
      const state = buildWith(level100Set, 50);
      const member = state.teams[0]!.slots[0]!.party[0]!;
      expect(member.level).toBe(50);
      // Charizard base HP=78, L50, 0 EVs, 31 IVs: floor((2*78+31)*50/100)+50+10 = 153
      expect(member.maxHp).toBe(153);
      expect(member.currentHp).toBe(153);
    });

    it('does not upscale when levelCap is above set level', () => {
      const state = buildWith({ ...level100Set, level: 50 }, 100);
      const member = state.teams[0]!.slots[0]!.party[0]!;
      expect(member.level).toBe(50);
      expect(member.maxHp).toBe(153);
    });

    it('uses set level when no levelCap is given', () => {
      const state = buildWith(level100Set);
      const member = state.teams[0]!.slots[0]!.party[0]!;
      expect(member.level).toBe(100);
      // Charizard base HP=78, L100, 0 EVs, 31 IVs: floor((2*78+31)*100/100)+100+10 = 297
      expect(member.maxHp).toBe(297);
    });
  });
});

describe('BattleConfigurator saved condition', () => {
  const build = (isNpc: boolean) => new BattleConfigurator().build({
    battleId: 'x', label: 'x',
    teams: [
      { slots: [{
        slotId: 'a1', displayName: 'Ash', isNpc, profileId: 'p1',
        party: [{ ...mockSet, pokemonId: 'a' }, { ...mockSet, pokemonId: 'b' }],
        conditions: new Map([
          ['a', { currentHp: 0, maxHp: 153, ppUsed: {} }],
          ['b', { currentHp: 20, maxHp: 153, status: 'par' as const, ppUsed: { flamethrower: 4 } }],
        ]),
      }] },
      { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [mockSet] }] },
    ],
  }).teams[0]!.slots[0]!;

  it('applies condition and leads with the first healthy Pokémon', () => {
    const slot = build(false);
    expect(slot.party[0]!.fainted).toBe(true);
    expect(slot.party[1]!).toMatchObject({ currentHp: 20, status: 'par', pokemonId: 'b', ownerProfileId: 'p1' });
    expect(slot.party[1]!.moves[0].currentPp).toBe(slot.party[1]!.moves[0].maxPp - 4);
    expect(slot.activePokemonIndex).toBe(1);
  });

  it('does not track NPCs', () => {
    const slot = build(true);
    expect(slot.party[0]!.fainted).toBe(false);
    expect(slot.party[0]!.ownerProfileId).toBeUndefined();
    expect(slot.activePokemonIndex).toBe(0);
  });
});

describe('BattleConfigurator starting weather', () => {
  const buildWithWeather = (weather?: StartingWeather) => new BattleConfigurator().build({
    battleId: 'x', label: 'x',
    teams: [
      { slots: [{ slotId: 'a1', displayName: 'A', isNpc: true, party: [mockSet] }] },
      { slots: [{ slotId: 'b1', displayName: 'B', isNpc: true, party: [mockSet] }] },
    ],
    ...(weather !== undefined ? { weather } : {}),
  });

  it.each(STARTING_WEATHERS)('starts in indefinite %s', (weather) => {
    expect(buildWithWeather(weather).field.weather).toEqual({
      type: weather, turnsRemaining: 0, fromAbility: false, indefinite: true,
    });
  });

  it('leaves weather unset when none is chosen', () => {
    expect(buildWithWeather().field).not.toHaveProperty('weather');
  });
});
