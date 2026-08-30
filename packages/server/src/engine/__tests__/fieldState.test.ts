import { describe, it, expect } from 'vitest';
import { isGrounded, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRAVITY_BLOCKED_MOVES, GRASSY_TERRAIN_HALVED } from '../fieldState.js';
import { makePokemon } from './fixtures.js';

describe('isGrounded', () => {
  it('returns true for a Normal-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Normal'], false)).toBe(true);
  });

  it('returns false for a Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], false)).toBe(false);
  });

  it('returns false for a Water/Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Water', 'Flying'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Levitate ability', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Ghost'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Magnet Rise volatile', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], false)).toBe(false);
  });

  it('returns true for a Flying-type when gravity is active', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], true)).toBe(true);
  });

  it('returns true for a Levitate Pokémon when gravity is active', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });

  it('returns true for a Magnet Rise Pokémon when gravity is active', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });
});

describe('lookup maps', () => {
  it('WEATHER_ACCURACY: thunder always hits in rain', () => {
    expect(WEATHER_ACCURACY['thunder']?.['rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder is 50% in sun', () => {
    expect(WEATHER_ACCURACY['thunder']?.['sun']).toBe(50);
  });

  it('WEATHER_ACCURACY: blizzard always hits in snow', () => {
    expect(WEATHER_ACCURACY['blizzard']?.['snow']).toBe(true);
  });

  it('WEATHER_ACCURACY: hurricane always hits in rain, 50% in sun', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['rain']).toBe(true);
    expect(WEATHER_ACCURACY['hurricane']?.['sun']).toBe(50);
  });

  it('SOLAR_MOVES contains solarbeam and solarblade', () => {
    expect(SOLAR_MOVES.has('solarbeam')).toBe(true);
    expect(SOLAR_MOVES.has('solarblade')).toBe(true);
  });

  it('WEATHER_BALL_TYPE maps weather to type', () => {
    expect(WEATHER_BALL_TYPE['sun']).toBe('Fire');
    expect(WEATHER_BALL_TYPE['rain']).toBe('Water');
    expect(WEATHER_BALL_TYPE['sand']).toBe('Rock');
    expect(WEATHER_BALL_TYPE['snow']).toBe('Ice');
  });

  it('GRAVITY_BLOCKED_MOVES contains fly and bounce', () => {
    expect(GRAVITY_BLOCKED_MOVES.has('fly')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('bounce')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('highjumpkick')).toBe(true);
  });

  it('GRASSY_TERRAIN_HALVED contains earthquake', () => {
    expect(GRASSY_TERRAIN_HALVED.has('earthquake')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('magnitude')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('bulldoze')).toBe(true);
  });
});
