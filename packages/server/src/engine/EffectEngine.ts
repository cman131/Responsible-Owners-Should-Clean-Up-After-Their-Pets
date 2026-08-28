import type {
  PartyMember, BattleState, TurnResolveEvent,
} from '@poke-fighter/shared';
import { FREEZE_THAW_CHANCE } from './status.js';

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

    return { blocked: false, events };
  }

  runEndOfTurn(
    _pokemon: PartyMember,
    _slotId: string,
    _state: BattleState,
    _allSlots: SlotContext[],
  ): EndOfTurnResult {
    return { events: [] };
  }
}
