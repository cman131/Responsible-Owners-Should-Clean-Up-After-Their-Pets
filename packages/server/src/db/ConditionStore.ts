import type Database from 'better-sqlite3';
import type { PokemonCondition, StatusCondition } from '@poke-fighter/shared';

export interface ConditionEntry {
  profileId: string;
  pokemonId: string;
  condition: PokemonCondition;
}

interface ConditionRow {
  pokemonId: string;
  currentHp: number;
  maxHp: number;
  status: string | null;
  sleepTurns: number | null;
  ppUsed: string;
}

export class ConditionStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  getForProfile(profileId: string): Map<string, PokemonCondition> {
    const rows = this.db.prepare('SELECT * FROM pokemon_condition WHERE profileId = ?')
      .all(profileId) as ConditionRow[];
    return new Map(rows.map((r) => [r.pokemonId, {
      currentHp: r.currentHp,
      maxHp: r.maxHp,
      ppUsed: JSON.parse(r.ppUsed) as Record<string, number>,
      ...(r.status !== null ? { status: r.status as StatusCondition } : {}),
      ...(r.sleepTurns !== null ? { sleepTurns: r.sleepTurns } : {}),
    }]));
  }

  saveMany(entries: ConditionEntry[]): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO pokemon_condition
        (profileId, pokemonId, currentHp, maxHp, status, sleepTurns, ppUsed)
      VALUES (@profileId, @pokemonId, @currentHp, @maxHp, @status, @sleepTurns, @ppUsed)
    `);
    this.db.transaction((rows: ConditionEntry[]) => {
      for (const { profileId, pokemonId, condition } of rows) {
        statement.run({
          profileId,
          pokemonId,
          currentHp: condition.currentHp,
          maxHp: condition.maxHp,
          status: condition.status ?? null,
          sleepTurns: condition.sleepTurns ?? null,
          ppUsed: JSON.stringify(condition.ppUsed),
        });
      }
    })(entries);
  }

  clear(profileId: string, pokemonId?: string): void {
    if (pokemonId === undefined) {
      this.db.prepare('DELETE FROM pokemon_condition WHERE profileId = ?').run(profileId);
      return;
    }
    this.db.prepare('DELETE FROM pokemon_condition WHERE profileId = ? AND pokemonId = ?')
      .run(profileId, pokemonId);
  }

  prune(profileId: string, keepIds: readonly string[]): void {
    for (const pokemonId of this.getForProfile(profileId).keys()) {
      if (!keepIds.includes(pokemonId)) {
        this.clear(profileId, pokemonId);
      }
    }
  }
}
