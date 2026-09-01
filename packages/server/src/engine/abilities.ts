import type { PartyMember, BattleState, PokemonType, StatBoosts, TurnResolveEvent, Move, WeatherType } from '@poke-fighter/shared';
import { getEffectiveStat } from './stats.js';

export interface AbilityContext {
  user: PartyMember;
  state: BattleState;
}

export interface AttackContext extends AbilityContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
}

export interface SwitchInContext {
  user: PartyMember;
  state: BattleState;
  slotId: string;
}

export interface SwitchInResult {
  statBoostDeltas?: Partial<StatBoosts>;      // applied to all active foes (Intimidate)
  selfBoostDeltas?: Partial<StatBoosts>;      // applied to switching-in Pokémon (Download)
  traceAbilityId?: string;                   // sets tracedAbilityId on incoming Pokémon (Trace)
  clearScreens?: boolean;                    // removes Reflect/Light Screen/Aurora Veil from both sides (Screen Cleaner)
  setWeather?: { type: WeatherType; turnsRemaining: number; permanent?: boolean };
}

export interface SwitchContext {
  battle: BattleState;
  slotId: string;
  pokemon: PartyMember;
}

export interface SwitchOutResult {
  hpDelta?: number;        // positive = heal amount (Regenerator)
  clearStatus?: boolean;   // true = clear status condition (Natural Cure)
  events: TurnResolveEvent[];
}

export interface DefenderModifierCtx {
  defender: PartyMember;
  attacker: PartyMember;
  state: BattleState;
  move: Move;
  moveType: PokemonType;
  basePower: number;
  isPhysical: boolean;
  makesContact: boolean;
  effectiveness: number;
}

export interface MoveImmunityCtx {
  move: Move;
  defender: PartyMember;
  state: BattleState;
}

export interface MoveImmunityResult {
  immune: true;
  hpHealFraction?: number;
  statBoostDeltas?: Partial<StatBoosts>;
  chargeFlashFire?: boolean;
}

export interface AfterHitResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<StatBoosts>;
  abilityOverride?: string;
  directDamage?: number;
  volatileToApply?: string;
  disableMoveId?: string;
}

export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;
  onDefenderModifier?: (ctx: DefenderModifierCtx) => number;
  onDamageModifier?: (ctx: AttackContext) => number;
  onSwitchIn?: (ctx: SwitchInContext) => SwitchInResult | null;
  onSwitchOut?: (ctx: SwitchContext) => SwitchOutResult | null;
  onAfterHit?: (ctx: AttackContext & { isPhysical: boolean; makesContact: boolean; rng: () => number }) => AfterHitResult | null;
  onStatusImmunity?: (ctx: { status: string; state?: BattleState }) => boolean;
  onMoveImmunity?: (ctx: MoveImmunityCtx) => MoveImmunityResult | null;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
  doublesSecondaryChance?: true;
  removesSecondaries?: true;
}

const ABILITY_HOOKS: Record<string, AbilityHooks> = {
  intimidate: {
    onSwitchIn: () => ({ statBoostDeltas: { atk: -1 } }),
  },
  'thick-fat': {
    onDefenderModifier: ({ moveType }) =>
      moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
  },
  multiscale: {
    onDefenderModifier: ({ defender }) =>
      defender.currentHp === defender.maxHp ? 0.5 : 1,
  },
  'shadow-shield': {
    onDefenderModifier: ({ defender }) =>
      defender.currentHp === defender.maxHp ? 0.5 : 1,
  },
  limber: {
    onStatusImmunity: ({ status }) => status === 'par',
  },
  immunity: {
    onStatusImmunity: ({ status }) => status === 'psn' || status === 'tox',
  },
  'magma-armor': {
    onStatusImmunity: ({ status }) => status === 'frz',
  },
  'water-veil': {
    onStatusImmunity: ({ status }) => status === 'brn',
  },
  insomnia: {
    onStatusImmunity: ({ status }) => status === 'slp',
  },
  'vital-spirit': {
    onStatusImmunity: ({ status }) => status === 'slp',
  },
  'sweet-veil': {
    onStatusImmunity: ({ status }) => status === 'slp',
  },
  comatose: {
    onStatusImmunity: () => true,
  },
  'leaf-guard': {
    onStatusImmunity: ({ state }) => state?.field.weather?.type === 'sun',
  },
  blaze: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Fire' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  overgrow: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Grass' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  torrent: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Water' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  swarm: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Bug' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  'sand-rush': {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'sand' ? 2 : 1,
  },
  'swift-swim': {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'rain' ? 2 : 1,
  },
  chlorophyll: {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'sun' ? 2 : 1,
  },
  levitate: {
    onMoveImmunity: ({ move }) => move.type === 'Ground' ? { immune: true } : null,
  },
  'volt-absorb': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Electric' ? { immune: true, hpHealFraction: 0.25 } : null,
  },
  'water-absorb': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
  },
  'motor-drive': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Electric' ? { immune: true, statBoostDeltas: { spe: 1 } } : null,
  },
  'sap-sipper': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Grass' ? { immune: true, statBoostDeltas: { atk: 1 } } : null,
  },
  'storm-drain': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Water' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
  },
  'lightning-rod': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Electric' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
  },
  'flash-fire': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Fire' ? { immune: true, chargeFlashFire: true } : null,
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Fire' && user.volatileStatus.some(v => v.name === 'flash-fire-charged') ? 1.5 : 1,
  },
  'screen-cleaner': {
    onSwitchIn: () => ({ clearScreens: true }),
  },
  trace: {
    onSwitchIn: ({ state, slotId }) => {
      const myTeamIdx = state.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
      const foeTeam = state.teams[foeTeamIdx];
      if (!foeTeam) return null;
      const foeSlot = foeTeam.slots[0];
      if (!foeSlot) return null;
      const foe = foeSlot.party[foeSlot.activePokemonIndex];
      if (!foe || foe.fainted) return null;

      const abilityToCopy = effectiveAbilityId(foe);
      return { traceAbilityId: abilityToCopy };
    },
  },
  download: {
    onSwitchIn: ({ state, slotId }) => {
      const myTeamIdx = state.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
      const foeTeam = state.teams[foeTeamIdx];
      if (!foeTeam) return null;
      const foeSlot = foeTeam.slots[0];
      if (!foeSlot) return null;
      const foe = foeSlot.party[foeSlot.activePokemonIndex];
      if (!foe || foe.fainted) return null;

      const effectiveDef = getEffectiveStat(foe.stats.def, foe.statBoosts.def, 'def');
      const effectiveSpd = getEffectiveStat(foe.stats.spd, foe.statBoosts.spd, 'spd');

      // Def < SpD → boost Atk; tie or SpD ≤ Def → boost SpA (Gen 5+ ruling)
      if (effectiveDef < effectiveSpd) {
        return { selfBoostDeltas: { atk: 1 } };
      } else {
        return { selfBoostDeltas: { spa: 1 } };
      }
    },
  },
  regenerator: {
    onSwitchOut: ({ pokemon }) => {
      const heal = Math.min(
        Math.floor(pokemon.maxHp / 3),
        pokemon.maxHp - pokemon.currentHp,
      );
      if (heal <= 0) return null;
      return {
        hpDelta: heal,
        events: [{ type: 'heal', data: { reason: 'regenerator', amount: heal } }],
      };
    },
  },
  'natural-cure': {
    onSwitchOut: ({ pokemon }) => {
      if (!pokemon.status) return null;
      return {
        clearStatus: true,
        events: [{ type: 'status-cured', data: { status: pokemon.status, reason: 'natural-cure' } }],
      };
    },
  },
  'rough-skin': {
    onAfterHit: ({ makesContact, user: target }) =>
      makesContact ? { directDamage: Math.floor(target.maxHp / 8) } : null,
  },
  'iron-barbs': {
    onAfterHit: ({ makesContact, user: target }) =>
      makesContact ? { directDamage: Math.floor(target.maxHp / 8) } : null,
  },
  static: {
    onAfterHit: ({ makesContact, rng }) =>
      makesContact && rng() < 0.3 ? { statusToApply: 'par' } : null,
  },
  'flame-body': {
    onAfterHit: ({ makesContact, rng }) =>
      makesContact && rng() < 0.3 ? { statusToApply: 'brn' } : null,
  },
  'poison-point': {
    onAfterHit: ({ makesContact, rng }) =>
      makesContact && rng() < 0.3 ? { statusToApply: 'psn' } : null,
  },
  'effect-spore': {
    onAfterHit: ({ makesContact, rng }) => {
      if (!makesContact) return null;
      const r = rng();
      if (r >= 0.3) return null;
      if (r < 0.1) return { statusToApply: 'par' };
      if (r < 0.2) return { statusToApply: 'psn' };
      return { statusToApply: 'slp' };
    },
  },
  gooey: {
    onAfterHit: ({ makesContact }) =>
      makesContact ? { statBoostDeltas: { spe: -1 } } : null,
  },
  'tangling-hair': {
    onAfterHit: ({ makesContact }) =>
      makesContact ? { statBoostDeltas: { spe: -1 } } : null,
  },
  mummy: {
    onAfterHit: ({ makesContact }) =>
      makesContact ? { abilityOverride: 'mummy' } : null,
  },
  'cursed-body': {
    onAfterHit: ({ makesContact, rng }) =>
      makesContact && rng() < 0.3 ? { volatileToApply: 'disable' } : null,
  },
  drizzle: {
    onSwitchIn: ({ user }) => ({
      setWeather: {
        type: 'rain' as WeatherType,
        turnsRemaining: user.heldItem === 'damp-rock' ? 8 : 5,
      },
    }),
  },
  drought: {
    onSwitchIn: ({ user }) => ({
      setWeather: { type: 'sun' as WeatherType, turnsRemaining: user.heldItem === 'heat-rock' ? 8 : 5 },
    }),
  },
  'sand-stream': {
    onSwitchIn: ({ user }) => ({
      setWeather: { type: 'sand' as WeatherType, turnsRemaining: user.heldItem === 'smooth-rock' ? 8 : 5 },
    }),
  },
  'snow-warning': {
    onSwitchIn: ({ user }) => ({
      setWeather: { type: 'snow' as WeatherType, turnsRemaining: user.heldItem === 'icy-rock' ? 8 : 5 },
    }),
  },
  'primordial-sea': {
    onSwitchIn: () => ({
      setWeather: { type: 'heavy-rain' as WeatherType, turnsRemaining: 999, permanent: true },
    }),
  },
  'desolate-land': {
    onSwitchIn: () => ({
      setWeather: { type: 'harsh-sun' as WeatherType, turnsRemaining: 999, permanent: true },
    }),
  },
  'delta-stream': {
    onSwitchIn: () => ({
      setWeather: { type: 'strong-winds' as WeatherType, turnsRemaining: 999, permanent: true },
    }),
  },
  'gorilla-tactics': {
    // Gorilla Tactics boosts Attack by 1.5× (physical only; holders are always physical attackers)
    onAttackerModifier: () => 1.5,
  },
  filter: {
    onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
  },
  'solid-rock': {
    onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
  },
  'prism-armor': {
    onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
  },
  fluffy: {
    onDefenderModifier: ({ makesContact, moveType }) => {
      let mod = 1;
      if (makesContact) mod *= 0.5;
      if (moveType === 'Fire') mod *= 2;
      return mod;
    },
  },
  'fur-coat': {
    onDefenderModifier: ({ isPhysical }) => isPhysical ? 0.5 : 1,
  },
  'ice-scales': {
    onDefenderModifier: ({ isPhysical }) => !isPhysical ? 0.5 : 1,
  },
  'punk-rock': {
    onDefenderModifier: ({ move }) => (move as any).soundMove ? 0.5 : 1,
  },
  heatproof: {
    onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
  },
  'dry-skin': {
    onMoveImmunity: ({ move }) =>
      move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
    onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 1.25 : 1,
  },
  'water-bubble': {
    onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
    onAttackerModifier: ({ moveType }) => moveType === 'Water' ? 2 : 1,
    onStatusImmunity: ({ status }) => status === 'brn',
  },
  'mold-breaker': {},
  turboblaze: {},
  teravolt: {},
  'serene-grace': {
    doublesSecondaryChance: true,
  },
  'sheer-force': {
    removesSecondaries: true,
  },
};

export function getAbilityHooks(abilityId: string): AbilityHooks {
  return ABILITY_HOOKS[abilityId.toLowerCase().replace(/\s/g, '-')] ?? {};
}

export function effectiveAbilityId(pokemon: PartyMember): string {
  return pokemon.tracedAbilityId ?? pokemon.ability;
}
