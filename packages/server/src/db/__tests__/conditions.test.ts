import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { AppDatabase } from '../Database.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

const makeSet = (overrides: Partial<PokemonSet> = {}): PokemonSet => ({
  speciesId: 6, nickname: 'Charizard', level: 50, ability: 'blaze', nature: 'timid',
  moves: ['flamethrower', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  ...overrides,
});

const makePlayer = (pokemon: PokemonSet[], bank: PokemonSet[] = []): PlayerProfile => ({
  profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01T00:00:00Z',
  defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon },
  bank,
});

const condition = { currentHp: 10, maxHp: 153, status: 'brn' as const, ppUsed: { flamethrower: 2 } };

describe('Pokémon IDs and conditions', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('assigns unique IDs on save and replaces repeats', () => {
    const saved = db.players.save(makePlayer([makeSet({ pokemonId: 'same' })], [makeSet({ pokemonId: 'same' }), makeSet()]));
    const ids = [...saved.defaultTeam!.pokemon, ...saved.bank!].map((p) => p.pokemonId);
    expect(ids[0]).toBe('same');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(Boolean)).toBe(true);
    expect(db.players.get('p1')).toEqual(saved);
  });

  it('round-trips and clears conditions', () => {
    db.conditions.saveMany([
      { profileId: 'p1', pokemonId: 'a', condition },
      { profileId: 'p1', pokemonId: 'b', condition: { currentHp: 0, maxHp: 100, ppUsed: {} } },
    ]);
    expect(db.conditions.getForProfile('p1').get('a')).toEqual(condition);

    db.conditions.clear('p1', 'a');
    expect([...db.conditions.getForProfile('p1').keys()]).toEqual(['b']);

    db.conditions.clear('p1');
    expect(db.conditions.getForProfile('p1').size).toBe(0);
  });

  it('writes all conditions or none', () => {
    expect(() => db.conditions.saveMany([
      { profileId: 'p1', pokemonId: 'a', condition },
      { profileId: 'p1', pokemonId: 'b', condition: { currentHp: null as unknown as number, maxHp: 1, ppUsed: {} } },
    ])).toThrow();
    expect(db.conditions.getForProfile('p1').size).toBe(0);
  });

  it('keeps conditions across team and bank moves and removes them with the Pokémon', () => {
    const saved = db.players.save(makePlayer([makeSet()]));
    const set = saved.defaultTeam!.pokemon[0]!;
    db.conditions.saveMany([{ profileId: 'p1', pokemonId: set.pokemonId!, condition }]);

    db.players.save(makePlayer([], [set]));
    expect(db.conditions.getForProfile('p1').size).toBe(1);

    db.players.save(makePlayer([], []));
    expect(db.conditions.getForProfile('p1').size).toBe(0);
  });

  it('removes conditions when the player is deleted', () => {
    db.players.save(makePlayer([makeSet({ pokemonId: 'a' })]));
    db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition }]);
    db.players.delete('p1');
    expect(db.conditions.getForProfile('p1').size).toBe(0);
  });
});

describe('Pokémon ID backfill', () => {
  it('gives existing players IDs once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poke-db-'));
    const path = join(dir, 'test.db');
    new AppDatabase(path).close();
    const raw = new Database(path);
    raw.prepare('INSERT INTO players (profileId, displayName, createdAt, defaultTeam) VALUES (?, ?, ?, ?)')
      .run('p1', 'Ash', '2026-01-01', JSON.stringify(makePlayer([makeSet()]).defaultTeam));
    raw.close();

    const first = new AppDatabase(path);
    const id = first.players.get('p1')!.defaultTeam!.pokemon[0]!.pokemonId;
    first.close();
    const second = new AppDatabase(path);

    expect(id).toBeTruthy();
    expect(second.players.get('p1')!.defaultTeam!.pokemon[0]!.pokemonId).toBe(id);
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
