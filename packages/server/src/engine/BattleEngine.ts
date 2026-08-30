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
import { getAbilityHooks } from './abilities.js';
import { getItemHooks } from './items.js';
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries } from './effects.js';
import type { SecondaryContext } from './effects.js';
import { MoveEffectRegistry, MoveContext } from './MoveEffectRegistry.js';
import { buildDefaultRegistry } from './registrations.js';
import { SWITCH_CLEAR_NAMES, SWITCH_CLEAR_PREFIXES } from './volatileClearRules.js';

const ALWAYS_THAW_MOVES = new Set(['scald', 'steameruption', 'sparklingaria']);

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
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds);
        events.push(...moveResult.events);
        s = moveResult.newState;
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

    return entries
      .sort((a, b) => b.priority - a.priority || b.spe - a.spe || Math.random() - 0.5)
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
  ): TurnResult {
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
      const hitChance = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        return { newState: s, events };
      }
    }

    // Charge-turn check
    const chargeSec = secs.find(sec => sec.kind === 'charge');
    if (chargeSec) {
      const isSun = s.field.weather?.type === 'sun';
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

    for (const targetSlotId of targetSlotIds) {
      const targetSlot = this.findSlot(s, targetSlotId);
      if (!targetSlot) continue;
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

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
            const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes, undefined, s.field);
            if (evt) events.push(evt);
          }
        }
        continue;
      }

      if (target.status === 'frz' && (move.type === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
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
        if (move.type === 'Normal' || move.type === 'Fighting') {
          effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Ghost');
        }
      }
      // Miracle Eye: Psychic hits Dark
      if (target.volatileStatus.some(v => v.name === 'miracle-eye') && move.type === 'Psychic') {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Dark');
      }
      // Roost: user loses Flying type for the rest of this turn
      if (target.volatileStatus.some(v => v.name === 'roost')) {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Flying');
        if (effectiveDefTypes.length === 0) effectiveDefTypes = ['Normal'];
      }

      const effectiveness = this.data.getCombinedEffectiveness(move.type, effectiveDefTypes);
      if (effectiveness === 0) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Magnet Rise: Ground immunity
      if (move.type === 'Ground' && target.volatileStatus.some(v => v.name === 'magnet-rise')) {
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

      let totalDamage = 0;
      for (let hit = 0; hit < hitCount; hit++) {
        if (target.fainted) break;

        const attackerSpecies = this.data.getSpecies(attacker.speciesId);
        const attackerTypes = attacker.hasTerastallized && attacker.teraType
          ? [attacker.teraType] as PokemonType[]
          : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
        const stab = attackerTypes.includes(move.type);

        const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
        const boostKey = isPhysical ? 'atk' as const : 'spa' as const;
        const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
        const defBoostKey = isPhysical ? 'def' as const : 'spd' as const;

        const critStage = computeCritStage(move.critRatio, attacker.volatileStatus);
        const isCritical = this.rng() < critProbability(critStage);
        const atkBoost = isCritical ? Math.max(0, attacker.statBoosts[boostKey]) : attacker.statBoosts[boostKey];
        const defBoost = isCritical ? Math.min(0, target.statBoosts[defBoostKey]) : target.statBoosts[defBoostKey];

        let atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);
        const abilityHooks = getAbilityHooks(attacker.ability);
        if (abilityHooks.onAttackerModifier) {
          atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
            user: attacker, state: s, moveType: move.type, basePower: move.basePower, target,
          }));
        }
        const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
        const isSpread = targetSlotIds.length > 1;
        let otherModifiers = isSpread ? 0.75 : 1;
        if (itemHooks.onAttackerModifier) {
          otherModifiers *= itemHooks.onAttackerModifier({
            holder: attacker, state: s, moveType: move.type, basePower: move.basePower, target, isPhysical,
          });
        }

        const { damage } = calcDamage({
          level: attacker.level,
          attackStat: atkStat,
          defenseStat: defStat,
          basePower: move.basePower,
          typeEffectiveness: effectiveness,
          stab,
          isBurned: isPhysical && attacker.status === 'brn',
          randomFactor: randomDamageFactor(),
          isCritical,
          moveType: move.type,
          ...(s.field.weather ? { weather: s.field.weather.type } : {}),
          otherModifiers,
        });

        let finalDamage = damage;
        const abilityDmgMod = abilityHooks.onDamageModifier?.({ user: attacker, state: s, moveType: move.type, basePower: move.basePower, target });
        if (abilityDmgMod !== undefined) finalDamage = Math.floor(finalDamage * abilityDmgMod);
        const itemDmgMod = itemHooks.onDamageModifier?.({ holder: attacker, state: s, moveType: move.type, basePower: move.basePower, target, isPhysical });
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
          const cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
            ? target.currentHp - 1
            : actualDamage;
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
        if (!target.fainted && !targetHasSub) {
          const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes, s.field);
          if (secondaryEvent) events.push(secondaryEvent);
          const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
          if (volatileEvent) events.push(volatileEvent);
        }

        const postSecs = secs.filter(sec => sec.kind !== 'multihit' && sec.kind !== 'ohko' && sec.kind !== 'charge');
        const isSoundMove = move.soundMove === true;
        if (postSecs.length > 0 && !target.fainted && (!targetHasSub || isSoundMove)) {
          events.push(...applySecondaries({
            secondaries: postSecs,
            totalDamage,
            user: attacker,
            userSlotId: attackerSlotId,
            target,
            targetSlotId,
            targetTypes: defTypes,
            battle: s,
            rng: this.rng,
            movedSlotIds,
          }));
        }
      }

      // Defender's ability triggers (e.g. Static, Flame Body)
      const defenderAbilityHooks = getAbilityHooks(target.ability);
      if (defenderAbilityHooks.onAfterHit && totalDamage > 0 && !target.fainted) {
        const afterHitResult = defenderAbilityHooks.onAfterHit({
          user: target, state: s, moveType: move.type, basePower: move.basePower,
          target: attacker, isPhysical: move.category === 'physical',
        });
        if (afterHitResult?.statusToApply) {
          const attackerSpecies = this.data.getSpecies(attacker.speciesId);
          const attackerTypes = attacker.hasTerastallized && attacker.teraType
            ? [attacker.teraType] as PokemonType[]
            : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
          const event = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s.field);
          if (event) events.push(event);
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
    return { newState: s, events };
  }

  private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);
    const slot = this.findSlot(s, slotId);
    if (!slot) return { newState: s, events };
    const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
    if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

    const outgoing = slot.party[slot.activePokemonIndex];
    const previousMon = outgoing?.instanceId;

    // Clear switch-out volatiles and stat boosts before updating active index
    if (outgoing) {
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
    }

    slot.activePokemonIndex = newIndex;
    events.push({ type: 'volatile-applied', data: { note: 'switch', slotId, from: previousMon, to: targetInstanceId } });

    // Apply incoming ability's switch-in effect (e.g. Intimidate drops opponent attack)
    const incoming = slot.party[slot.activePokemonIndex];
    if (incoming) {
      const incomingAbilityHooks = getAbilityHooks(incoming.ability);
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s });
      if (switchInResult?.statBoostDeltas) {
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
                switchInResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
              );
              events.push(event);
            }
          }
        }
      }
    }

    return { newState: s, events };
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

    if (s.field.weather) {
      s.field.weather.turnsRemaining -= 1;
      if (s.field.weather.turnsRemaining <= 0) {
        events.push({ type: 'weather-change', data: { weather: null } });
        delete s.field.weather;
      }
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
