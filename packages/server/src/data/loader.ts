import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PokemonSpecies, Move, Ability, HeldItem, PokemonType } from '@poke-fighter/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../../data'); // packages/server/src/data/ → data/

export class DataLoader {
  private readonly species: Map<number, PokemonSpecies>;
  private readonly speciesByName: Map<string, PokemonSpecies>;
  private readonly moves: Map<string, Move>;
  private readonly abilities: Map<string, Ability>;
  private readonly items: Map<string, HeldItem>;
  private readonly typeChart: Record<string, Record<string, number>>;

  constructor() {
    const rawSpecies = this.load<PokemonSpecies[]>('pokemon.json');
    // Keep only the first occurrence of each id (base form) for species Map
    this.species = new Map();
    for (const s of rawSpecies) {
      if (!this.species.has(s.id)) {
        this.species.set(s.id, s);
      }
    }
    this.speciesByName = new Map(rawSpecies.map((s) => [s.name, s]));

    const rawMoves = this.load<Move[]>('moves.json');
    this.moves = new Map(rawMoves.map((m) => [m.id, m]));

    const rawAbilities = this.load<Ability[]>('abilities.json');
    this.abilities = new Map(rawAbilities.map((a) => [a.id, a]));

    const rawItems = this.load<HeldItem[]>('items.json');
    this.items = new Map(rawItems.map((i) => [i.id, i]));

    this.typeChart = this.load<Record<string, Record<string, number>>>('typechart.json');
  }

  private load<T>(filename: string): T {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8')) as T;
  }

  getSpecies(id: number): PokemonSpecies | null {
    return this.species.get(id) ?? null;
  }

  getSpeciesByName(name: string): PokemonSpecies | null {
    return this.speciesByName.get(name.toLowerCase()) ?? null;
  }

  getMove(id: string): Move | null {
    return this.moves.get(id) ?? null;
  }

  getAbility(id: string): Ability | null {
    return this.abilities.get(id) ?? null;
  }

  getItem(id: string): HeldItem | null {
    return this.items.get(id) ?? null;
  }

  getAllSpecies(): PokemonSpecies[] {
    return Array.from(this.species.values());
  }

  getAllMoves(): Move[] {
    return Array.from(this.moves.values());
  }

  getAllItems(): HeldItem[] {
    return Array.from(this.items.values());
  }

  getTypeEffectiveness(attackingType: PokemonType, defendingType: PokemonType): number {
    return this.typeChart[attackingType]?.[defendingType] ?? 1;
  }

  getCombinedEffectiveness(attackingType: PokemonType, defendingTypes: PokemonType[]): number {
    return defendingTypes.reduce((acc, dt) => acc * this.getTypeEffectiveness(attackingType, dt), 1);
  }
}
