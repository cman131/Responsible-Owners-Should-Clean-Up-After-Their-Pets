import type {
  PartyMember, BattleState, TurnResolveEvent,
} from '@poke-fighter/shared';
import { FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE, CONFUSION_HURT_CHANCE, getBurnDamage, getPoisonDamage, getToxicDamage } from './status.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';

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
    _allSlots: SlotContext[],
  ): EndOfTurnResult {
    const events: TurnResolveEvent[] = [];

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
