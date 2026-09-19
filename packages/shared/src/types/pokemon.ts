import type { Secondary } from './secondary.js';

export type PokemonType =
  | 'Normal' | 'Fire' | 'Water' | 'Electric' | 'Grass' | 'Ice'
  | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug'
  | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy' | '???';

export type ExpGrowthCurve =
  | 'Erratic' | 'Fast' | 'MediumFast' | 'MediumSlow' | 'Slow' | 'Fluctuating';

export type MoveTarget =
  | 'normal'              // single adjacent foe
  | 'self'                // user only
  | 'allAdjacentFoes'     // all opponents (spread)
  | 'allAdjacent'         // all adjacent (hits allies too)
  | 'adjacentAlly'        // single ally
  | 'adjacentAllyOrSelf'  // self or single adjacent ally
  | 'adjacentFoe'         // single adjacent foe (non-random)
  | 'any'                 // any single Pokémon on the field
  | 'allies'              // all ally slots
  | 'allyTeam'            // whole ally team (e.g. Aromatherapy)
  | 'allySide'            // your side (e.g. Reflect)
  | 'foeSide'             // foe side (e.g. Stealth Rock)
  | 'all'                 // whole field (e.g. Sunny Day)
  | 'randomNormal'        // targets random adjacent foe
  | 'scripted';           // contextual (Counter, Mirror Coat)

export type MoveCategory = 'physical' | 'special' | 'status';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PokemonSpecies {
  id: number;            // National Dex number
  name: string;          // internal PS name (e.g. 'charizard', 'charizardmegax')
  displayName: string;   // human-readable (e.g. 'Charizard', 'Charizard-Mega-X')
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: Stats;
  abilities: {
    0: string;
    1?: string;
    H?: string;  // Hidden ability
  };
  baseExpYield: number;
  expGrowth: ExpGrowthCurve;
  learnset: string[];     // move IDs this species can learn in Gen 9
  evolutionStage: 1 | 2 | 3;
  weightkg: number;
}

export interface Move {
  id: string;           // internal PS id (e.g. 'flamethrower')
  name: string;         // display name (e.g. 'Flamethrower')
  type: PokemonType;
  category: MoveCategory;
  basePower: number;    // 0 for status moves
  accuracy: number | true;  // true = never misses
  pp: number;
  priority: number;     // default 0
  target: MoveTarget;
  makesContact: boolean;
  effectId?: string;    // identifier for special effect handling
  effect?: string;        // status id ('brn', 'par', 'psn', 'frz', 'slp') for secondary effects
  effectChance?: number;  // integer 0–100
  critRatio?: number;  // 1 = high crit ratio (+1 crit stage); absent/0 = normal
  soundMove?: boolean;
  secondaries?: Secondary[];
}

export interface Ability {
  id: string;
  name: string;
  effectId: string;
}

export interface HeldItem {
  id: string;
  name: string;
  effectId: string;
  isBerry: boolean;
  equippable: boolean;
}
