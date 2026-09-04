import type { StatusCondition, WeatherType, TerrainType, StatBoosts, SideConditions, TurnResolveEvent, VolatileStatusEntry } from '@poke-fighter/shared';
import { applyStatus, applyStatBoost, applyVolatile } from './effects.js';
import type { MoveEffectHandler } from './MoveEffectRegistry.js';
import { getItemHooks } from './items.js';

const BATON_PASS_VOLATILES = new Set([
  'focusenergy', 'substitute', 'aqua-ring', 'ingrain', 'magnet-rise',
  'power-trick', 'laser-focus',
]);

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

export function multiStatModTarget(boosts: Partial<Record<keyof StatBoosts, number>>): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      events.push(applyStatBoost(ctx.targets[i]!, ctx.targetSlotIds[i]!, boosts));
    }
    return { events };
  };
}

export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      const targetSlotId = ctx.targetSlotIds[i]!;
      const event = applyStatus(target, targetSlotId, status, ctx.targetTypes[i]!, { bypassSub }, ctx.battle);
      if (event) {
        events.push(event);
        // Lum Berry: cure status immediately on application
        if (target.status) {
          const lumResult = getItemHooks(target.heldItem).onStatusApplied?.({
            holder: target,
            state: ctx.battle,
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
    return { events };
  };
}

export function applyVolatileTarget(volatile: string, counter?: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyVolatile(ctx.targets[i]!, ctx.targetSlotIds[i]!, ctx.userSlotId, volatile, counter, { bypassSub });
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
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'heal-blocked' } }] };
    }
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  };
}

export function setWeather(type: WeatherType, turns: number): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.weather = { type, turnsRemaining: turns, fromAbility: false };
    return { events: [{ type: 'weather-started', data: { weather: type, turnsRemaining: turns } }] };
  };
}

export function setTerrain(type: TerrainType): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.terrain = { type, turnsRemaining: 5 };
    return { events: [{ type: 'terrain-started', data: { terrain: type } }] };
  };
}

export function setSideCondition(
  key: keyof SideConditions,
  value: number | boolean,
  side: 'ally' | 'foe',
  options?: {
    failIfActive?: boolean;
    weatherRequired?: WeatherType[];
  },
): MoveEffectHandler {
  return (ctx) => {
    const sideIdx = (side === 'ally' ? ctx.userTeamIndex : 1 - ctx.userTeamIndex) as 0 | 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentValue = (ctx.battle.field.sideConditions[sideIdx] as any)[key as string];

    if (options?.failIfActive && currentValue) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'already-active' } }] };
    }
    if (options?.weatherRequired) {
      const weatherType = ctx.battle.field.weather?.type;
      if (!weatherType || !options.weatherRequired.includes(weatherType)) {
        return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-hail' } }] };
      }
    }

    const ext = getItemHooks(ctx.user.heldItem).screenExtension ?? 0;
    const adjustedValue = typeof value === 'number' && value > 1 ? value + ext : value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx.battle.field.sideConditions[sideIdx] as any)[key] = adjustedValue;
    return { events: [{ type: 'side-condition-set', data: { side: sideIdx, condition: key, value: adjustedValue } }] };
  };
}

export function trickRoom(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.battle.field.trickroom > 0) {
      ctx.battle.field.trickroom = 0;
      return { events: [{ type: 'trickroom-ended', data: {} }] };
    }
    ctx.battle.field.trickroom = 5;
    return { events: [{ type: 'trickroom-started', data: {} }] };
  };
}

export function gravity(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.battle.field.gravity > 0) {
      ctx.battle.field.gravity = 0;
      return { events: [{ type: 'gravity-ended', data: {} }] };
    }
    ctx.battle.field.gravity = 5;
    return { events: [{ type: 'gravity-started', data: {} }] };
  };
}

export function custom(fn: MoveEffectHandler): MoveEffectHandler {
  return fn;
}

export function substitute(): MoveEffectHandler {
  return (ctx) => {
    const cost = Math.floor(ctx.user.maxHp / 4);
    if (ctx.user.currentHp <= cost) {
      return { events: [{ type: 'move-failed', data: { moveId: 'substitute', reason: 'too-weak-for-sub' } }] };
    }
    ctx.user.currentHp -= cost;
    ctx.user.volatileStatus.push({ name: 'substitute', hp: cost });
    return {
      events: [
        { type: 'damage-dealt', data: { source: 'substitute', slotId: ctx.userSlotId, damage: cost, remainingHp: ctx.user.currentHp } },
        { type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'substitute' } },
      ],
    };
  };
}

export function protect(variant: string): MoveEffectHandler {
  return (ctx) => {
    const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
    const n = streakEntry?.counter ?? 0;
    const chance = n === 0 ? 1 : 1 / Math.pow(3, n);

    if (ctx.rng() >= chance) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
      return { events: [{ type: 'move-failed', data: { moveId: variant, reason: 'protect-failed' } }] };
    }

    if (streakEntry) {
      streakEntry.counter = n + 1;
    } else {
      ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    }
    ctx.user.volatileStatus.push({ name: 'protect', variant });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'protect', variant } }] };
  };
}

export function disable(): MoveEffectHandler {
  return (ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!target.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: 'disable', reason: 'no-last-move' } }] };
    }
    if (target.volatileStatus.some(v => v.name === 'disable')) return { events: [] };
    target.volatileStatus.push({ name: 'disable', moveId: target.lastMoveId, turnsRemaining: 4 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'disable', moveId: target.lastMoveId } }] };
  };
}

export function taunt(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'taunt')) continue;
      if (target.volatileStatus.some(v => v.name === 'substitute')) continue;
      // Set to 4 so that after the EoT decrement this turn, turnsRemaining is 3
      target.volatileStatus.push({ name: 'taunt', turnsRemaining: 4 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'taunt' } });
    }
    return { events };
  };
}

export function encore(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (!target.lastMoveId) {
        events.push({ type: 'move-failed', data: { moveId: 'encore', reason: 'no-last-move' } });
        continue;
      }
      if (target.volatileStatus.some(v => v.name === 'encore')) continue;
      target.volatileStatus.push({ name: 'encore', moveId: target.lastMoveId, turnsRemaining: 3 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'encore', moveId: target.lastMoveId } });
    }
    return { events };
  };
}

export function torment(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'torment' || v.name === 'substitute')) continue;
      target.volatileStatus.push({ name: 'torment' });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'torment' } });
    }
    return { events };
  };
}

export function endure(): MoveEffectHandler {
  return (ctx) => {
    const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
    const n = streakEntry?.counter ?? 0;
    const chance = n === 0 ? 1 : 1 / Math.pow(3, n);

    if (ctx.rng() >= chance) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
      return { events: [{ type: 'move-failed', data: { moveId: 'endure', reason: 'protect-failed' } }] };
    }

    if (streakEntry) {
      streakEntry.counter = n + 1;
    } else {
      ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    }
    ctx.user.volatileStatus.push({ name: 'endure' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'endure' } }] };
  };
}

export function aquaRing(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'aqua-ring')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'aqua-ring' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'aqua-ring' } }] };
  };
}

export function ingrain(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'ingrain')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'ingrain' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'ingrain' } }] };
  };
}

export function magnetRise(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'magnet-rise')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'magnet-rise', turnsRemaining: 5 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'magnet-rise' } }] };
  };
}

export function perishSong(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        if (active.volatileStatus.some(v => v.name === 'perishsong')) continue;
        active.volatileStatus.push({ name: 'perishsong', counter: 3 });
        events.push({ type: 'volatile-applied', data: { targetSlotId: slot.slotId, volatile: 'perishsong', counter: 3 } });
      }
    }
    return { events };
  };
}

export function destinyBond(): MoveEffectHandler {
  return (ctx) => {
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'destiny-bond');
    ctx.user.volatileStatus.push({ name: 'destiny-bond' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'destiny-bond' } }] };
  };
}

export function roost(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: 'roost', reason: 'heal-blocked' } }] };
    }
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.5), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) ctx.user.currentHp += heal;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'roost');
    ctx.user.volatileStatus.push({ name: 'roost' });
    const events: TurnResolveEvent[] = [];
    if (heal > 0) {
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'roost' } });
    return { events };
  };
}

export function embargoFactory(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'embargo')) continue;
      // Initialize to 6 so that after the EoT decrement this same turn, turnsRemaining is 5
      target.volatileStatus.push({ name: 'embargo', turnsRemaining: 6 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'embargo' } });
    }
    return { events };
  };
}

export function healBlockFactory(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'heal-block')) continue;
      // Initialize to 6 so that after the EoT decrement this same turn, turnsRemaining is 5
      target.volatileStatus.push({ name: 'heal-block', turnsRemaining: 6 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'heal-block' } });
    }
    return { events };
  };
}

export function cureTeamStatus(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const slot of ctx.battle.teams[ctx.userTeamIndex]!.slots) {
      for (const mon of slot.party) {
        if (!mon.fainted && mon.status) {
          const old = mon.status;
          delete mon.status;
          mon.volatileStatus = mon.volatileStatus.filter(v => v.name !== 'toxic');
          events.push({ type: 'status-cured', data: { slotId: slot.slotId, status: old, reason: 'move' } });
        }
      }
    }
    return { events };
  };
}

export function wish(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'heal-blocked' } }] };
    }
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    if (userSlot.wish) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'already-active' } }] };
    }
    userSlot.wish = { hp: Math.floor(ctx.user.maxHp / 2), turnsRemaining: 2 };
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'wish' } }] };
  };
}

export function batonPass(): MoveEffectHandler {
  return (ctx) => {
    // Capture carry-over volatiles and stat boosts BEFORE performSwitch clears them
    const carriedVolatiles: VolatileStatusEntry[] = ctx.user.volatileStatus
      .filter(v => BATON_PASS_VOLATILES.has(v.name))
      .map(v => ({ ...v }));

    const carriedStatBoosts: StatBoosts = { ...ctx.user.statBoosts };

    // Store on the slot so performSwitch can apply them to the incoming Pokemon
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (userSlot) {
      userSlot.batonPassData = { volatiles: carriedVolatiles, statBoosts: carriedStatBoosts };
    }

    return { events: [], pivotSwitch: true };
  };
}

export function partingShot(): MoveEffectHandler {
  return (ctx) => {
    const target = ctx.targets[0]!;
    const targetSlotId = ctx.targetSlotIds[0]!;
    const targetTypes = ctx.targetTypes[0]!;

    // Dark-type immunity: Parting Shot fails against Dark-type targets (Gen 6+)
    if (targetTypes.includes('Dark')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'immune' } }] };
    }

    // Apply -1 Atk and -1 SpA to the target
    const statDropEvent = applyStatBoost(target, targetSlotId, { atk: -1, spa: -1 });

    // Signal pivot switch (no batonPassData — nothing is passed to the incoming Pokemon)
    return { events: [statDropEvent], pivotSwitch: true };
  };
}

export function teleport(): MoveEffectHandler {
  return (_ctx) => ({ events: [], pivotSwitch: true });
}

export function forceSwitch(): MoveEffectHandler {
  return (ctx) => {
    const target = ctx.targets[0]!;
    const targetSlotId = ctx.targetSlotIds[0]!;

    if (target.volatileStatus.some(v => v.name === 'ingrain')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'ingrain' } }] };
    }

    const effectiveAbility = target.tracedAbilityId ?? target.ability;
    if (effectiveAbility === 'suction-cups') {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'suction-cups' } }] };
    }

    const targetSlot = ctx.battle.teams.flatMap(t => t.slots).find(s => s.slotId === targetSlotId);
    const bench = targetSlot?.party.filter(
      (p, i) => i !== targetSlot.activePokemonIndex && !p.fainted
    ) ?? [];

    if (bench.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-eligible-bench' } }] };
    }

    const chosen = bench[Math.floor(ctx.rng() * bench.length)]!;
    return { events: [], forceSwitch: { targetSlotId, targetInstanceId: chosen.instanceId } };
  };
}

export function shedTail(): MoveEffectHandler {
  return (ctx) => {
    const cost = Math.floor(ctx.user.maxHp / 2);
    // Fail if user cannot afford the HP cost (HP must be strictly greater than 50%)
    if (ctx.user.currentHp <= cost) {
      return {
        events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'not-enough-hp' } }],
      };
    }

    // Fail if no bench member available — move cannot switch without a target
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    const hasBench = userSlot?.party.some((p, i) => i !== userSlot.activePokemonIndex && !p.fainted) ?? false;
    if (!hasBench) {
      return {
        events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-valid-switch-target' } }],
      };
    }

    // Deduct HP cost
    ctx.user.currentHp -= cost;

    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { source: 'shedtail', slotId: ctx.userSlotId, damage: cost, remainingHp: ctx.user.currentHp } },
    ];

    // Store substitute in batonPassData for the incoming Pokemon (not on the user itself)
    const subHp = Math.floor(ctx.user.maxHp / 4);
    const emptyStatBoosts: StatBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    userSlot.batonPassData = {
      volatiles: [{ name: 'substitute', hp: subHp }],
      statBoosts: emptyStatBoosts,
    };

    return { events, pivotSwitch: true };
  };
}
