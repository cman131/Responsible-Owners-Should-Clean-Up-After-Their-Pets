import type { PartyMember, BattleState, PokemonType } from '@poke-fighter/shared';

export interface AbilityContext {
  user: PartyMember;
  state: BattleState;
}

export interface AttackContext extends AbilityContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
}

export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;   // multiply attack stat
  onDefenderModifier?: (ctx: AttackContext) => number;   // multiply defense stat
  onDamageModifier?: (ctx: AttackContext) => number;     // multiply final damage
  onSwitchIn?: (ctx: AbilityContext) => void;
  onStatusImmunity?: (ctx: AbilityContext & { status: string }) => boolean;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
}

const ABILITY_HOOKS: Record<string, AbilityHooks> = {
  intimidate: {
    onSwitchIn: (_ctx) => {
      // lowers adjacent opponents' attack by 1 stage — BattleEngine applies the stat drop
    },
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
};

export function getAbilityHooks(abilityId: string): AbilityHooks {
  return ABILITY_HOOKS[abilityId.toLowerCase().replace(/\s/g, '-')] ?? {};
}
