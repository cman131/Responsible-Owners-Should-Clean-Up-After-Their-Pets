import type { PokemonType } from './pokemon.js';

export interface PokemonSet {
  speciesId: number;
  nickname: string;
  level: number;
  ability: string;
  heldItem?: string;
  moves: [string, string, string, string]; // move ids
  teraType?: PokemonType;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  ivs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  nature: string;
}

export interface TeamTemplate {
  templateId: string;
  name: string;
  pokemon: PokemonSet[];  // 1–6
  createdAt: string;      // ISO date
}

export interface PlayerProfile {
  profileId: string;
  displayName: string;
  playerKey?: string;
  defaultTeam?: TeamTemplate;
  bank?: PokemonSet[];
  inventory?: Record<string, number>;
  createdAt: string;
}

export interface NpcProfile {
  profileId: string;
  name: string;
  team: TeamTemplate;
  createdAt: string;
}
