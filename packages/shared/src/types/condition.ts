import type { StatusCondition } from './battle.js';

/** Stored condition of a player Pokémon between battles. */
export interface PokemonCondition {
  currentHp: number;               // 0 = fainted
  maxHp: number;                   // max HP when saved, used for scaling
  status?: StatusCondition;
  sleepTurns?: number;
  ppUsed: Record<string, number>;  // move id → PP used
}

export interface PokemonHealth {
  pokemonId: string;
  currentHp: number;
  maxHp: number;
  status?: StatusCondition;
  moves: Array<{ moveId: string; currentPp: number; maxPp: number }>;
}

export interface PlayerHealthPayload {
  profileId: string;
  inBattle: boolean;
  pokemon: PokemonHealth[];
}

export interface BattleStartResultPayload {
  battleId: string;
  ok: boolean;
  message?: string;
}
