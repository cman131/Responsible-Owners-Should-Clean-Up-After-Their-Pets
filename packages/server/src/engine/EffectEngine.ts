import type {
  PartyMember, BattleState, TurnResolveEvent,
} from '@poke-fighter/shared';
import { FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE, CONFUSION_HURT_CHANCE, getBurnDamage, getPoisonDamage, getToxicDamage } from './status.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
import { applyStatus } from './effects.js';

export interface SlotContext {
  member: PartyMember;
  slotId: string;
  teamIndex: number;
}

export interface PreMoveResult {
  blocked: boolean;
  events: TurnResolveEvent[];
}

export interface EndOfTurnResult {
  events: TurnResolveEvent[];
}

export class EffectEngine {
  runPreMove(
    pokemon: PartyMember,
    slotId: string,
    _state: BattleState,
    _allSlots: SlotContext[],
  ): PreMoveResult {
    const events: TurnResolveEvent[] = [];

    const flinchEntry = pokemon.volatileStatus.find(v => v.name === 'flinch');
    if (flinchEntry) {
      pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'flinch');
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'flinch' } });
      return { blocked: true, events };
    }

    const rechargeEntry = pokemon.volatileStatus.find(v => v.name === 'recharge');
    if (rechargeEntry) {
      pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'recharge');
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'recharge' } });
      return { blocked: true, events };
    }

    if (pokemon.status === 'slp') {
      const entry = pokemon.volatileStatus.find(v => v.name === 'sleep');
      if (!entry || (entry.counter ?? 0) === 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'sleep');
        delete pokemon.status;
        events.push({ type: 'status-cured', data: { slotId, status: 'slp' } });
        return { blocked: false, events };
      }
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'asleep' } });
      entry.counter = (entry.counter ?? 1) - 1;
      return { blocked: true, events };
    }

    if (pokemon.status === 'frz') {
      if (Math.random() < FREEZE_THAW_CHANCE) {
        delete pokemon.status;
        events.push({ type: 'status-cured', data: { slotId, status: 'frz' } });
        return { blocked: false, events };
      }
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'frozen' } });
      return { blocked: true, events };
    }

    if (pokemon.status === 'par') {
      if (Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE) {
        events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'paralysis' } });
        return { blocked: true, events };
      }
    }

    const confusionEntry = pokemon.volatileStatus.find(v => v.name === 'confusion');
    if (confusionEntry) {
      if ((confusionEntry.counter ?? 0) === 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'confusion');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'confusion' } });
      } else {
        confusionEntry.counter = (confusionEntry.counter ?? 1) - 1;
        if (Math.random() < CONFUSION_HURT_CHANCE) {
          const atkStat = getEffectiveStat(pokemon.stats.atk, pokemon.statBoosts.atk, 'atk');
          const defStat = getEffectiveStat(pokemon.stats.def, pokemon.statBoosts.def, 'def');
          const { damage } = calcDamage({
            level: pokemon.level,
            attackStat: atkStat,
            defenseStat: defStat,
            basePower: 40,
            typeEffectiveness: 1,
            stab: false,
            isBurned: false,
            randomFactor: randomDamageFactor(),
            otherModifiers: 1,
          });
          const actual = Math.min(damage, pokemon.currentHp);
          pokemon.currentHp -= actual;
          events.push({ type: 'damage-dealt', data: { source: 'confusion', slotId, damage: actual, remainingHp: pokemon.currentHp } });
          if (pokemon.currentHp <= 0) {
            pokemon.fainted = true;
            pokemon.currentHp = 0;
            events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
          }
          return { blocked: true, events };
        }
      }
    }

    return { blocked: false, events };
  }

  runEndOfTurn(
    pokemon: PartyMember,
    slotId: string,
    _state: BattleState,
    allSlots: SlotContext[],
  ): EndOfTurnResult {
    const events: TurnResolveEvent[] = [];

    // Remove protect at EoT (streak persists)
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'protect' && v.name !== 'roost');

    if (pokemon.status === 'brn') {
      this.applyDamage(pokemon, slotId, getBurnDamage(pokemon.maxHp), 'status', events);
      if (pokemon.fainted) return { events };
    } else if (pokemon.status === 'psn') {
      this.applyDamage(pokemon, slotId, getPoisonDamage(pokemon.maxHp), 'status', events);
      if (pokemon.fainted) return { events };
    } else if (pokemon.status === 'tox') {
      let toxEntry = pokemon.volatileStatus.find(v => v.name === 'toxic');
      if (!toxEntry) {
        toxEntry = { name: 'toxic', counter: 0 };
        pokemon.volatileStatus.push(toxEntry);
      }
      toxEntry.counter = (toxEntry.counter ?? 0) + 1;
      this.applyDamage(pokemon, slotId, getToxicDamage(pokemon.maxHp, toxEntry.counter), 'status', events);
      if (pokemon.fainted) return { events };
    }

    const leechEntry = pokemon.volatileStatus.find(v => v.name === 'leech-seed');
    if (leechEntry) {
      const drain = Math.max(1, Math.floor(pokemon.maxHp / 8));
      const actual = Math.min(drain, pokemon.currentHp);
      pokemon.currentHp -= actual;
      events.push({ type: 'damage-dealt', data: { source: 'leech-seed', slotId, damage: actual, remainingHp: pokemon.currentHp } });
      if (pokemon.currentHp <= 0) {
        pokemon.fainted = true;
        pokemon.currentHp = 0;
        events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
      }
      const sourceCtx = allSlots.find(s => s.slotId === leechEntry.sourceSlotId);
      if (sourceCtx && !sourceCtx.member.fainted) {
        const heal = Math.min(actual, sourceCtx.member.maxHp - sourceCtx.member.currentHp);
        if (heal > 0) {
          sourceCtx.member.currentHp += heal;
          events.push({ type: 'heal', data: { slotId: leechEntry.sourceSlotId, amount: heal, remainingHp: sourceCtx.member.currentHp } });
        }
      }
      if (pokemon.fainted) return { events };
    }

    const boundEntry = pokemon.volatileStatus.find(v => v.name === 'bound');
    if (boundEntry) {
      this.applyDamage(pokemon, slotId, Math.max(1, Math.floor(pokemon.maxHp / 8)), 'bound', events);
      boundEntry.counter = (boundEntry.counter ?? 1) - 1;
      if ((boundEntry.counter ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'bound');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'bound' } });
      }
      if (pokemon.fainted) return { events };
    }

    const yawnEntry = pokemon.volatileStatus.find(v => v.name === 'yawn');
    if (yawnEntry) {
      yawnEntry.counter = (yawnEntry.counter ?? 1) - 1;
      if ((yawnEntry.counter ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'yawn');
        // IMMUNITIES.slp = [] so passing [] as types is correct — no type is immune to sleep
        const evt = applyStatus(pokemon, slotId, 'slp', []);
        if (evt) events.push(evt);
      }
    }

    return { events };
  }

  private applyDamage(
    pokemon: PartyMember,
    slotId: string,
    amount: number,
    source: string,
    events: TurnResolveEvent[],
  ): void {
    const actual = Math.min(amount, pokemon.currentHp);
    pokemon.currentHp -= actual;
    events.push({ type: 'damage-dealt', data: { source, slotId, damage: actual, remainingHp: pokemon.currentHp } });
    if (pokemon.currentHp <= 0) {
      pokemon.fainted = true;
      pokemon.currentHp = 0;
      events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
    }
  }
}
