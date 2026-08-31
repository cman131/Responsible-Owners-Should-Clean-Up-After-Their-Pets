import type { PartyMember, BattleState, PokemonType, StatBoosts, TurnResolveEvent } from '@poke-fighter/shared';

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

export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;
  onDefenderModifier?: (ctx: AttackContext) => number;
  onDamageModifier?: (ctx: AttackContext) => number;
  onSwitchIn?: (ctx: SwitchInContext) => SwitchInResult | null;
  onSwitchOut?: (ctx: SwitchContext) => SwitchOutResult | null;
  onAfterHit?: (ctx: AttackContext & { isPhysical: boolean }) => { statusToApply?: string } | null;
  onStatusImmunity?: (ctx: AbilityContext & { status: string }) => boolean;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
}

const ABILITY_HOOKS: Record<string, AbilityHooks> = {
  intimidate: {
    onSwitchIn: () => ({ statBoostDeltas: { atk: -1 } }),
  },
  levitate: {
    onStatusImmunity: ({ status }) => status === 'Ground',
  },
  'thick-fat': {
    onDamageModifier: ({ moveType }) =>
      moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
  },
  'flash-fire': {
    onStatusImmunity: ({ status }) => status === 'Fire',
  },
  'water-absorb': {
    onStatusImmunity: ({ status }) => status === 'Water',
  },
  'volt-absorb': {
    onStatusImmunity: ({ status }) => status === 'Electric',
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
};

export function getAbilityHooks(abilityId: string): AbilityHooks {
  return ABILITY_HOOKS[abilityId.toLowerCase().replace(/\s/g, '-')] ?? {};
}

export function effectiveAbilityId(pokemon: PartyMember): string {
  return pokemon.tracedAbilityId ?? pokemon.ability;
}
