import type { PokemonType, Stats } from './pokemon.js';

export type BattlePhase = 'setup' | 'action' | 'resolution' | 'switch' | 'ended';

export type StatusCondition = 'brn' | 'par' | 'slp' | 'frz' | 'psn' | 'tox' | 'fnt';

export type WeatherType = 'sun' | 'rain' | 'sand' | 'snow' | 'heavy-rain' | 'harsh-sun' | 'strong-winds';

export type TerrainType = 'electric' | 'grassy' | 'misty' | 'psychic';

export interface VolatileStatusEntry {
  name: string;
  counter?: number;           // general-purpose countdown (yawn, perishsong, toxic)
  turnsRemaining?: number;    // disable, taunt, encore, magnet-rise, embargo, heal-block
  moveId?: string;            // disable: the disabled move; encore: the forced move
  variant?: string;           // protect: which protect move was used
  hp?: number;                // substitute: proxy HP pool
  sourceSlotId?: string;
  accumulated?: number;       // bide: accumulated damage
}

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
  volatileStatus: VolatileStatusEntry[]; // e.g. 'confusion', 'leechseed', 'encore'
  statBoosts: StatBoosts;
  teraType?: PokemonType;
  typeOverride?: PokemonType[];
  hasTerastallized: boolean;
  lastMoveId?: string;
  lastDamageTaken?: { amount: number; category: 'physical' | 'special'; fromSlotId: string };
  friendship?: number;
  tracedAbilityId?: string;
  lockedMoveId?: string;
  lastConsumedItem?: string;
  isEvioliteEligible?: boolean;
  fainted: boolean;
  expTotal: number;
  growthRate: string;
  ivs?: Stats;
  evs?: Stats;
  nature?: string;
}

export interface SlotState {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  isSpectator: boolean;
  party: PartyMember[];
  activePokemonIndex: number;
  wish?: { hp: number; turnsRemaining: number };
  pendingHeal?: 'healingwish' | 'lunardance';
  batonPassData?: { volatiles: VolatileStatusEntry[]; statBoosts: StatBoosts };
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
  tailwind: number;    // turns remaining, 0 = inactive
  safeguard: number;   // turns remaining
  mist: number;        // turns remaining
  luckychant: number;  // turns remaining
}

export interface FieldState {
  weather?: { type: WeatherType; turnsRemaining: number; fromAbility: boolean; permanent?: boolean };
  terrain?: { type: TerrainType; turnsRemaining: number };
  trickroom: number;
  gravity: number;
  wonderroom: number;   // turns remaining (0 = inactive); swaps Def/SpD in damage calc
  magicroom: number;    // turns remaining (0 = inactive); suppresses held items
  mudSport: number;     // turns remaining; Electric moves do 0.5× damage
  waterSport: number;   // turns remaining; Fire moves do 0.5× damage
  ionDeluge: boolean;   // single-turn; Normal-type moves become Electric
  fairyLock: number;    // turns remaining (0 = inactive); prevents switching
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
  lastUsedMoveId?: string;
  lastTurnFaintedTeamIndex?: number;
}
