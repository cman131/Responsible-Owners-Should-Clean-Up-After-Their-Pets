import type {
  PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent, Move,
} from '@poke-fighter/shared';
import { canApplyStatus } from './status.js';

export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
): TurnResolveEvent | null {
  if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability })) {
    return null;
  }
  member.status = status;
  if (status === 'slp') {
    const counter = Math.floor(Math.random() * 3) + 1;
    member.volatileStatus.push({ name: 'sleep', counter });
  }
  return { type: 'status-applied', data: { slotId, status } };
}

export function applyStatBoost(
  member: PartyMember,
  slotId: string,
  deltas: Partial<Record<keyof StatBoosts, number>>,
): TurnResolveEvent {
  const changes: Record<string, number> = {};
  for (const [key, delta] of Object.entries(deltas) as [keyof StatBoosts, number][]) {
    if (delta === undefined) continue;
    const current = member.statBoosts[key];
    const next = Math.max(-6, Math.min(6, current + delta));
    const actual = next - current;
    if (actual === 0) continue;
    member.statBoosts[key] = next;
    changes[key] = actual;
  }
  return { type: 'stat-change', data: { slotId, changes } };
}

export const BOUND_MOVES = new Set(['bind', 'wrap', 'clamp', 'firespin', 'whirlpool']);

const STATUS_CONDITIONS = new Set<string>(['brn', 'par', 'psn', 'tox', 'slp', 'frz']);

export function evaluateSecondaryEffect(
  move: Move,
  target: PartyMember,
  targetSlotId: string,
  targetTypes: PokemonType[],
): TurnResolveEvent | null {
  if (!move.effect || move.effectChance === undefined) return null;
  if (Math.random() * 100 >= move.effectChance) return null;
  if (STATUS_CONDITIONS.has(move.effect)) {
    return applyStatus(target, targetSlotId, move.effect as StatusCondition, targetTypes);
  }
  return null;
}

export function applyVolatile(
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
  volatile: string,
  explicitCounter?: number,
): TurnResolveEvent | null {
  if (target.volatileStatus.some(v => v.name === volatile)) return null;

  let counter: number | undefined;
  if (explicitCounter !== undefined) {
    counter = explicitCounter;
  } else if (volatile === 'confusion') {
    counter = Math.floor(Math.random() * 4) + 2; // 2–5
  } else if (volatile === 'bound') {
    counter = Math.floor(Math.random() * 2) + 4; // 4 or 5
  }

  const needsSource = volatile === 'leech-seed' || volatile === 'bound';
  target.volatileStatus.push({
    name: volatile,
    ...(counter !== undefined ? { counter } : {}),
    ...(needsSource ? { sourceSlotId: attackerSlotId } : {}),
  });

  return { type: 'volatile-applied', data: { targetSlotId, volatile } };
}

export function evaluateVolatileEffect(
  moveId: string,
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
): TurnResolveEvent | null {
  if (!BOUND_MOVES.has(moveId)) return null;
  return applyVolatile(target, targetSlotId, attackerSlotId, 'bound');
}
