import { describe, it, expect } from 'vitest';
import { pokemonMatchesQuery, moveMatchesQuery } from '../handlers/adminHandlers.js';
import type { PokemonSpecies, Move } from '@poke-fighter/shared';

const makeMove = (overrides: Partial<Move> = {}): Move => ({
  id: 'flamethrower',
  name: 'Flamethrower',
  type: 'Fire',
  category: 'special',
  basePower: 90,
  accuracy: 100,
  pp: 15,
  priority: 0,
  target: 'normal',
  makesContact: false,
  ...overrides,
});

describe('moveMatchesQuery', () => {
  it('matches by move id (case-insensitive)', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'flame')).toBe(true);
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'FLAME')).toBe(true);
  });

  it('matches by move name', () => {
    expect(moveMatchesQuery(makeMove({ name: 'Flamethrower' }), 'thrower')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower', name: 'Flamethrower' }), 'tackle')).toBe(false);
  });
});

const makeSpecies = (overrides: Partial<PokemonSpecies>): PokemonSpecies => ({
  id: 1,
  name: 'bulbasaur',
  displayName: 'Bulbasaur',
  types: ['Grass'],
  baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  abilities: { 0: 'Overgrow' },
  baseExpYield: 64,
  expGrowth: 'MediumSlow',
  learnset: [],
  evolutionStage: 1,
  ...overrides,
});

describe('pokemonMatchesQuery', () => {
  it('matches by internal name (case-insensitive)', () => {
    const charmander = makeSpecies({ name: 'charmander', displayName: 'Charmander' });
    expect(pokemonMatchesQuery(charmander, 'char')).toBe(true);
    expect(pokemonMatchesQuery(charmander, 'Char')).toBe(true);
  });

  it('matches by displayName with special characters', () => {
    const nidoranF = makeSpecies({ id: 29, name: 'nidoranf', displayName: 'Nidoran-F' });
    expect(pokemonMatchesQuery(nidoranF, 'nidoran-f')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'Nidoran-F')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'nidoran')).toBe(true);
  });

  it('matches by dex number', () => {
    expect(pokemonMatchesQuery(makeSpecies({ id: 6 }), '6')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(pokemonMatchesQuery(makeSpecies({ name: 'bulbasaur', displayName: 'Bulbasaur' }), 'xyz')).toBe(false);
  });
});
