import type {
  BattleState, SlotState, PartyMember, MoveAction, SwitchAction,
  TurnResolveEvent, PokemonType, StatusCondition, StatBoosts, Move,
} from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
import { computeHitChance, computeCritStage, critProbability } from './accuracy.js';
import { PARALYSIS_SPEED_MOD } from './status.js';
import { EffectEngine, SlotContext } from './EffectEngine.js';
import { getAbilityHooks, effectiveAbilityId } from './abilities.js';
import type { SwitchInResult } from './abilities.js';
import { getItemHooks } from './items.js';
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries } from './effects.js';
import type { SecondaryContext } from './effects.js';
import { MoveEffectRegistry, MoveContext } from './MoveEffectRegistry.js';
import { buildDefaultRegistry } from './registrations.js';
import { SWITCH_CLEAR_NAMES, SWITCH_CLEAR_PREFIXES } from './volatileClearRules.js';
import { isGrounded, GRAVITY_BLOCKED_MOVES, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRASSY_TERRAIN_HALVED } from './fieldState.js';
import { getScreenMultiplier, applyEntryHazards, decrementScreens } from './sideConditions.js';

const ALWAYS_THAW_MOVES = new Set(['scald', 'steameruption', 'sparklingaria']);

const CHOICE_LOCK_ITEMS = new Set(['choice-band', 'choice-specs', 'choice-scarf']);

const ABILITY_VOLATILE_CLEAR = new Set(['slow-start', 'truant']);

const PROTECT_FAMILY_IDS = new Set([
  'protect', 'detect', 'kingsshield', 'spikyshield',
  'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'endure',
]);

const CONTACT_PROTECT_VARIANTS: Record<string, { stat?: string; stages?: number; damage?: number; status?: string }> = {
  kingsshield:    { stat: 'atk', stages: -2 },
  spikyshield:    { damage: 8 },   // 1/8 max HP
  obstruct:       { stat: 'def', stages: -2 },
  silktrap:       { stat: 'spe', stages: -1 },
  banefulbunker:  { status: 'psn' },
  burningbulwark: { status: 'brn' },
};

type Action = MoveAction | SwitchAction;

export interface TurnResult {
  newState: BattleState;
  events: TurnResolveEvent[];
  pivotSlots?: string[];
  remainingActions?: Record<string, MoveAction | SwitchAction>;
  remainingSlotOrder?: string[];
  movedSlotIds?: Set<string>;
}

interface MoveResult extends TurnResult {
  pivotSwitch?: boolean;
}

export class BattleEngine {
  private readonly data = new DataLoader();
  private readonly effectEngine = new EffectEngine();
  private readonly registry: MoveEffectRegistry;
  private readonly rng: () => number;

  constructor({ registry, rng }: { registry?: MoveEffectRegistry; rng?: () => number } = {}) {
    this.rng = rng ?? Math.random;
    this.registry = registry ?? buildDefaultRegistry();
  }

  resolveTurn(state: BattleState, actions: Record<string, Action>): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    // 1. Determine action order (priority, then speed)
    const order = this.buildActionOrder(s, actions);

    // 2. Execute each action
    const movedSlotIds = new Set<string>();
    for (const slotId of order) {
      const action = actions[slotId];
      if (!action) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;

      if (action.type === 'move') {
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, order);
        events.push(...moveResult.events);
        s = moveResult.newState;

        if (moveResult.pivotSwitch) {
          movedSlotIds.add(slotId);
          const currentIdx = order.indexOf(slotId);
          const remainingSlotOrder = order.slice(currentIdx + 1);
          const remainingActions: Record<string, MoveAction | SwitchAction> = {};
          for (const rId of remainingSlotOrder) {
            if (actions[rId]) remainingActions[rId] = actions[rId]!;
          }
          return { newState: s, events, pivotSlots: [slotId], remainingActions, remainingSlotOrder, movedSlotIds };
        }
      } else if (action.type === 'switch') {
        const switchResult = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchResult.events);
        s = switchResult.newState;
      }

      movedSlotIds.add(slotId);

      if (this.checkWinCondition(s) !== null) break;
    }

    // 3. End-of-turn effects
    const eotResult = this.endOfTurn(s);
    events.push(...eotResult.events);
    s = eotResult.newState;

    // 4. Check win condition
    const winner = this.checkWinCondition(s);
    if (winner !== null) {
      s = { ...s, phase: 'ended', winner };
    } else {
      s = { ...s, turnNumber: s.turnNumber + 1, phase: 'action' };
    }

    return { newState: s, events };
  }

  private buildActionOrder(state: BattleState, actions: Record<string, Action>): string[] {
    const entries = Object.entries(actions).map(([slotId, action]) => {
      const slot = this.findSlot(state, slotId);
      if (!slot) return { slotId, priority: 0, spe: 0 };
      const active = slot.party[slot.activePokemonIndex];
      if (!active) return { slotId, priority: 0, spe: 0 };

      let priority = 6; // switches are highest
      if (action.type === 'move') {
        const moveId = active.moves[action.moveIndex]?.moveId ?? '';
        priority = this.data.getMove(moveId)?.priority ?? 0;
      }

      const effectiveSpe = this.getEffectiveSpeed(active, state);
      return { slotId, priority, spe: effectiveSpe };
    });

    const trickRoomActive = state.field.trickroom > 0;
    return entries
      .sort((a, b) =>
        b.priority - a.priority ||
        (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
        Math.random() - 0.5,
      )
      .map((e) => e.slotId);
  }

  private getEffectiveSpeed(pokemon: PartyMember, state: BattleState): number {
    let spe = getEffectiveStat(pokemon.stats.spe, pokemon.statBoosts.spe, 'spe');
    if (pokemon.status === 'par') spe = Math.floor(spe * PARALYSIS_SPEED_MOD);

    const abilityHooks = getAbilityHooks(pokemon.ability);
    if (abilityHooks.onSpeedModifier) {
      spe = Math.floor(spe * abilityHooks.onSpeedModifier({ user: pokemon, state }));
    }
    const itemHooks = getItemHooks(pokemon.heldItem);
    if (itemHooks.onSpeedModifier) {
      spe = Math.floor(spe * itemHooks.onSpeedModifier({ holder: pokemon, state }));
    }
    return spe;
  }

  private executeMove(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    movedSlotIds: Set<string>,
    order: string[],
  ): MoveResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    const attackerSlot = this.findSlot(s, attackerSlotId);
    if (!attackerSlot) return { newState: s, events };
    const attacker = attackerSlot.party[attackerSlot.activePokemonIndex];
    if (!attacker) return { newState: s, events };

    const preMoveResult = this.effectEngine.runPreMove(attacker, attackerSlotId, s, this.getAllSlots(s));
    events.push(...preMoveResult.events);
    if (preMoveResult.blocked) return { newState: s, events };

    const moveSlot = attacker.moves[action.moveIndex];
    if (!moveSlot) return { newState: s, events };
    let move = this.data.getMove(moveSlot.moveId);
    if (!move) return { newState: s, events };

    // Check if chosen move is disabled (block before decrement so same-turn disable preserves counter)
    const activeDisable = attacker.volatileStatus.find(v => v.name === 'disable');
    if (activeDisable && activeDisable.moveId === move.id) {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'disabled', moveId: move.id } });
      return { newState: s, events };
    }

    // Taunt: block status moves
    const tauntEntry = attacker.volatileStatus.find(v => v.name === 'taunt');
    if (tauntEntry && move.category === 'status') {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'taunted', moveId: move.id } });
      return { newState: s, events };
    }

    // Encore: force the encored move
    const encoreEntry = attacker.volatileStatus.find(v => v.name === 'encore');
    if (encoreEntry && encoreEntry.moveId && move.id !== encoreEntry.moveId) {
      const encoreSlot = attacker.moves.find(m => m.moveId === encoreEntry.moveId);
      if (encoreSlot && encoreSlot.currentPp > 0) {
        const encoreMove = this.data.getMove(encoreEntry.moveId);
        if (encoreMove) move = encoreMove;
      } else {
        // PP ran out, Encore ends
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'encore');
      }
    }

    // Torment: block repeating last move
    const tormentActive = attacker.volatileStatus.some(v => v.name === 'torment');
    if (tormentActive && attacker.lastMoveId === move.id) {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'torment', moveId: move.id } });
      return { newState: s, events };
    }

    // Decrement Disable (only if move was not blocked by it above)
    const disableDecEntry = attacker.volatileStatus.find(v => v.name === 'disable');
    if (disableDecEntry) {
      disableDecEntry.turnsRemaining = (disableDecEntry.turnsRemaining ?? 1) - 1;
      if ((disableDecEntry.turnsRemaining ?? 0) <= 0) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'disable');
        events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: 'disable' } });
      }
    }

    // Handle Terastallize
    if (action.terastallize && !attacker.hasTerastallized && attacker.teraType) {
      attacker.hasTerastallized = true;
      events.push({ type: 'terastallize', data: { slotId: attackerSlotId, teraType: attacker.teraType } });
    }

    // Spend PP
    moveSlot.currentPp = Math.max(0, moveSlot.currentPp - 1);

    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, moveId: move.id, moveName: move.name } });

    // Set choice lock after move-used fires so pre-move blocks (sleep, paralysis, flinch) don't lock
    if (!attacker.lockedMoveId) {
      if (CHOICE_LOCK_ITEMS.has(attacker.heldItem ?? '') || effectiveAbilityId(attacker) === 'gorilla-tactics') {
        attacker.lockedMoveId = move.id;
      }
    }

    // Gravity blocks airborne moves
    if (s.field.gravity > 0 && GRAVITY_BLOCKED_MOVES.has(move.id)) {
      events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'gravity' } });
      return { newState: s, events };
    }

    if (move.category === 'status') {
      const { targets: rawTargets, targetSlotIds: rawTargetSlotIds } = this.resolveStatusTargets(s, attackerSlotId, action, move);
      const rawTargetTypes = rawTargets.map(t => this.resolveEffectiveTypes(t));
      const userTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId));

      // Filter out Protect-guarded targets (only for opposing targets)
      const filteredTargets: typeof rawTargets = [];
      const filteredSlotIds: string[] = [];
      const filteredTypes: PokemonType[][] = [];
      for (let i = 0; i < rawTargets.length; i++) {
        const tgt = rawTargets[i]!;
        const tSlotId = rawTargetSlotIds[i]!;
        const isOpponent = s.teams.some(
          team => team !== s.teams[userTeamIndex] && team.slots.some(sl => sl.slotId === tSlotId)
        );
        const protectEntry = tgt.volatileStatus.find(v => v.name === 'protect');
        if (isOpponent && protectEntry) {
          events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId: tSlotId, reason: 'protect', variant: protectEntry.variant } });
        } else {
          filteredTargets.push(tgt);
          filteredSlotIds.push(tSlotId);
          filteredTypes.push(rawTargetTypes[i]!);
        }
      }
      if (filteredTargets.length === 0 && rawTargets.length > 0) {
        return { newState: s, events };
      }

      // Accuracy check for status moves (e.g. Will-O-Wisp, Thunder Wave)
      {
        const primaryTargetSlotId = filteredSlotIds[0] ?? '';
        let statusHitChance: number | 'always' = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, 0);
        if (typeof statusHitChance === 'number') {
          const isFirst = order.indexOf(attackerSlotId) < order.indexOf(primaryTargetSlotId);
          const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
            holder: attacker, state: s, move, isFirst,
          });
          if (attItemMod !== undefined) statusHitChance = Math.min(100, Math.floor(statusHitChance * attItemMod));
          if (filteredSlotIds.length === 1) {
            const tSlot = this.findSlot(s, primaryTargetSlotId);
            const tMon = tSlot?.party[tSlot.activePokemonIndex];
            if (tMon) {
              const defItemMod = getItemHooks(tMon.heldItem).onAccuracyModifier?.({
                holder: tMon, state: s, move, isFirst,
              });
              if (defItemMod !== undefined) statusHitChance = Math.min(100, Math.floor(statusHitChance * defItemMod));
            }
          }
          if (this.rng() * 100 >= statusHitChance) {
            events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
            return { newState: s, events };
          }
        }
      }

      const ctx: MoveContext = {
        battle: s,
        user: attacker,
        userSlotId: attackerSlotId,
        userTeamIndex,
        targets: filteredTargets,
        targetSlotIds: filteredSlotIds,
        targetTypes: filteredTypes,
        move,
        rng: this.rng,
      };

      const effectId = move.effectId ?? move.id;
      const handler = this.registry.get(effectId);
      if (handler) {
        events.push(...handler(ctx).events);
      } else {
        console.warn(`[MoveEffectRegistry] No handler for effectId="${effectId}" (moveId="${move.id}")`);
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'unimplemented' } });
      }
      return { newState: s, events };
    }

    // Determine targets
    const targetSlotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(s, attackerSlotId, move.target);

    const secs = move.secondaries ?? [];
    const isOhko = secs.some(sec => sec.kind === 'ohko');
    if (!['self', 'allyTeam'].includes(move.target) && !isOhko) {
      let defenderEvasion = 0;
      if (targetSlotIds.length === 1) {
        const tSlot = this.findSlot(s, targetSlotIds[0]!);
        const tMon = tSlot && tSlot.party[tSlot.activePokemonIndex];
        defenderEvasion = tMon?.statBoosts.evasion ?? 0;
      }
      let hitChance: number | 'always' = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
      // Weather accuracy override (Thunder in rain, Blizzard in snow, Hurricane in rain)
      if (s.field.weather) {
        const weatherOverride = WEATHER_ACCURACY[move.id]?.[s.field.weather.type];
        if (weatherOverride === true) hitChance = 'always';
        else if (typeof weatherOverride === 'number') hitChance = weatherOverride;
      }
      // Gravity boosts all move accuracy by 5/3
      if (s.field.gravity > 0 && hitChance !== 'always') {
        hitChance = Math.min(100, Math.floor((hitChance as number) * 5 / 3));
      }
      // Item-based accuracy modifiers (Wide Lens, Zoom Lens, Bright Powder)
      if (typeof hitChance === 'number') {
        const primaryTargetSlotId = targetSlotIds[0] ?? '';
        const isFirst = order.indexOf(attackerSlotId) < order.indexOf(primaryTargetSlotId);
        const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
          holder: attacker, state: s, move, isFirst,
        });
        if (attItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * attItemMod));
        if (targetSlotIds.length === 1) {
          const tSlot = this.findSlot(s, primaryTargetSlotId);
          const tMon = tSlot?.party[tSlot.activePokemonIndex];
          if (tMon) {
            const defItemMod = getItemHooks(tMon.heldItem).onAccuracyModifier?.({
              holder: tMon, state: s, move, isFirst,
            });
            if (defItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * defItemMod));
          }
        }
      }
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        return { newState: s, events };
      }
    }

    // Charge-turn check
    const chargeSec = secs.find(sec => sec.kind === 'charge');
    if (chargeSec) {
      const isSun = s.field.weather?.type === 'sun' || s.field.weather?.type === 'harsh-sun';
      const hasCharge = attacker.volatileStatus.some(v => v.name === chargeSec.chargeVolatile);
      if (!hasCharge && !isSun) {
        attacker.volatileStatus.push({ name: chargeSec.chargeVolatile });
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: chargeSec.chargeVolatile, note: 'charging' } });
        return { newState: s, events };
      }
      if (hasCharge) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== chargeSec.chargeVolatile);
      }
    }

    // Move type and base power overrides (computed once, apply to all targets)
    let effectiveBasePower = move.basePower;
    let effectiveMoveType = move.type;

    // Solar Beam / Solar Blade: half power in any non-sun weather
    if (SOLAR_MOVES.has(move.id) && s.field.weather && !['sun', 'harsh-sun'].includes(s.field.weather.type)) {
      effectiveBasePower = Math.floor(effectiveBasePower / 2);
    }
    // Weather Ball: double power + type change in active weather
    if (move.id === 'weatherball' && s.field.weather) {
      effectiveBasePower = 80;
      effectiveMoveType = WEATHER_BALL_TYPE[s.field.weather.type] ?? move.type;
    }

    // Extreme-weather move nullification (must come after effectiveMoveType is resolved)
    if (s.field.weather) {
      const wt = s.field.weather.type;
      if (
        (wt === 'heavy-rain' && effectiveMoveType === 'Fire') ||
        (wt === 'harsh-sun'  && effectiveMoveType === 'Water')
      ) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: wt } });
        return { newState: s, events };
      }
    }

    for (const targetSlotId of targetSlotIds) {
      const targetSlot = this.findSlot(s, targetSlotId);
      if (!targetSlot) continue;
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

      // Psychic Terrain: priority moves fail against grounded targets
      if (s.field.terrain?.type === 'psychic' && move.priority > 0) {
        const tTypesForGrounding = this.resolveEffectiveTypes(target);
        if (isGrounded(target, tTypesForGrounding, s.field.gravity > 0)) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'psychic-terrain', targetSlotId } });
          continue;
        }
      }

      // Protect check
      const protectEntry = target.volatileStatus.find(v => v.name === 'protect');
      if (protectEntry) {
        events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'protect', variant: protectEntry.variant } });
        // Variant contact effects
        const variantEffects = CONTACT_PROTECT_VARIANTS[protectEntry.variant ?? ''];
        if (variantEffects && move.makesContact) {
          if (variantEffects.stat && variantEffects.stages !== undefined) {
            events.push(applyStatBoost(attacker, attackerSlotId, { [variantEffects.stat]: variantEffects.stages } as Partial<Record<keyof StatBoosts, number>>));
          }
          if (variantEffects.damage) {
            const recoil = Math.max(1, Math.floor(attacker.maxHp / variantEffects.damage));
            const taken = Math.min(recoil, attacker.currentHp);
            attacker.currentHp -= taken;
            events.push({ type: 'damage-dealt', data: { source: 'protect-contact', slotId: attackerSlotId, damage: taken, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (variantEffects.status) {
            const attackerSpecies = this.data.getSpecies(attacker.speciesId);
            const attackerTypes = attacker.hasTerastallized && attacker.teraType
              ? [attacker.teraType] as PokemonType[]
              : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
            const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes, undefined, s);
            if (evt) events.push(evt);
          }
        }
        continue;
      }

      if (target.status === 'frz' && (effectiveMoveType === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
        delete target.status;
        events.push({
          type: 'status-cured',
          data: { slotId: targetSlotId, status: 'frz', reason: 'fire-hit' },
        });
      }

      // Type effectiveness
      const targetSpecies = this.data.getSpecies(target.speciesId);
      const defTypes = target.hasTerastallized && target.teraType
        ? [target.teraType] as PokemonType[]
        : (targetSpecies?.types ?? ['Normal']) as PokemonType[];

      // Foresight/Odor Sleuth: Normal/Fighting hits Ghost
      let effectiveDefTypes = defTypes;
      if (target.volatileStatus.some(v => v.name === 'foresight')) {
        if (effectiveMoveType === 'Normal' || effectiveMoveType === 'Fighting') {
          effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Ghost');
        }
      }
      // Miracle Eye: Psychic hits Dark
      if (target.volatileStatus.some(v => v.name === 'miracle-eye') && effectiveMoveType === 'Psychic') {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Dark');
      }
      // Roost: user loses Flying type for the rest of this turn
      if (target.volatileStatus.some(v => v.name === 'roost')) {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Flying');
        if (effectiveDefTypes.length === 0) effectiveDefTypes = ['Normal'];
      }

      let effectiveness = this.data.getCombinedEffectiveness(effectiveMoveType, effectiveDefTypes);
      if (effectiveness === 0) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Strong Winds: super-effective moves against Flying-type targets are reduced
      if (s.field.weather?.type === 'strong-winds' && effectiveDefTypes.includes('Flying')) {
        if (effectiveness >= 4) effectiveness /= 2;
        else if (effectiveness > 1) effectiveness = 1;
      }

      // Magnet Rise: Ground immunity
      if (effectiveMoveType === 'Ground' && target.volatileStatus.some(v => v.name === 'magnet-rise')) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Mold Breaker / Turboblaze / Teravolt: suppress defender ability hooks
      const ignoresAbilities = ['mold-breaker', 'turboblaze', 'teravolt']
        .includes(effectiveAbilityId(attacker));

      // Ability-based move immunity (Levitate, Volt Absorb, etc.)
      if (!ignoresAbilities) {
        const abilityImmunityResult = getAbilityHooks(effectiveAbilityId(target))
          .onMoveImmunity?.({ move, defender: target, state: s });
        if (abilityImmunityResult) {
          if (abilityImmunityResult.hpHealFraction) {
            const healAmt = Math.min(
              Math.floor(target.maxHp * abilityImmunityResult.hpHealFraction),
              target.maxHp - target.currentHp,
            );
            if (healAmt > 0) {
              target.currentHp += healAmt;
              events.push({ type: 'heal', data: { slotId: targetSlotId, amount: healAmt, remainingHp: target.currentHp } });
            }
          }
          if (abilityImmunityResult.statBoostDeltas) {
            events.push(applyStatBoost(target, targetSlotId, abilityImmunityResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (abilityImmunityResult.chargeFlashFire) {
            if (!target.volatileStatus.some(v => v.name === 'flash-fire-charged')) {
              target.volatileStatus.push({ name: 'flash-fire-charged' });
            }
          }
          events.push({ type: 'ability-triggered', data: { slotId: targetSlotId, ability: effectiveAbilityId(target), effect: 'immune' } });
          continue;
        }
      }

      // Air Balloon Ground immunity (item-based, inline)
      if (target.heldItem === 'air-balloon' && effectiveMoveType === 'Ground') {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // OHKO check — bypasses normal damage formula
      const ohkoSec = secs.find(sec => sec.kind === 'ohko');
      if (ohkoSec) {
        if (target.level > attacker.level) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohkoAcc = Math.max(1, Math.min(100, 30 + attacker.level - target.level));
        if (this.rng() * 100 >= ohkoAcc) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohkoDmg = target.currentHp;
        target.currentHp = 0;
        target.fainted = true;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: ohkoDmg, effectiveness: 1, remainingHp: 0,
        }});
        events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        continue;
      }

      const multihitSec = secs.find(sec => sec.kind === 'multihit');
      const hitCount = multihitSec ? this.rollHitCount(multihitSec.hits) : 1;

      const isPhysical = move.category === 'physical';
      const itemHooks = getItemHooks(attacker.heldItem);

      // Sheer Force: removes secondaries but boosts power by 1.3×
      const attackerAbilityForDmg = effectiveAbilityId(attacker);
      const sheerForceActive = getAbilityHooks(attackerAbilityForDmg).removesSecondaries === true;
      const moveHasSecondaries = sheerForceActive && (
        (move.effectChance !== undefined && move.effect !== undefined) ||
        secs.some(sec => ['status', 'stat', 'flinch', 'confusion'].includes(sec.kind))
      );

      let totalDamage = 0;
      for (let hit = 0; hit < hitCount; hit++) {
        if (target.fainted) break;

        const attackerSpecies = this.data.getSpecies(attacker.speciesId);
        const attackerTypes = attacker.hasTerastallized && attacker.teraType
          ? [attacker.teraType] as PokemonType[]
          : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
        const stab = attackerTypes.includes(effectiveMoveType);

        const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
        const boostKey = isPhysical ? 'atk' as const : 'spa' as const;
        const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
        const defBoostKey = isPhysical ? 'def' as const : 'spd' as const;

        const critStage = computeCritStage(move.critRatio, attacker.volatileStatus, getItemHooks(attacker.heldItem).critStageBonus ?? 0);
        const isCritical = this.rng() < critProbability(critStage);
        const atkBoost = isCritical ? Math.max(0, attacker.statBoosts[boostKey]) : attacker.statBoosts[boostKey];
        const defBoost = isCritical ? Math.min(0, target.statBoosts[defBoostKey]) : target.statBoosts[defBoostKey];

        let atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);
        const abilityHooks = getAbilityHooks(attacker.ability);
        if (abilityHooks.onAttackerModifier) {
          atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
            user: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target,
          }));
        }
        const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
        const isSpread = targetSlotIds.length > 1;
        let otherModifiers = isSpread ? 0.75 : 1;
        if (moveHasSecondaries) otherModifiers *= 1.3;
        if (itemHooks.onAttackerModifier) {
          otherModifiers *= itemHooks.onAttackerModifier({
            holder: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target, isPhysical,
          });
        }

        // Terrain power modifiers
        const terrain = s.field.terrain?.type;
        if (terrain) {
          const gravityActive = s.field.gravity > 0;
          const atkGrounded = isGrounded(attacker, attackerTypes, gravityActive);
          const defGrounded = isGrounded(target, effectiveDefTypes, gravityActive);
          if (terrain === 'electric' && effectiveMoveType === 'Electric' && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && effectiveMoveType === 'Grass'    && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && GRASSY_TERRAIN_HALVED.has(move.id))              otherModifiers *= 0.5;
          if (terrain === 'misty'    && effectiveMoveType === 'Dragon'   && defGrounded) otherModifiers *= 0.5;
          if (terrain === 'psychic'  && effectiveMoveType === 'Psychic'  && atkGrounded) otherModifiers *= 1.5;
        }

        // Screen damage halving — crits bypass screens
        const defenderTeamIndex = s.teams.findIndex(t =>
          t.slots.some(sl => sl.slotId === targetSlotId)
        ) as 0 | 1;
        otherModifiers *= getScreenMultiplier(
          s.field.sideConditions[defenderTeamIndex]!,
          move.category as 'physical' | 'special',
          isCritical,
        );

        // Ability-based defender modifier (Multiscale, Thick Fat, etc.)
        if (!ignoresAbilities) {
          const defAbilityMod = getAbilityHooks(effectiveAbilityId(target)).onDefenderModifier?.({
            defender: target,
            attacker,
            state: s,
            move,
            moveType: effectiveMoveType,
            basePower: effectiveBasePower,
            isPhysical,
            makesContact: move.makesContact === true,
            effectiveness,
          });
          if (defAbilityMod !== undefined) otherModifiers *= defAbilityMod;
        }

        // Item-based defender modifier
        const defItemMod = getItemHooks(target.heldItem).onDefenderModifier?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical,
        });
        if (defItemMod !== undefined) otherModifiers *= defItemMod;

        const { damage } = calcDamage({
          level: attacker.level,
          attackStat: atkStat,
          defenseStat: defStat,
          basePower: effectiveBasePower,
          typeEffectiveness: effectiveness,
          stab,
          isBurned: isPhysical && attacker.status === 'brn',
          randomFactor: randomDamageFactor(),
          isCritical,
          moveType: effectiveMoveType,
          ...(s.field.weather ? { weather: s.field.weather.type } : {}),
          otherModifiers,
        });

        let finalDamage = damage;
        const abilityDmgMod = abilityHooks.onDamageModifier?.({ user: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target });
        if (abilityDmgMod !== undefined) finalDamage = Math.floor(finalDamage * abilityDmgMod);
        const itemDmgMod = itemHooks.onDamageModifier?.({ holder: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target, isPhysical, effectiveness });
        if (itemDmgMod !== undefined) finalDamage = Math.floor(finalDamage * itemDmgMod);

        const subEntry = target.volatileStatus.find(v => v.name === 'substitute');
        if (subEntry && subEntry.hp !== undefined) {
          const subDamage = Math.min(finalDamage, subEntry.hp);
          subEntry.hp -= subDamage;
          totalDamage += subDamage;
          events.push({ type: 'damage-dealt', data: {
            attackerSlotId, targetSlotId, moveId: move.id,
            damage: subDamage, effectiveness, remainingHp: target.currentHp, note: 'substitute',
          }});
          if (subEntry.hp <= 0) {
            target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'substitute');
            events.push({ type: 'volatile-cured', data: { slotId: targetSlotId, volatile: 'substitute' } });
          }
        } else {
          const actualDamage = Math.min(finalDamage, target.currentHp);
          // Endure: cap damage so HP stays at 1
          const endureEntry = target.volatileStatus.find(v => v.name === 'endure');
          let cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
            ? target.currentHp - 1
            : actualDamage;
          // Focus Sash: survive OHKO at 1 HP if currently at full HP
          if (
            target.heldItem === 'focus-sash' &&
            target.currentHp === target.maxHp &&
            target.currentHp - cappedDamage <= 0
          ) {
            cappedDamage = target.currentHp - 1;
            delete target.heldItem;
            events.push({ type: 'focus-sash', data: { slotId: targetSlotId } });
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'focus-sash', reason: 'triggered' } });
          }
          target.currentHp -= cappedDamage;
          totalDamage += cappedDamage;

          events.push({ type: 'damage-dealt', data: {
            attackerSlotId, targetSlotId, moveId: move.id,
            damage: cappedDamage, effectiveness, remainingHp: target.currentHp,
          }});

          if (endureEntry && cappedDamage < actualDamage) {
            events.push({ type: 'endure-survived', data: { slotId: targetSlotId } });
          }

          if (isCritical) {
            events.push({ type: 'crit', data: { slotId: targetSlotId } });
          }

          if (target.currentHp <= 0) {
            target.fainted = true;
            target.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
            // Destiny Bond: if the target had destiny-bond, the attacker also faints
            const dbEntry = target.volatileStatus.find(v => v.name === 'destiny-bond');
            if (dbEntry && !attacker.fainted) {
              attacker.currentHp = 0;
              attacker.fainted = true;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
        }
      }

      // Post-hit secondaries (applied after final hit, uses accumulated totalDamage)
      const targetHasSub = target.volatileStatus.some(v => v.name === 'substitute');
      if (totalDamage > 0) {
        if (!target.fainted && !targetHasSub && !sheerForceActive) {
          const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes, s, attackerAbilityForDmg);
          if (secondaryEvent) events.push(secondaryEvent);
          const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
          if (volatileEvent) events.push(volatileEvent);
        }

        const postSecs = secs.filter(sec =>
          sec.kind !== 'multihit' && sec.kind !== 'ohko' && sec.kind !== 'charge' && sec.kind !== 'pivot'
        );
        const isSoundMove = move.soundMove === true;
        if (postSecs.length > 0 && !target.fainted && (!targetHasSub || isSoundMove) && !sheerForceActive) {
          events.push(...applySecondaries({
            secondaries: postSecs,
            totalDamage,
            user: attacker,
            userSlotId: attackerSlotId,
            userAbility: attackerAbilityForDmg,
            target,
            targetSlotId,
            targetTypes: defTypes,
            battle: s,
            rng: this.rng,
            movedSlotIds,
          }));

          // Lum Berry: cure status applied by secondary effects
          if (target.status && !target.fainted) {
            const lumResult = getItemHooks(target.heldItem).onStatusApplied?.({
              holder: target,
              state: s,
              status: target.status,
            });
            if (lumResult?.cureStatus) {
              const curedStatus = target.status;
              delete target.status;
              events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: curedStatus, reason: 'lum-berry' } });
              if (lumResult.consume && target.heldItem) {
                const itemName = target.heldItem;
                delete target.heldItem;
                events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
              }
            }
          }
        }
      }

      // Defender's ability triggers (e.g. Static, Flame Body, Rough Skin, Iron Barbs)
      if (totalDamage > 0 && !target.fainted) {
        const afterHitCtx = {
          user: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical: move.category === 'physical',
          makesContact: move.makesContact === true,
          rng: this.rng,
        };
        const afterHitResult = getAbilityHooks(effectiveAbilityId(target)).onAfterHit?.(afterHitCtx);
        if (afterHitResult) {
          if (afterHitResult.statusToApply && !attacker.fainted) {
            const attackerSpecies = this.data.getSpecies(attacker.speciesId);
            const attackerTypes = attacker.hasTerastallized && attacker.teraType
              ? [attacker.teraType] as PokemonType[]
              : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
            const evt = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s);
            if (evt) events.push(evt);
          }
          if (afterHitResult.statBoostDeltas && !attacker.fainted) {
            events.push(applyStatBoost(attacker, attackerSlotId, afterHitResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (afterHitResult.abilityOverride && !attacker.fainted) {
            attacker.ability = afterHitResult.abilityOverride;
            events.push({ type: 'ability-triggered', data: { slotId: attackerSlotId, ability: afterHitResult.abilityOverride, effect: 'mummy' } });
          }
          if (afterHitResult.directDamage !== undefined && !attacker.fainted) {
            const dmg = Math.min(afterHitResult.directDamage, attacker.currentHp);
            attacker.currentHp -= dmg;
            events.push({ type: 'damage-dealt', data: { source: 'ability-contact', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              attacker.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (afterHitResult.volatileToApply && !attacker.fainted) {
            if (!attacker.volatileStatus.some(v => v.name === afterHitResult.volatileToApply)) {
              attacker.volatileStatus.push({ name: afterHitResult.volatileToApply! });
              events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: afterHitResult.volatileToApply } });
            }
          }
          if (afterHitResult.disableMoveId && !attacker.fainted) {
            if (!attacker.volatileStatus.some(v => v.name === 'disable')) {
              attacker.volatileStatus.push({ name: 'disable', moveId: afterHitResult.disableMoveId });
              events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'disable', moveId: afterHitResult.disableMoveId } });
            }
          }
        }
      }

      // Shell Bell — heal attacker after dealing damage
      if (totalDamage > 0 && !attacker.fainted) {
        const sbResult = itemHooks.onHealAfterAttack?.({
          holder: attacker,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target,
          isPhysical,
          damageDealt: totalDamage,
        });
        if (sbResult && sbResult.hpDelta > 0) {
          const healed = Math.min(sbResult.hpDelta, attacker.maxHp - attacker.currentHp);
          if (healed > 0) {
            attacker.currentHp += healed;
            events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: healed, remainingHp: attacker.currentHp } });
          }
        }
      }

      // Post-hit item triggers (Rocky Helmet, Air Balloon pop, Weakness Policy)
      if (totalDamage > 0 && !attacker.fainted) {
        // Rocky Helmet
        const helmetResult = getItemHooks(target.heldItem).onAfterHit?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical,
          makesContact: move.makesContact === true,
          totalDamage,
        });
        if (helmetResult?.directDamageToAttacker) {
          const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
          attacker.currentHp -= dmg;
          events.push({ type: 'damage-dealt', data: { source: 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
      }

      // Air Balloon pop (any damaging hit bursts the balloon)
      if (totalDamage > 0 && target.heldItem === 'air-balloon') {
        delete target.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'air-balloon', reason: 'popped' } });
      }

      // Weakness Policy
      if (effectiveness > 1 && totalDamage > 0 && !target.fainted && target.heldItem === 'weakness-policy') {
        const policyItem = target.heldItem;
        delete target.heldItem;
        events.push(applyStatBoost(target, targetSlotId, { atk: 2, spa: 2 }));
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: policyItem, reason: 'triggered' } });
      }

      // Defender berry triggers after taking damage (Sitrus Berry, Salac Berry, etc.)
      if (totalDamage > 0 && !target.fainted) {
        const berryHooks = getItemHooks(target.heldItem);
        if (berryHooks.onAfterDamageTaken) {
          const berryResult = berryHooks.onAfterDamageTaken({
            holder: target,
            state: s,
            damageTaken: totalDamage,
            effectiveness,
          });
          if (berryResult.hpDelta > 0) {
            const heal = Math.min(berryResult.hpDelta, target.maxHp - target.currentHp);
            if (heal > 0) {
              target.currentHp += heal;
              events.push({ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } });
            }
          }
          if (berryResult.statBoostDeltas) {
            events.push(applyStatBoost(target, targetSlotId, berryResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (berryResult.consume) {
            const itemName = target.heldItem!;
            delete target.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
          }
        }
      }

      // Life Orb recoil etc.
      if (totalDamage > 0 && itemHooks.onAfterDamageTaken) {
        const { hpDelta } = itemHooks.onAfterDamageTaken({ holder: attacker, state: s, damageTaken: totalDamage });
        if (hpDelta < 0) {
          const recoil = Math.min(-hpDelta, attacker.currentHp);
          attacker.currentHp -= recoil;
          events.push({ type: 'damage-dealt', data: { source: 'life-orb', slotId: attackerSlotId, damage: recoil, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
      }
    }

    attacker.lastMoveId = move.id;

    const hasPivot = secs.some(sec => sec.kind === 'pivot');
    if (hasPivot && !attacker.fainted) {
      const attackerSlotForPivot = this.findSlot(s, attackerSlotId);
      const hasBench = attackerSlotForPivot?.party.some(
        (p, i) => i !== attackerSlotForPivot.activePokemonIndex && !p.fainted
      ) ?? false;
      if (hasBench) {
        return { newState: s, events, pivotSwitch: true };
      } else {
        events.push({ type: 'pivot-skipped', data: { slotId: attackerSlotId } });
      }
    }

    return { newState: s, events };
  }

  public processForceSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'forced' | 'phased',
  ): TurnResult {
    return this.performSwitch(state, slotId, targetInstanceId, reason);
  }

  public resumeTurn(
    state: BattleState,
    remainingSlotOrder: string[],
    actions: Record<string, MoveAction | SwitchAction>,
    movedSlotIds: Set<string>,
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    for (const slotId of remainingSlotOrder) {
      if (movedSlotIds.has(slotId)) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;

      const action = actions[slotId];
      if (!action) continue;

      if (action.type === 'move') {
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, remainingSlotOrder);
        events.push(...moveResult.events);
        s = moveResult.newState;
        // Pivot chaining within a single turn is not supported — ignore pivotSwitch here
      } else if (action.type === 'switch') {
        const switchResult = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchResult.events);
        s = switchResult.newState;
      }

      movedSlotIds.add(slotId);
      if (this.checkWinCondition(s) !== null) break;
    }

    const eotResult = this.endOfTurn(s);
    events.push(...eotResult.events);
    s = eotResult.newState;

    const winner = this.checkWinCondition(s);
    if (winner !== null) {
      s = { ...s, phase: 'ended', winner };
    } else {
      s = { ...s, turnNumber: s.turnNumber + 1, phase: 'action' };
    }

    return { newState: s, events };
  }

  private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
    return this.performSwitch(state, slotId, targetInstanceId, 'voluntary');
  }

  private performSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'voluntary' | 'forced' | 'phased',
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);
    const slot = this.findSlot(s, slotId);
    if (!slot) return { newState: s, events };
    const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
    if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

    const outgoing = slot.party[slot.activePokemonIndex];
    const outInstanceId = outgoing?.instanceId;

    // 1. onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v => !ABILITY_VOLATILE_CLEAR.has(v.name));
    }

    // 2. Switch-out cleanup
    if (outgoing) {
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
      delete outgoing.tracedAbilityId;
      delete outgoing.lockedMoveId;
    }

    // 3. Update active slot
    slot.activePokemonIndex = newIndex;
    const incoming = slot.party[slot.activePokemonIndex];

    // 4. Entry hazards — before onSwitchIn (FR-6)
    if (incoming) {
      const incomingTeamIndex = s.teams.findIndex(t =>
        t.slots.some(sl => sl.slotId === slotId)
      ) as 0 | 1;
      const incomingSide = s.field.sideConditions[incomingTeamIndex]!;
      const incomingTypes = this.resolveEffectiveTypes(incoming);
      const grounded = isGrounded(incoming, incomingTypes, s.field.gravity > 0);
      events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTeamIndex, incomingTypes, grounded, this.data));
    }

    // 5. onSwitchIn ability hook
    if (incoming) {
      const incomingAbilityHooks = getAbilityHooks(incoming.ability);
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
      if (switchInResult) {
        this.applySwitchInResult(s, slotId, incoming, switchInResult, events);
      }
    }

    // 6. Emit pokemon-switched event
    events.push({
      type: 'pokemon-switched',
      data: { slotId, outInstanceId, inInstanceId: targetInstanceId, reason },
    });

    return { newState: s, events };
  }

  private applySwitchInResult(
    s: BattleState,
    slotId: string,
    incoming: PartyMember,
    result: SwitchInResult,
    events: TurnResolveEvent[],
  ): void {
    // Apply foe stat deltas (Intimidate)
    if (result.statBoostDeltas) {
      const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIndex = incomingTeamIndex === 0 ? 1 : 0;
      const foeTeam = s.teams[foeTeamIndex];
      if (foeTeam) {
        for (const foeSlot of foeTeam.slots) {
          const foePokemon = foeSlot.party[foeSlot.activePokemonIndex];
          if (foePokemon && !foePokemon.fainted) {
            const event = applyStatBoost(
              foePokemon,
              foeSlot.slotId,
              result.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
            );
            events.push(event);
          }
        }
      }
    }

    // Apply self stat deltas (Download)
    if (result.selfBoostDeltas) {
      const event = applyStatBoost(
        incoming,
        slotId,
        result.selfBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
      );
      events.push(event);
    }

    // Handle Trace — set tracedAbilityId and re-invoke onSwitchIn once (skip if traced is also Trace)
    if (result.traceAbilityId) {
      incoming.tracedAbilityId = result.traceAbilityId;
      if (result.traceAbilityId !== 'trace') {
        const tracedHooks = getAbilityHooks(result.traceAbilityId);
        const tracedResult = tracedHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
        if (tracedResult) {
          this.applySwitchInResult(s, slotId, incoming, tracedResult, events);
        }
      }
    }

    // Handle Screen Cleaner — remove all screens from both sides
    if (result.clearScreens) {
      s.field.sideConditions.forEach((side, sideIdx) => {
        if (side.reflect > 0) {
          side.reflect = 0;
          events.push({ type: 'screen-broken', data: { screen: 'reflect', side: sideIdx } });
        }
        if (side.lightScreen > 0) {
          side.lightScreen = 0;
          events.push({ type: 'screen-broken', data: { screen: 'lightScreen', side: sideIdx } });
        }
        if (side.auroraVeil > 0) {
          side.auroraVeil = 0;
          events.push({ type: 'screen-broken', data: { screen: 'auroraVeil', side: sideIdx } });
        }
      });
    }

    // Handle weather-summoning abilities (Drizzle, Drought, etc.)
    if (result.setWeather) {
      const { type, turnsRemaining, permanent } = result.setWeather;
      // Only overwrite if current weather is not permanent, or new weather is also permanent
      if (!s.field.weather?.permanent || permanent) {
        s.field.weather = { type, turnsRemaining, fromAbility: true, ...(permanent !== undefined ? { permanent } : {}) };
        events.push({ type: 'weather-started', data: { weather: type, turnsRemaining } });
      }
    }
  }

  private endOfTurn(state: BattleState): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);

    for (const team of s.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;

        const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
        events.push(...eotResult.events);

        const itemHooks = getItemHooks(active.heldItem);
        const hasEmbargo = active.volatileStatus.some(v => v.name === 'embargo');
        if (itemHooks.onEndOfTurn && !hasEmbargo) {
          const { hpDelta } = itemHooks.onEndOfTurn({ holder: active, state: s });
          if (hpDelta > 0) {
            const heal = Math.min(hpDelta, active.maxHp - active.currentHp);
            active.currentHp += heal;
            events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
          }
        }
      }
    }

    // Weather residual damage — sand chips non-Rock/Ground/Steel; snow chips non-Ice
    const activeWeather = s.field.weather?.type;
    if (activeWeather === 'sand' || activeWeather === 'snow') {
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          const immune =
            (activeWeather === 'sand' && types.some(t => ['Rock', 'Ground', 'Steel'].includes(t))) ||
            (activeWeather === 'snow' && types.includes('Ice'));
          if (!immune) {
            const chip = Math.floor(active.maxHp / 16);
            const actual = Math.min(chip, active.currentHp);
            active.currentHp -= actual;
            events.push({ type: 'damage-dealt', data: { source: 'weather', slotId: slot.slotId, damage: actual, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
        }
      }
    }

    // Grassy Terrain EoT heal — 1/16 maxHp for every grounded Pokémon
    if (s.field.terrain?.type === 'grassy') {
      const gravityActive = s.field.gravity > 0;
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          if (isGrounded(active, types, gravityActive)) {
            const heal = Math.floor(active.maxHp / 16);
            const actual = Math.min(heal, active.maxHp - active.currentHp);
            if (actual > 0) {
              active.currentHp += actual;
              events.push({ type: 'heal', data: { slotId: slot.slotId, amount: actual, remainingHp: active.currentHp, reason: 'grassy-terrain' } });
            }
          }
        }
      }
    }

    // Field counter decrements + expiry events
    if (s.field.weather) {
      if (!s.field.weather.permanent) {
        s.field.weather.turnsRemaining -= 1;
        if (s.field.weather.turnsRemaining <= 0) {
          events.push({ type: 'weather-ended', data: { weather: s.field.weather.type } });
          delete s.field.weather;
        }
      }
    }
    if (s.field.terrain) {
      s.field.terrain.turnsRemaining -= 1;
      if (s.field.terrain.turnsRemaining <= 0) {
        events.push({ type: 'terrain-ended', data: { terrain: s.field.terrain.type } });
        delete s.field.terrain;
      }
    }
    if (s.field.trickroom > 0) {
      s.field.trickroom -= 1;
      if (s.field.trickroom === 0) {
        events.push({ type: 'trickroom-ended', data: {} });
      }
    }
    if (s.field.gravity > 0) {
      s.field.gravity -= 1;
      if (s.field.gravity === 0) {
        events.push({ type: 'gravity-ended', data: {} });
      }
    }

    // Screen turn counter decrements
    for (let i = 0; i < 2; i++) {
      decrementScreens(s.field.sideConditions[i]!, i as 0 | 1, events);
    }

    return { newState: s, events };
  }

  private getSpreadTargets(state: BattleState, attackerSlotId: string, target: string): string[] {
    if (target === 'self') return [attackerSlotId];
    const attackerTeamIndex = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === attackerSlotId));
    const foeTeamIndex = attackerTeamIndex === 0 ? 1 : 0;
    const foeTeam = state.teams[foeTeamIndex];
    if (!foeTeam) return [];
    return foeTeam.slots
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);
  }

  private checkWinCondition(state: BattleState): 0 | 1 | null {
    for (let i = 0; i < 2; i++) {
      const team = state.teams[i];
      if (!team) continue;
      const allFainted = team.slots.every((slot) =>
        slot.party.every((p) => p.fainted)
      );
      if (allFainted) return i === 0 ? 1 : 0;
    }
    return null;
  }

  private findSlot(state: BattleState, slotId: string): SlotState | null {
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot;
    }
    return null;
  }

  private getAllSlots(state: BattleState): SlotContext[] {
    return state.teams.flatMap((team, teamIndex) =>
      team.slots.map(slot => ({
        member: slot.party[slot.activePokemonIndex]!,
        slotId: slot.slotId,
        teamIndex,
      }))
    );
  }

  private resolveEffectiveTypes(member: PartyMember): PokemonType[] {
    if (member.hasTerastallized && member.teraType) return [member.teraType];
    const species = this.data.getSpecies(member.speciesId);
    return (species?.types ?? ['Normal']) as PokemonType[];
  }

  private resolveStatusTargets(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    move: Move,
  ): { targets: PartyMember[]; targetSlotIds: string[] } {
    if (['allySide', 'foeSide', 'all'].includes(move.target)) {
      return { targets: [], targetSlotIds: [] };
    }
    if (['self', 'allyTeam', 'allies', 'adjacentAllyOrSelf', 'adjacentAlly'].includes(move.target)) {
      const slot = this.findSlot(state, attackerSlotId);
      const mon = slot?.party[slot.activePokemonIndex];
      return mon ? { targets: [mon], targetSlotIds: [attackerSlotId] } : { targets: [], targetSlotIds: [] };
    }
    const slotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(state, attackerSlotId, move.target);
    const targets: PartyMember[] = [];
    const resolvedSlotIds: string[] = [];
    for (const id of slotIds) {
      const slot = this.findSlot(state, id);
      const mon = slot?.party[slot.activePokemonIndex];
      if (mon && !mon.fainted) { targets.push(mon); resolvedSlotIds.push(id); }
    }
    return { targets, targetSlotIds: resolvedSlotIds };
  }

  private rollHitCount(hits: number | [number, number]): number {
    if (typeof hits === 'number') return hits;
    const [min, max] = hits;
    if (min === 2 && max === 5) {
      const r = this.rng();
      if (r < 3 / 8) return 2;
      if (r < 6 / 8) return 3;
      if (r < 7 / 8) return 4;
      return 5;
    }
    return min + Math.floor(this.rng() * (max - min + 1));
  }
}
