import { describe, it, expect } from 'vitest';
import { getSlotReadiness } from '../slotReadiness.js';

const slot = {
  type: 'player' as const, displayName: 'Ash', profileId: 'p1',
  defaultTeam: [{ pokemonId: 'a' }, { pokemonId: 'b' }] as any,
};
const mon = (pokemonId: string, currentHp: number) => ({ pokemonId, currentHp, maxHp: 100, moves: [] });
const health = (pokemon: ReturnType<typeof mon>[], inBattle = false) => ({ profileId: 'p1', inBattle, pokemon });

describe('getSlotReadiness', () => {
  it('summarises a partly hurt team', () => {
    expect(getSlotReadiness(slot, [slot], health([mon('a', 0), mon('b', 40)])))
      .toEqual({ blocker: null, summary: '1 hurt, 1 fainted' });
  });
  it('blocks a fully fainted team, ignoring healthy bank Pokémon', () => {
    expect(getSlotReadiness(slot, [slot], health([mon('a', 0), mon('b', 0), mon('bank', 100)])).blocker).toMatch(/no usable/i);
  });
  it('blocks a player in a battle', () => {
    expect(getSlotReadiness(slot, [slot], health([mon('a', 100), mon('b', 100)], true)).blocker).toMatch(/already in a battle/i);
  });
  it('blocks a player in two slots', () => {
    expect(getSlotReadiness(slot, [slot, { ...slot }], undefined).blocker).toMatch(/more than one slot/i);
  });
  it('ignores NPCs', () => {
    const npc = { ...slot, type: 'npc' as const };
    expect(getSlotReadiness(npc, [npc, npc], undefined)).toEqual({ blocker: null, summary: null });
  });
});
