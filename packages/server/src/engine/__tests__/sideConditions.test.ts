import { describe, it, expect } from 'vitest';
import type { SideConditions, TurnResolveEvent } from '@poke-fighter/shared';
import { decrementScreens, getScreenMultiplier, clearHazards, clearScreens } from '../sideConditions.js';

function makeSide(overrides: Partial<SideConditions> = {}): SideConditions {
  return {
    stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false,
    reflect: 0, lightScreen: 0, auroraVeil: 0,
    ...overrides,
  };
}

describe('decrementScreens', () => {
  it('decrements reflect from 2 to 1, no event emitted', () => {
    const side = makeSide({ reflect: 2 });
    const events: TurnResolveEvent[] = [];
    decrementScreens(side, 0, events);
    expect(side.reflect).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('emits screen-ended when reflect reaches 0', () => {
    const side = makeSide({ reflect: 1 });
    const events: TurnResolveEvent[] = [];
    decrementScreens(side, 0, events);
    expect(side.reflect).toBe(0);
    expect(events).toEqual([{ type: 'screen-ended', data: { screen: 'reflect', side: 0 } }]);
  });

  it('emits screen-ended for lightScreen on side 1', () => {
    const side = makeSide({ lightScreen: 1 });
    const events: TurnResolveEvent[] = [];
    decrementScreens(side, 1, events);
    expect(side.lightScreen).toBe(0);
    expect(events[0]!.data['side']).toBe(1);
    expect(events[0]!.data['screen']).toBe('lightScreen');
  });

  it('decrements all three active screens in one call', () => {
    const side = makeSide({ reflect: 3, lightScreen: 2, auroraVeil: 1 });
    const events: TurnResolveEvent[] = [];
    decrementScreens(side, 0, events);
    expect(side.reflect).toBe(2);
    expect(side.lightScreen).toBe(1);
    expect(side.auroraVeil).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]!.data['screen']).toBe('auroraVeil');
  });

  it('does not decrement inactive screens (0)', () => {
    const side = makeSide({ reflect: 0 });
    const events: TurnResolveEvent[] = [];
    decrementScreens(side, 0, events);
    expect(side.reflect).toBe(0);
    expect(events).toHaveLength(0);
  });
});

describe('getScreenMultiplier', () => {
  it('returns 0.5 for physical move vs Reflect', () => {
    const side = makeSide({ reflect: 3 });
    expect(getScreenMultiplier(side, 'physical', false)).toBe(0.5);
  });

  it('returns 0.5 for special move vs Light Screen', () => {
    const side = makeSide({ lightScreen: 3 });
    expect(getScreenMultiplier(side, 'special', false)).toBe(0.5);
  });

  it('returns 0.5 for physical move vs Aurora Veil', () => {
    const side = makeSide({ auroraVeil: 3 });
    expect(getScreenMultiplier(side, 'physical', false)).toBe(0.5);
  });

  it('returns 0.5 for special move vs Aurora Veil', () => {
    const side = makeSide({ auroraVeil: 3 });
    expect(getScreenMultiplier(side, 'special', false)).toBe(0.5);
  });

  it('returns 1.0 on a critical hit (screens bypassed)', () => {
    const side = makeSide({ reflect: 3, lightScreen: 3 });
    expect(getScreenMultiplier(side, 'physical', true)).toBe(1);
    expect(getScreenMultiplier(side, 'special', true)).toBe(1);
  });

  it('returns 1.0 when no screen is active', () => {
    const side = makeSide();
    expect(getScreenMultiplier(side, 'physical', false)).toBe(1);
    expect(getScreenMultiplier(side, 'special', false)).toBe(1);
  });

  it('Reflect does not halve special moves', () => {
    const side = makeSide({ reflect: 5 });
    expect(getScreenMultiplier(side, 'special', false)).toBe(1);
  });

  it('Light Screen does not halve physical moves', () => {
    const side = makeSide({ lightScreen: 5 });
    expect(getScreenMultiplier(side, 'physical', false)).toBe(1);
  });
});

describe('clearHazards', () => {
  it('clears all set hazards and returns one event per hazard', () => {
    const side = makeSide({ stealthRock: true, spikes: 2, toxicSpikes: 1, stickyWeb: true });
    const events = clearHazards(side, 0);
    expect(side.stealthRock).toBe(false);
    expect(side.spikes).toBe(0);
    expect(side.toxicSpikes).toBe(0);
    expect(side.stickyWeb).toBe(false);
    expect(events).toHaveLength(4);
    expect(events.every(e => e.type === 'hazard-cleared')).toBe(true);
    expect(events.every(e => e.data['side'] === 0)).toBe(true);
  });

  it('returns empty array when no hazards are set', () => {
    const side = makeSide();
    expect(clearHazards(side, 1)).toHaveLength(0);
  });

  it('only clears hazards that are actually set', () => {
    const side = makeSide({ stealthRock: true });
    const events = clearHazards(side, 0);
    expect(events).toHaveLength(1);
    expect(events[0]!.data['hazard']).toBe('stealthRock');
  });
});

describe('clearScreens', () => {
  it('clears all active screens and returns one event per screen', () => {
    const side = makeSide({ reflect: 3, lightScreen: 2, auroraVeil: 1 });
    const events = clearScreens(side, 1);
    expect(side.reflect).toBe(0);
    expect(side.lightScreen).toBe(0);
    expect(side.auroraVeil).toBe(0);
    expect(events).toHaveLength(3);
    expect(events.every(e => e.type === 'screen-broken')).toBe(true);
    expect(events.every(e => e.data['side'] === 1)).toBe(true);
  });

  it('skips inactive screens (0)', () => {
    const side = makeSide({ reflect: 3, lightScreen: 0, auroraVeil: 0 });
    const events = clearScreens(side, 0);
    expect(events).toHaveLength(1);
    expect(events[0]!.data['screen']).toBe('reflect');
  });
});
