import { describe, it, expectTypeOf } from 'vitest';
import type { PokemonSpecies, Move, Stats, MoveTarget, ExpGrowthCurve, PokemonType } from '../pokemon.js';

describe('PokemonSpecies type', () => {
  it('has all required fields', () => {
    expectTypeOf<PokemonSpecies>().toHaveProperty('id');
    expectTypeOf<PokemonSpecies>().toHaveProperty('name');
    expectTypeOf<PokemonSpecies>().toHaveProperty('types');
    expectTypeOf<PokemonSpecies>().toHaveProperty('baseStats');
    expectTypeOf<PokemonSpecies>().toHaveProperty('baseExpYield');
    expectTypeOf<PokemonSpecies>().toHaveProperty('expGrowth');
  });

  it('Move has correct target union', () => {
    const target: MoveTarget = 'normal';
    expectTypeOf(target).toMatchTypeOf<MoveTarget>();
  });
});
