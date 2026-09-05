import type { SideConditions, TurnResolveEvent, PartyMember, PokemonType } from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { applyStatus, applyStatBoost } from './effects.js';

export function decrementScreens(
  side: SideConditions,
  sideIdx: 0 | 1,
  events: TurnResolveEvent[],
): void {
  const screens = ['reflect', 'lightScreen', 'auroraVeil'] as const;
  for (const screen of screens) {
    if (side[screen] > 0) {
      side[screen] -= 1;
      if (side[screen] === 0) {
        events.push({ type: 'screen-ended', data: { screen, side: sideIdx } });
      }
    }
  }

  const sideConditionCounters = ['tailwind', 'safeguard', 'mist', 'luckychant'] as const;
  for (const cond of sideConditionCounters) {
    if (side[cond] > 0) {
      side[cond] -= 1;
      if (side[cond] === 0) {
        events.push({ type: 'side-condition-ended', data: { condition: cond, side: sideIdx } });
      }
    }
  }
}

export function getScreenMultiplier(
  side: SideConditions,
  category: 'physical' | 'special',
  isCritical: boolean,
): number {
  if (isCritical) return 1;
  if (category === 'physical' && (side.reflect > 0 || side.auroraVeil > 0)) return 0.5;
  if (category === 'special' && (side.lightScreen > 0 || side.auroraVeil > 0)) return 0.5;
  return 1;
}

export function clearHazards(side: SideConditions, sideIdx: 0 | 1): TurnResolveEvent[] {
  const events: TurnResolveEvent[] = [];
  if (side.stealthRock) {
    side.stealthRock = false;
    events.push({ type: 'hazard-cleared', data: { hazard: 'stealthRock', side: sideIdx } });
  }
  if (side.spikes > 0) {
    side.spikes = 0;
    events.push({ type: 'hazard-cleared', data: { hazard: 'spikes', side: sideIdx } });
  }
  if (side.toxicSpikes > 0) {
    side.toxicSpikes = 0;
    events.push({ type: 'hazard-cleared', data: { hazard: 'toxicSpikes', side: sideIdx } });
  }
  if (side.stickyWeb) {
    side.stickyWeb = false;
    events.push({ type: 'hazard-cleared', data: { hazard: 'stickyWeb', side: sideIdx } });
  }
  return events;
}

export function clearScreens(side: SideConditions, sideIdx: 0 | 1): TurnResolveEvent[] {
  const events: TurnResolveEvent[] = [];
  if (side.reflect > 0) {
    side.reflect = 0;
    events.push({ type: 'screen-broken', data: { screen: 'reflect', side: sideIdx } });
  }
  if (side.lightScreen > 0) {
    side.lightScreen = 0;
    events.push({ type: 'screen-broken', data: { screen: 'lightScreen', side: sideIdx } });
  }
  if (side.auroraVeil > 0) {
    side.auroraVeil = 0;
    events.push({ type: 'screen-broken', data: { screen: 'auroraVeil', side: sideIdx } });
  }
  return events;
}

export function applyEntryHazards(
  incoming: PartyMember,
  slotId: string,
  side: SideConditions,
  sideIdx: 0 | 1,
  effectiveTypes: PokemonType[],
  grounded: boolean,
  data: DataLoader,
): TurnResolveEvent[] {
  const events: TurnResolveEvent[] = [];

  // 1. Stealth Rock — hits everyone, including Flying types
  if (side.stealthRock) {
    const effectiveness = data.getCombinedEffectiveness('Rock', effectiveTypes);
    const damage = Math.floor(incoming.maxHp * 0.125 /* 1/8 base */ * effectiveness);
    if (damage > 0) {
      const actual = Math.min(damage, incoming.currentHp);
      incoming.currentHp -= actual;
      events.push({ type: 'hazard-damage', data: { slotId, hazard: 'stealthRock', damage: actual, remainingHp: incoming.currentHp } });
      if (incoming.currentHp <= 0) {
        incoming.fainted = true;
        incoming.currentHp = 0;
        events.push({ type: 'faint', data: { slotId, instanceId: incoming.instanceId } });
        return events;
      }
    }
  }

  // 2. Spikes — grounded only
  if (side.spikes > 0 && grounded) {
    const fractions: Record<number, number> = { 1: 1 / 8, 2: 1 / 6, 3: 1 / 4 };
    const damage = Math.floor(incoming.maxHp * (fractions[side.spikes] ?? 0));
    if (damage > 0) {
      const actual = Math.min(damage, incoming.currentHp);
      incoming.currentHp -= actual;
      events.push({ type: 'hazard-damage', data: { slotId, hazard: 'spikes', damage: actual, remainingHp: incoming.currentHp } });
      if (incoming.currentHp <= 0) {
        incoming.fainted = true;
        incoming.currentHp = 0;
        events.push({ type: 'faint', data: { slotId, instanceId: incoming.instanceId } });
        return events;
      }
    }
  }

  // 3. Toxic Spikes — grounded only
  if (side.toxicSpikes > 0 && grounded) {
    if (effectiveTypes.includes('Poison')) {
      // Grounded Poison-type absorbs all layers
      side.toxicSpikes = 0;
      events.push({ type: 'hazard-cleared', data: { hazard: 'toxicSpikes', side: sideIdx } });
    } else {
      const status = side.toxicSpikes >= 2 ? 'tox' : 'psn';
      const evt = applyStatus(incoming, slotId, status, effectiveTypes);
      if (evt) events.push(evt);
    }
  }

  // 4. Sticky Web — grounded only
  if (side.stickyWeb && grounded) {
    if (incoming.statBoosts.spe > -6) {
      events.push(applyStatBoost(incoming, slotId, { spe: -1 }));
    }
  }

  return events;
}
