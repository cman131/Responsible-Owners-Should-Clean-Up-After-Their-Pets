import { describe, it, expect } from 'vitest';
import { DataLoader } from '../loader.js';

describe('DataLoader', () => {
  it('loads all pokemon species', () => {
    const loader = new DataLoader();
    const species = loader.getSpecies(6); // Charizard
    expect(species).not.toBeNull();
    expect(species?.name).toBe('charizard');
    expect(species?.baseStats.hp).toBe(78);
    expect(species?.types).toContain('Fire');
  });

  it('returns null for unknown species id', () => {
    const loader = new DataLoader();
    expect(loader.getSpecies(9999)).toBeNull();
  });

  it('loads move by id', () => {
    const loader = new DataLoader();
    const move = loader.getMove('flamethrower');
    expect(move).not.toBeNull();
    expect(move?.basePower).toBe(90);
    expect(move?.type).toBe('Fire');
  });

  it('loads type chart — fire vs grass is 2x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Fire', 'Grass')).toBe(2);
  });

  it('loads type chart — fire vs water is 0.5x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Fire', 'Water')).toBe(0.5);
  });

  it('loads type chart — normal vs ghost is 0x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Normal', 'Ghost')).toBe(0);
  });
});
