import type { PartyMember, BattleState, PokemonType, StatBoosts, Move } from '@poke-fighter/shared';

export interface ItemContext {
  holder: PartyMember;
  state: BattleState;
}

export interface ItemAttackContext extends ItemContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
  isPhysical: boolean;
  effectiveness?: number;
  rng?: () => number;
}

export interface ItemHooks {
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  /** May return a plain multiplier or { multiplier, consume } for berries that self-consume on hit */
  onDefenderModifier?: (ctx: ItemAttackContext) => number | { multiplier: number; consume?: boolean };
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  /** hpDelta<0 emits damage-dealt; statusToInflict used by Flame Orb / Toxic Orb */
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number; statusToInflict?: string };
  onAfterDamageTaken?: (ctx: ItemContext & {
    damageTaken: number;
    effectiveness?: number;
    moveType?: PokemonType;
    isPhysical?: boolean;
  }) => {
    hpDelta: number;
    statBoostDeltas?: Partial<StatBoosts>;
    consume?: boolean;
  };
  onAfterHit?: (ctx: ItemAttackContext & { makesContact: boolean; totalDamage: number }) => {
    directDamageToAttacker?: number;
    flinchTarget?: boolean;
    forceAttackerSwitch?: boolean;
    consume?: boolean;
  } | null;
  onStatusApplied?: (ctx: ItemContext & { status: string }) => { cureStatus: boolean; consume?: boolean } | null;
  onSpeedModifier?: (ctx: ItemContext) => number;
  critStageBonus?: number;
  screenExtension?: number;
  drainMultiplier?: number;
  onHealAfterAttack?: (ctx: ItemAttackContext & { damageDealt: number }) => { hpDelta: number };
  onAccuracyModifier?: (ctx: ItemContext & { move: Move; isFirst: boolean }) => number;
  /** Eject Button: return true to force the holder to switch out after taking direct damage */
  onAfterDamageTakenForceSwitch?: (ctx: ItemContext & { damageTaken: number }) => boolean;
  /** White Herb (restoreStats) + Eject Pack (forceSwitch) */
  onStatDropped?: (ctx: ItemContext) => { restoreStats?: boolean; forceSwitch?: boolean; consume: boolean };
  /** Terrain seeds: fires on switch-in and at end-of-turn when terrain is active */
  onSwitchIn?: (ctx: ItemContext & { terrain: string | null }) => { statBoostDeltas?: Partial<StatBoosts>; consume?: boolean } | undefined;
}

const ITEM_HOOKS: Record<string, ItemHooks> = {
  'assault-vest': {
    onDefenderModifier: ({ isPhysical }) => !isPhysical ? (2 / 3) : 1,
  },
  'choice-band': {
    onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.5 : 1,
  },
  'choice-specs': {
    onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.5 : 1,
  },
  'muscle-band': {
    onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.1 : 1,
  },
  'wise-glasses': {
    onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.1 : 1,
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
    onDefenderModifier: ({ holder }) => holder.isEvioliteEligible ? (2 / 3) : 1,
  },
  'scope-lens': {
    critStageBonus: 1,
  },
  'razor-claw': {
    critStageBonus: 1,
  },
  'light-clay': {
    screenExtension: 3,
  },
  'big-root': {
    drainMultiplier: 2,
  },
  'rocky-helmet': {
    onAfterHit: ({ makesContact, holder, totalDamage }) =>
      makesContact && totalDamage > 0
        ? { directDamageToAttacker: Math.floor(holder.maxHp / 6) }
        : null,
  },
  'sitrus-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) =>
      holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
        ? { hpDelta: Math.floor(holder.maxHp / 4), consume: true }
        : { hpDelta: 0 },
  },
  'lum-berry': {
    onStatusApplied: () => ({ cureStatus: true, consume: true }),
  },
  'cheri-berry': {
    onStatusApplied: ({ status }) => status === 'par' ? { cureStatus: true, consume: true } : null,
  },
  'chesto-berry': {
    onStatusApplied: ({ status }) => status === 'slp' ? { cureStatus: true, consume: true } : null,
  },
  'pecha-berry': {
    onStatusApplied: ({ status }) => (status === 'psn' || status === 'tox') ? { cureStatus: true, consume: true } : null,
  },
  'rawst-berry': {
    onStatusApplied: ({ status }) => status === 'brn' ? { cureStatus: true, consume: true } : null,
  },
  'aspear-berry': {
    onStatusApplied: ({ status }) => status === 'frz' ? { cureStatus: true, consume: true } : null,
  },
  'persim-berry': {},  // handled inline in effectFactories.ts
  'salac-berry': {
    onAfterDamageTaken: ({ holder }) =>
      holder.currentHp <= holder.maxHp / 4
        ? { hpDelta: 0, statBoostDeltas: { spe: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'petaya-berry': {
    onAfterDamageTaken: ({ holder }) =>
      holder.currentHp <= holder.maxHp / 4
        ? { hpDelta: 0, statBoostDeltas: { spa: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'liechi-berry': {
    onAfterDamageTaken: ({ holder }) =>
      holder.currentHp <= holder.maxHp / 4
        ? { hpDelta: 0, statBoostDeltas: { atk: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'ganlon-berry': {
    onAfterDamageTaken: ({ holder }) =>
      holder.currentHp <= holder.maxHp / 4
        ? { hpDelta: 0, statBoostDeltas: { def: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'apicot-berry': {
    onAfterDamageTaken: ({ holder }) =>
      holder.currentHp <= holder.maxHp / 4
        ? { hpDelta: 0, statBoostDeltas: { spd: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'shell-bell': {
    onHealAfterAttack: ({ damageDealt }) => ({ hpDelta: Math.floor(damageDealt / 8) }),
  },
  'wide-lens': {
    onAccuracyModifier: () => 1.1,
  },
  'zoom-lens': {
    onAccuracyModifier: ({ isFirst }) => isFirst ? 1 : 1.2,
  },
  'bright-powder': {
    onAccuracyModifier: () => 0.9,
  },
  // handled inline in BattleEngine/EffectEngine — stubs ensure they appear in IMPLEMENTED_ITEM_IDS
  'focus-sash': {},
  'shed-shell': {},
  'binding-band': {},
  'grip-claw': {},
  'protective-pads': {},
  'punching-glove': {},
  'air-balloon': {},
  'weakness-policy': {},
  // handled inline in registrations.ts
  'power-herb': {},
  // handled inline in BattleEngine (hitCount guard)
  'loaded-dice': {},
  // Type-boosting items
  'charcoal': { onAttackerModifier: ({ moveType }) => moveType === 'Fire' ? 1.2 : 1 },
  'mystic-water': { onAttackerModifier: ({ moveType }) => moveType === 'Water' ? 1.2 : 1 },
  'miracle-seed': { onAttackerModifier: ({ moveType }) => moveType === 'Grass' ? 1.2 : 1 },
  'magnet': { onAttackerModifier: ({ moveType }) => moveType === 'Electric' ? 1.2 : 1 },
  'never-melt-ice': { onAttackerModifier: ({ moveType }) => moveType === 'Ice' ? 1.2 : 1 },
  'twisted-spoon': { onAttackerModifier: ({ moveType }) => moveType === 'Psychic' ? 1.2 : 1 },
  'black-belt': { onAttackerModifier: ({ moveType }) => moveType === 'Fighting' ? 1.2 : 1 },
  'poison-barb': { onAttackerModifier: ({ moveType }) => moveType === 'Poison' ? 1.2 : 1 },
  'soft-sand': { onAttackerModifier: ({ moveType }) => moveType === 'Ground' ? 1.2 : 1 },
  'sharp-beak': { onAttackerModifier: ({ moveType }) => moveType === 'Flying' ? 1.2 : 1 },
  'silver-powder': { onAttackerModifier: ({ moveType }) => moveType === 'Bug' ? 1.2 : 1 },
  'hard-stone': { onAttackerModifier: ({ moveType }) => moveType === 'Rock' ? 1.2 : 1 },
  'spell-tag': { onAttackerModifier: ({ moveType }) => moveType === 'Ghost' ? 1.2 : 1 },
  'dragon-fang': { onAttackerModifier: ({ moveType }) => moveType === 'Dragon' ? 1.2 : 1 },
  'black-glasses': { onAttackerModifier: ({ moveType }) => moveType === 'Dark' ? 1.2 : 1 },
  'metal-coat': { onAttackerModifier: ({ moveType }) => moveType === 'Steel' ? 1.2 : 1 },
  'silk-scarf': { onAttackerModifier: ({ moveType }) => moveType === 'Normal' ? 1.2 : 1 },
  'fairy-feather': { onAttackerModifier: ({ moveType }) => moveType === 'Fairy' ? 1.2 : 1 },
  // Damage modifier items
  'expert-belt': { onDamageModifier: ({ effectiveness }) => effectiveness !== undefined && effectiveness > 1 ? 1.2 : 1 },
  // HP-restore berries
  'oran-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) =>
      holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
        ? { hpDelta: 10, consume: true }
        : { hpDelta: 0 },
  },
  'berry-juice': {
    onAfterDamageTaken: ({ holder, damageTaken }) =>
      holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
        ? { hpDelta: 20, consume: true }
        : { hpDelta: 0 },
  },
  // Type-resist berries — halve SE damage and consume (Chilan: halve any Normal hit)
  'occa-berry':   { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fire'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'passho-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Water'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'wacan-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Electric' && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'rindo-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Grass'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'yache-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ice'      && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'chople-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fighting' && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'kebia-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Poison'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'shuca-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ground'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'coba-berry':   { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Flying'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'payapa-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Psychic'  && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'tanga-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Bug'      && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'charti-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Rock'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'kasib-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ghost'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'haban-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Dragon'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'colbur-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Dark'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'babiri-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Steel'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'chilan-berry': { onDefenderModifier: ({ moveType }) => moveType === 'Normal' ? { multiplier: 0.5, consume: true } : 1 },
  'roseli-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fairy'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  // Confusion berries — heal floor(maxHp/3) at ≤33% HP
  'figy-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'wiki-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'mago-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'aguav-berry': { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'iapapa-berry':{ onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  // Custap Berry — sets custap-active volatile at ≤25% HP for priority within bracket
  'custap-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) => {
      if (damageTaken > 0 && holder.currentHp <= Math.floor(holder.maxHp / 4)) {
        holder.volatileStatus.push({ name: 'custap-active' });
        return { hpDelta: 0, consume: true };
      }
      return { hpDelta: 0 };
    },
  },
  // Micle Berry — sets micle-active volatile at ≤25% HP for 1.2× accuracy on next move
  // The accuracy boost is applied inline in BattleEngine (reads volatileStatus directly,
  // since heldItem is already undefined when the next move fires).
  'micle-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) => {
      if (damageTaken > 0 && holder.currentHp <= Math.floor(holder.maxHp / 4)) {
        holder.volatileStatus.push({ name: 'micle-active' });
        return { hpDelta: 0, consume: true };
      }
      return { hpDelta: 0 };
    },
  },
  // Reactive berries
  'kee-berry': {
    onAfterDamageTaken: ({ damageTaken, isPhysical }) =>
      damageTaken > 0 && isPhysical
        ? { hpDelta: 0, statBoostDeltas: { def: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'maranga-berry': {
    onAfterDamageTaken: ({ damageTaken, isPhysical }) =>
      damageTaken > 0 && isPhysical === false
        ? { hpDelta: 0, statBoostDeltas: { spd: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'jaboca-berry': {
    onAfterHit: ({ isPhysical, holder, totalDamage }) =>
      isPhysical && totalDamage > 0
        ? { directDamageToAttacker: Math.floor(holder.maxHp / 8), consume: true }
        : null,
  },
  'rowap-berry': {
    onAfterHit: ({ isPhysical, holder, totalDamage }) =>
      !isPhysical && totalDamage > 0
        ? { directDamageToAttacker: Math.floor(holder.maxHp / 8), consume: true }
        : null,
  },
  // Status-inflicting orbs
  'flame-orb': {
    onEndOfTurn: () => ({ hpDelta: 0, statusToInflict: 'brn' }),
  },
  'toxic-orb': {
    onEndOfTurn: () => ({ hpDelta: 0, statusToInflict: 'tox' }),
  },
  'white-herb': {
    onStatDropped: (ctx) => ({ restoreStats: true, consume: true }),
  },
  'eject-button': {
    onAfterDamageTakenForceSwitch: ({ damageTaken }) => damageTaken > 0,
  },
  'eject-pack': {
    onStatDropped: () => ({ forceSwitch: true, consume: true }),
  },
  'red-card': {
    onAfterHit: ({ totalDamage }) => totalDamage > 0 ? { forceAttackerSwitch: true, consume: true } : null,
  },
  'kings-rock': {
    onAfterHit: ({ totalDamage, rng }) =>
      totalDamage > 0 && (rng?.() ?? Math.random()) < 0.1
        ? { flinchTarget: true }
        : null,
  },
  'razor-fang': {
    onAfterHit: ({ totalDamage, rng }) =>
      totalDamage > 0 && (rng?.() ?? Math.random()) < 0.1
        ? { flinchTarget: true }
        : null,
  },
  'electric-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'electric' ? { statBoostDeltas: { def: 1 }, consume: true } : undefined,
  },
  'grassy-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'grassy' ? { statBoostDeltas: { def: 1 }, consume: true } : undefined,
  },
  'misty-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'misty' ? { statBoostDeltas: { spd: 1 }, consume: true } : undefined,
  },
  'psychic-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'psychic' ? { statBoostDeltas: { spd: 1 }, consume: true } : undefined,
  },
};

export const IMPLEMENTED_ITEM_IDS: ReadonlySet<string> = new Set(Object.keys(ITEM_HOOKS));

export function getItemHooks(itemId: string | undefined): ItemHooks {
  if (!itemId) return {};
  return ITEM_HOOKS[itemId.toLowerCase().replace(/\s/g, '-')] ?? {};
}
