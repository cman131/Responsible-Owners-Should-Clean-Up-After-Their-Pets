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
