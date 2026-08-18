import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PokemonSpeciesSchema } from '../pokemon.schema.js';
import { MoveSchema } from '../move.schema.js';

const dataDir = join(process.cwd(), '../../data');

describe('Seeded data validates against schemas', () => {
  it('all pokemon.json entries are valid', () => {
    const data = JSON.parse(readFileSync(join(dataDir, 'pokemon.json'), 'utf-8')) as unknown[];
    expect(data.length).toBeGreaterThan(1000);
    for (const entry of data) {
      const result = PokemonSpeciesSchema.safeParse(entry);
      expect(result.success, `species ${JSON.stringify(entry)} failed: ${!result.success ? JSON.stringify(result.error.flatten()) : ''}`).toBe(true);
    }
  });

  it('all moves.json entries are valid', () => {
    const data = JSON.parse(readFileSync(join(dataDir, 'moves.json'), 'utf-8')) as unknown[];
    expect(data.length).toBeGreaterThan(700);
    for (const entry of data) {
      const result = MoveSchema.safeParse(entry);
      expect(result.success, `move ${JSON.stringify(entry)} failed`).toBe(true);
    }
  });
});
