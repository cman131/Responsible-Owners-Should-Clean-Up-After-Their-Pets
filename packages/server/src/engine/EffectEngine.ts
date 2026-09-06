import type {
  PartyMember, BattleState, TurnResolveEvent,
} from '@poke-fighter/shared';
import { FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE, CONFUSION_HURT_CHANCE, getBurnDamage, getPoisonDamage, getToxicDamage } from './status.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
import { applyStatus, applyStatBoost } from './effects.js';

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
    allSlots: SlotContext[],
    rng: () => number = Math.random,
  ): PreMoveResult {
    const events: TurnResolveEvent[] = [];

    // Sub-move bypass: skip all pre-move checks
    const subMoveBypass = pokemon.volatileStatus.find(v => v.name === '__submove-bypass');
    if (subMoveBypass) {
      pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== '__submove-bypass');
      return { blocked: false, events: [] };
    }

    // Bide: decrement counter; release on counter reaching 0
    const bideEntry = pokemon.volatileStatus.find(v => v.name === 'bide');
    if (bideEntry) {
      bideEntry.counter = (bideEntry.counter ?? 1) - 1;
      if ((bideEntry.counter ?? 0) <= 0) {
        // Release: deal 2x accumulated damage to last attacker
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'bide');
        const accumulated = bideEntry.accumulated ?? 0;
        if (accumulated > 0 && pokemon.lastDamageTaken) {
          const lastAttackerCtx = allSlots.find(s => s.slotId === pokemon.lastDamageTaken!.fromSlotId);
          if (lastAttackerCtx && !lastAttackerCtx.member.fainted) {
            const bideRelease = accumulated * 2;
            const actual = Math.min(bideRelease, lastAttackerCtx.member.currentHp);
            lastAttackerCtx.member.currentHp -= actual;
            events.push({ type: 'damage-dealt', data: {
              source: 'bide',
              slotId: lastAttackerCtx.slotId,
              damage: actual,
              remainingHp: lastAttackerCtx.member.currentHp,
            }});
            if (lastAttackerCtx.member.currentHp <= 0) {
              lastAttackerCtx.member.fainted = true;
              lastAttackerCtx.member.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: lastAttackerCtx.slotId, instanceId: lastAttackerCtx.member.instanceId } });
            }
          }
        }
        // Whether or not damage was dealt, block the chosen move
        return { blocked: true, events };
      }
      // Still biding (counter > 0) — block chosen move
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'bide' } });
      return { blocked: true, events };
    }

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
      // Allow Sleep Talk to execute while asleep
      const sleepTalkBypass = pokemon.volatileStatus.find(v => v.name === '__sleeptalk-bypass');
      if (sleepTalkBypass) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== '__sleeptalk-bypass');
        return { blocked: false, events: [] };
      }
      const entry = pokemon.volatileStatus.find(v => v.name === 'sleep');
      if (!entry || (entry.counter ?? 0) === 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'sleep');
        delete pokemon.status;
        events.push({ type: 'status-cured', data: { slotId, status: 'slp', pokemonName: pokemon.nickname } });
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

    const infatuationEntry = pokemon.volatileStatus.find(v => v.name === 'infatuation');
    if (infatuationEntry) {
      if (rng() < 0.5) {
        events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'infatuation' } });
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
    state: BattleState,
    allSlots: SlotContext[],
  ): EndOfTurnResult {
    const events: TurnResolveEvent[] = [];

    // Remove protect, roost, mat-block at EoT (streak persists)
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'protect' && v.name !== 'roost' && v.name !== 'mat-block');

    // Decrement fresh-switcher (Mat Block eligibility) and remove when expired
    const freshSwitcherEntry = pokemon.volatileStatus.find(v => v.name === 'fresh-switcher');
    if (freshSwitcherEntry) {
      freshSwitcherEntry.turnsRemaining = (freshSwitcherEntry.turnsRemaining ?? 1) - 1;
      if ((freshSwitcherEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'fresh-switcher');
      }
    }

    // Powder expires after 1 turn if not consumed by a Fire move
    const powderEntry = pokemon.volatileStatus.find(v => v.name === 'powder');
    if (powderEntry) {
      powderEntry.turnsRemaining = (powderEntry.turnsRemaining ?? 1) - 1;
      if ((powderEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'powder');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'powder' } });
      }
    }

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

    // Nightmare: 25% EOT damage while asleep
    const nightmareEntry = pokemon.volatileStatus.find(v => v.name === 'nightmare');
    if (nightmareEntry) {
      if (pokemon.status === 'slp') {
        this.applyDamage(pokemon, slotId, Math.floor(pokemon.maxHp / 4), 'nightmare', events);
        if (pokemon.fainted) return { events };
      } else {
        // Woke up — remove nightmare
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'nightmare');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'nightmare' } });
      }
    }

    // Curse: 25% EOT damage
    const curseEntry = pokemon.volatileStatus.find(v => v.name === 'curse');
    if (curseEntry) {
      this.applyDamage(pokemon, slotId, Math.floor(pokemon.maxHp / 4), 'curse', events);
      if (pokemon.fainted) return { events };
    }

    // Octolock: lower def and spd by 1 each end of turn
    const octolockEntry = pokemon.volatileStatus.find(v => v.name === 'octolock');
    if (octolockEntry) {
      events.push(applyStatBoost(pokemon, slotId, { def: -1, spd: -1 }));
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

    // Taunt decrement
    const tauntEntry = pokemon.volatileStatus.find(v => v.name === 'taunt');
    if (tauntEntry) {
      tauntEntry.turnsRemaining = (tauntEntry.turnsRemaining ?? 1) - 1;
      if ((tauntEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'taunt');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'taunt' } });
      }
    }

    // Encore decrement
    const encoreEntry = pokemon.volatileStatus.find(v => v.name === 'encore');
    if (encoreEntry) {
      encoreEntry.turnsRemaining = (encoreEntry.turnsRemaining ?? 1) - 1;
      if ((encoreEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'encore');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'encore' } });
      }
    }

    const yawnEntry = pokemon.volatileStatus.find(v => v.name === 'yawn');
    if (yawnEntry) {
      yawnEntry.counter = (yawnEntry.counter ?? 1) - 1;
      if ((yawnEntry.counter ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'yawn');
        // IMMUNITIES.slp = [] so passing [] as types is correct — no type is immune to sleep
        const evt = applyStatus(pokemon, slotId, 'slp', [], undefined, state);
        if (evt) events.push(evt);
      }
    }

    // Aqua Ring heal
    if (pokemon.volatileStatus.some(v => v.name === 'aqua-ring')) {
      const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
      const actual = Math.min(heal, pokemon.maxHp - pokemon.currentHp);
      if (actual > 0) {
        pokemon.currentHp += actual;
        events.push({ type: 'heal', data: { slotId, amount: actual, remainingHp: pokemon.currentHp, source: 'aqua-ring' } });
      }
    }

    // Ingrain heal
    if (pokemon.volatileStatus.some(v => v.name === 'ingrain')) {
      const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
      const actual = Math.min(heal, pokemon.maxHp - pokemon.currentHp);
      if (actual > 0) {
        pokemon.currentHp += actual;
        events.push({ type: 'heal', data: { slotId, amount: actual, remainingHp: pokemon.currentHp, source: 'ingrain' } });
      }
    }

    // Magnet Rise decrement
    const magnetEntry = pokemon.volatileStatus.find(v => v.name === 'magnet-rise');
    if (magnetEntry) {
      magnetEntry.turnsRemaining = (magnetEntry.turnsRemaining ?? 1) - 1;
      if ((magnetEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'magnet-rise');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'magnet-rise' } });
      }
    }

    // Perish Song decrement
    const perishEntry = pokemon.volatileStatus.find(v => v.name === 'perishsong');
    if (perishEntry) {
      if ((perishEntry.counter ?? 0) <= 0) {
        pokemon.currentHp = 0;
        pokemon.fainted = true;
        events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
      } else {
        perishEntry.counter = (perishEntry.counter ?? 1) - 1;
      }
    }

    // Embargo decrement
    const embargoEntry = pokemon.volatileStatus.find(v => v.name === 'embargo');
    if (embargoEntry) {
      embargoEntry.turnsRemaining = (embargoEntry.turnsRemaining ?? 1) - 1;
      if ((embargoEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'embargo');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'embargo' } });
      }
    }

    // Heal Block decrement
    const healBlockEntry = pokemon.volatileStatus.find(v => v.name === 'heal-block');
    if (healBlockEntry) {
      healBlockEntry.turnsRemaining = (healBlockEntry.turnsRemaining ?? 1) - 1;
      if ((healBlockEntry.turnsRemaining ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'heal-block');
        events.push({ type: 'volatile-cured', data: { slotId, volatile: 'heal-block' } });
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
