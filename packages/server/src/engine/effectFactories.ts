import type { StatusCondition, WeatherType, TerrainType, StatBoosts, SideConditions, TurnResolveEvent } from '@poke-fighter/shared';
import { applyStatus, applyStatBoost, applyVolatile } from './effects.js';
import type { MoveEffectHandler } from './MoveEffectRegistry.js';

export function statModSelf(stat: keyof StatBoosts, stages: number): MoveEffectHandler {
  return (ctx) => ({
    events: [applyStatBoost(ctx.user, ctx.userSlotId, { [stat]: stages } as Partial<Record<keyof StatBoosts, number>>)],
  });
}

export function statModTarget(stat: keyof StatBoosts, stages: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      events.push(applyStatBoost(ctx.targets[i]!, ctx.targetSlotIds[i]!, { [stat]: stages } as Partial<Record<keyof StatBoosts, number>>));
    }
    return { events };
  };
}

export function multiStatModSelf(boosts: Partial<Record<keyof StatBoosts, number>>): MoveEffectHandler {
  return (ctx) => ({ events: [applyStatBoost(ctx.user, ctx.userSlotId, boosts)] });
}

export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyStatus(ctx.targets[i]!, ctx.targetSlotIds[i]!, status, ctx.targetTypes[i]!);
      if (event) events.push(event);
    }
    return { events };
  };
}

export function applyVolatileTarget(volatile: string, counter?: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyVolatile(ctx.targets[i]!, ctx.targetSlotIds[i]!, ctx.userSlotId, volatile, counter);
      if (event) events.push(event);
    }
    return { events };
  };
}

export function applyVolatileSelf(volatile: string): MoveEffectHandler {
  return (ctx) => {
    const event = applyVolatile(ctx.user, ctx.userSlotId, ctx.userSlotId, volatile);
    return { events: event ? [event] : [] };
  };
}

export function healPercent(fraction: number): MoveEffectHandler {
  return (ctx) => {
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  };
}

export function setWeather(type: WeatherType, turns: number): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.weather = { type, turnsRemaining: turns, fromAbility: false };
    return { events: [{ type: 'weather-change', data: { weather: type } }] };
  };
}

export function setTerrain(type: TerrainType): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.terrain = { type, turnsRemaining: 5 };
    return { events: [{ type: 'terrain-change', data: { terrain: type } }] };
  };
}

export function setSideCondition(
  key: keyof SideConditions,
  value: number | boolean,
  side: 'ally' | 'foe',
): MoveEffectHandler {
  return (ctx) => {
    const sideIdx = (side === 'ally' ? ctx.userTeamIndex : 1 - ctx.userTeamIndex) as 0 | 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx.battle.field.sideConditions[sideIdx] as any)[key] = value;
    return { events: [{ type: 'side-condition-set', data: { side: sideIdx, condition: key, value } }] };
  };
}

export function trickRoom(): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.trickroom = ctx.battle.field.trickroom > 0 ? 0 : 5;
    return { events: [{ type: 'field-effect-set', data: { effect: 'trickroom', turnsRemaining: ctx.battle.field.trickroom } }] };
  };
}

export function gravity(): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.gravity = ctx.battle.field.gravity > 0 ? 0 : 5;
    return { events: [{ type: 'field-effect-set', data: { effect: 'gravity', turnsRemaining: ctx.battle.field.gravity } }] };
  };
}

export function custom(fn: MoveEffectHandler): MoveEffectHandler {
  return fn;
}
