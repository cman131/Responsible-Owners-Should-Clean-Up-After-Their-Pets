import type { PartyMember, BattleState, PokemonType } from '@poke-fighter/shared';

export interface ItemContext {
  holder: PartyMember;
  state: BattleState;
}

export interface ItemAttackContext extends ItemContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
  isPhysical: boolean;
}

export interface ItemHooks {
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number };
  onAfterDamageTaken?: (ctx: ItemContext & { damageTaken: number }) => { hpDelta: number };
  onSpeedModifier?: (ctx: ItemContext) => number;
}

const ITEM_HOOKS: Record<string, ItemHooks> = {
  'choice-band': {
    onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.5 : 1,
  },
  'choice-specs': {
    onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.5 : 1,
  },
  'choice-scarf': {
    onSpeedModifier: () => 1.5,
  },
  'life-orb': {
    onDamageModifier: () => 1.3,
    onAfterDamageTaken: ({ holder, damageTaken }) => ({ hpDelta: damageTaken > 0 ? -Math.floor(holder.maxHp / 10) : 0 }),
  },
  leftovers: {
    onEndOfTurn: ({ holder }) => ({ hpDelta: Math.floor(holder.maxHp / 16) }),
  },
  'black-sludge': {
    onEndOfTurn: ({ holder }) => {
      const isPoison = holder.ability === 'poison-type';
      return { hpDelta: isPoison ? Math.floor(holder.maxHp / 16) : -Math.floor(holder.maxHp / 8) };
    },
  },
  eviolite: {
    onAttackerModifier: () => 1,
  },
};

export function getItemHooks(itemId: string | undefined): ItemHooks {
  if (!itemId) return {};
  return ITEM_HOOKS[itemId.toLowerCase().replace(/\s/g, '-')] ?? {};
}
