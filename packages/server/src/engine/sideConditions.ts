import type { SideConditions, TurnResolveEvent } from '@poke-fighter/shared';

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
