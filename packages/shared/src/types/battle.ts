import type { PokemonType, Stats } from './pokemon.js';

export type BattlePhase = 'setup' | 'action' | 'resolution' | 'switch' | 'ended';

export type StatusCondition = 'brn' | 'par' | 'slp' | 'frz' | 'psn' | 'tox' | 'fnt';

export type WeatherType = 'sun' | 'rain' | 'sand' | 'snow';

export type TerrainType = 'electric' | 'grassy' | 'misty' | 'psychic';

export interface StatBoosts {
  atk: number;  // -6 to +6
  def: number;
  spa: number;
  spd: number;
  spe: number;
  accuracy: number;
  evasion: number;
}

export interface MoveSlot {
  moveId: string;
  currentPp: number;
  maxPp: number;
}

export interface PartyMember {
  instanceId: string;       // unique per battle (uuid)
  speciesId: number;
  speciesName: string;      // internal PS name, e.g. 'charizard' — used for sprite URLs
  nickname: string;
  level: number;
  currentHp: number;
  maxHp: number;
  stats: Stats;             // calculated (base + EVs + IVs + nature)
  ability: string;          // ability id
  heldItem?: string;        // item id
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
  status?: StatusCondition;
  volatileStatus: string[]; // e.g. 'confusion', 'leechseed', 'encore'
  statBoosts: StatBoosts;
  teraType?: PokemonType;
  hasTerastallized: boolean;
  fainted: boolean;
  expTotal: number;
}

export interface SlotState {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  isSpectator: boolean;
  party: PartyMember[];
  activePokemonIndex: number;
}

export interface TeamState {
  teamId: string;
  slots: SlotState[];
}

export interface SideConditions {
  stealthRock: boolean;
  spikes: 0 | 1 | 2 | 3;
  toxicSpikes: 0 | 1 | 2;
  stickyWeb: boolean;
  reflect: number;     // turns remaining, 0 = not active
  lightScreen: number;
  auroraVeil: number;
}

export interface FieldState {
  weather?: { type: WeatherType; turnsRemaining: number; fromAbility: boolean };
  terrain?: { type: TerrainType; turnsRemaining: number };
  trickroom: number;  // turns remaining
  gravity: number;    // turns remaining
  sideConditions: [SideConditions, SideConditions];
}

export interface BattleState {
  battleId: string;
  label: string;
  turnNumber: number;
  phase: BattlePhase;
  teams: [TeamState, TeamState];
  field: FieldState;
  winner?: 0 | 1;
  turnTimerSeconds: number;
}
