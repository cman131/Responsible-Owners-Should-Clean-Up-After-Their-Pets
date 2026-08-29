import type {
  PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent, Move, BattleState, Secondary,
} from '@poke-fighter/shared';
import { canApplyStatus } from './status.js';

export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean },
): TurnResolveEvent | null {
  if (!options?.bypassSub && member.volatileStatus.some(v => v.name === 'substitute')) return null;
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
  options?: { bypassSub?: boolean },
): TurnResolveEvent | null {
  if (target.volatileStatus.some(v => v.name === volatile)) return null;
  if (!options?.bypassSub && target.volatileStatus.some(v => v.name === 'substitute')) return null;

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

export interface SecondaryContext {
  secondaries: Secondary[];
  totalDamage: number;
  user: PartyMember;
  userSlotId: string;
  target: PartyMember;
  targetSlotId: string;
  targetTypes: PokemonType[];
  battle: BattleState;
  rng: () => number;
  movedSlotIds: Set<string>;
}

export function applySecondaries(ctx: SecondaryContext): TurnResolveEvent[] {
  const events: TurnResolveEvent[] = [];
  for (const sec of ctx.secondaries) {
    switch (sec.kind) {
      case 'status': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const slotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        const types = sec.target === 'user' ? ([] as PokemonType[]) : ctx.targetTypes;
        const evt = applyStatus(member, slotId, sec.status as StatusCondition, types);
        if (evt) events.push(evt);
        break;
      }
      case 'stat': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const slotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        events.push(applyStatBoost(member, slotId, { [sec.stat]: sec.stages } as Partial<Record<keyof StatBoosts, number>>));
        break;
      }
      case 'flinch': {
        if (ctx.rng() * 100 >= sec.chance) break;
        if (!ctx.movedSlotIds.has(ctx.targetSlotId) && !ctx.target.fainted) {
          ctx.target.volatileStatus.push({ name: 'flinch' });
          events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotId, volatile: 'flinch' } });
        }
        break;
      }
      case 'confusion': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const mSlotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        const evt = applyVolatile(member, mSlotId, ctx.userSlotId, 'confusion');
        if (evt) events.push(evt);
        break;
      }
      case 'drain': {
        if (ctx.totalDamage <= 0) break;
        const heal = Math.floor(ctx.totalDamage * sec.fraction[0] / sec.fraction[1]);
        const actual = Math.min(heal, ctx.user.maxHp - ctx.user.currentHp);
        if (actual <= 0) break;
        ctx.user.currentHp += actual;
        events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: actual, remainingHp: ctx.user.currentHp } });
        break;
      }
      case 'recoil': {
        const recoilAmt = Math.floor(ctx.totalDamage * sec.fraction[0] / sec.fraction[1]);
        if (recoilAmt <= 0) break;
        const taken = Math.min(recoilAmt, ctx.user.currentHp);
        ctx.user.currentHp -= taken;
        events.push({ type: 'damage-dealt', data: { source: 'recoil', slotId: ctx.userSlotId, damage: taken, remainingHp: ctx.user.currentHp } });
        if (ctx.user.currentHp <= 0) {
          ctx.user.fainted = true;
          ctx.user.currentHp = 0;
          events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        }
        break;
      }
      case 'recoil-hp': {
        const recoilAmt = Math.floor(ctx.user.maxHp * sec.fraction[0] / sec.fraction[1]);
        if (recoilAmt <= 0) break;
        const taken = Math.min(recoilAmt, ctx.user.currentHp);
        ctx.user.currentHp -= taken;
        events.push({ type: 'damage-dealt', data: { source: 'recoil', slotId: ctx.userSlotId, damage: taken, remainingHp: ctx.user.currentHp } });
        if (ctx.user.currentHp <= 0) {
          ctx.user.fainted = true;
          ctx.user.currentHp = 0;
          events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        }
        break;
      }
      case 'selfdestruct': {
        const taken = ctx.user.currentHp;
        ctx.user.currentHp = 0;
        ctx.user.fainted = true;
        events.push({ type: 'damage-dealt', data: { source: 'selfdestruct', slotId: ctx.userSlotId, damage: taken, remainingHp: 0 } });
        events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        if (sec.variant === 'memento') {
          events.push(applyStatBoost(ctx.target, ctx.targetSlotId, { atk: -2, spa: -2 }));
        }
        break;
      }
      case 'recharge': {
        ctx.user.volatileStatus.push({ name: 'recharge' });
        break;
      }
    }
  }
  return events;
}
