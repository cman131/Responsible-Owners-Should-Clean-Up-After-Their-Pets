import { describe, it, expect, beforeAll } from 'vitest';
import type { SideConditions, TurnResolveEvent } from '@poke-fighter/shared';
import { decrementScreens, getScreenMultiplier, clearHazards, clearScreens, applyEntryHazards } from '../sideConditions.js';
import { DataLoader } from '../../data/loader.js';
import { makePokemon } from './fixtures.js';

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

describe('applyEntryHazards', () => {
  let data: DataLoader;
  beforeAll(() => { data = new DataLoader(); });

  describe('applyEntryHazards — Stealth Rock', () => {
    it('deals neutral Rock damage (1x) to Normal-type, 100 HP → 12 damage', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ stealthRock: true });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      const dmg = events.find(e => e.type === 'hazard-damage');
      expect(dmg).toBeDefined();
      expect(dmg!.data['damage']).toBe(12);
      expect(dmg!.data['hazard']).toBe('stealthRock');
      expect(pkmn.currentHp).toBe(88);
    });

    it('deals 4x Rock damage to Fire/Flying type — 50% of max HP', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ stealthRock: true });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Fire', 'Flying'], true, data);
      const dmg = events.find(e => e.type === 'hazard-damage');
      expect(dmg!.data['damage']).toBe(50);
      expect(pkmn.currentHp).toBe(50);
    });

    it('emits faint and stops when SR damage knocks out the Pokémon', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 10 });
      const side = makeSide({ stealthRock: true, spikes: 3 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Fire', 'Flying'], true, data);
      expect(pkmn.fainted).toBe(true);
      expect(events.some(e => e.type === 'faint')).toBe(true);
      expect(events.some(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes')).toBe(false);
    });

    it('hits Flying-type Pokémon (SR ignores grounded check)', () => {
      // grounded: false (Flying, not grounded) — but stealthRock still hits
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ stealthRock: true });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Flying'], false, data);
      expect(events.some(e => e.type === 'hazard-damage')).toBe(true);
      const dmg = events.find(e => e.type === 'hazard-damage');
      expect(dmg!.data['damage']).toBe(25); // 2x Rock weakness: floor(100 * 0.125 * 2)
      expect(pkmn.currentHp).toBe(75);
    });
  });

  describe('applyEntryHazards — Spikes', () => {
    it('layer 1 deals 1/8 max HP to grounded Pokémon (100 HP → 12 damage)', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ spikes: 1 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      const dmg = events.find(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes');
      expect(dmg!.data['damage']).toBe(12);
    });

    it('layer 2 deals 1/6 max HP (100 HP → 16 damage)', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ spikes: 2 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      const dmg = events.find(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes');
      expect(dmg!.data['damage']).toBe(16);
    });

    it('layer 3 deals 1/4 max HP (100 HP → 25 damage)', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ spikes: 3 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      const dmg = events.find(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes');
      expect(dmg!.data['damage']).toBe(25);
    });

    it('does not apply Spikes to non-grounded Pokémon', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ spikes: 3 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Flying'], false, data);
      expect(events.some(e => e.data['hazard'] === 'spikes')).toBe(false);
      expect(pkmn.currentHp).toBe(100);
    });
  });

  describe('applyEntryHazards — Toxic Spikes', () => {
    it('layer 1 applies psn to grounded non-Poison type', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ toxicSpikes: 1 });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      expect(pkmn.status).toBe('psn');
    });

    it('layer 2 applies tox to grounded non-Poison type', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ toxicSpikes: 2 });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      expect(pkmn.status).toBe('tox');
    });

    it('grounded Poison-type absorbs all layers, no status applied', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ toxicSpikes: 2 });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Poison'], true, data);
      expect(side.toxicSpikes).toBe(0);
      expect(pkmn.status).toBeUndefined();
      expect(events.some(e => e.type === 'hazard-cleared' && e.data['hazard'] === 'toxicSpikes')).toBe(true);
    });

    it('Steel-type is immune to Toxic Spikes poisoning', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ toxicSpikes: 2 });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Steel'], true, data);
      expect(pkmn.status).toBeUndefined();
    });

    it('does not apply Toxic Spikes to non-grounded Pokémon', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ toxicSpikes: 2 });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], false, data);
      expect(pkmn.status).toBeUndefined();
    });

    it('does not apply status when Pokémon already has a status condition', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100, status: 'brn' });
      const side = makeSide({ toxicSpikes: 2 });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      expect(pkmn.status).toBe('brn'); // unchanged
    });
  });

  describe('applyEntryHazards — Sticky Web', () => {
    it('drops Spe by 1 for a grounded Pokémon', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ stickyWeb: true });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      expect(pkmn.statBoosts.spe).toBe(-1);
      expect(events.some(e => e.type === 'stat-change')).toBe(true);
      const speEvent = events.find(e => e.type === 'stat-change');
      expect(speEvent!.data['changes']).toEqual({ spe: -1 });
    });

    it('does not apply Sticky Web to non-grounded Pokémon', () => {
      const pkmn = makePokemon({ maxHp: 100, currentHp: 100 });
      const side = makeSide({ stickyWeb: true });
      applyEntryHazards(pkmn, 'slot-a', side, 0, ['Flying'], false, data);
      expect(pkmn.statBoosts.spe).toBe(0);
    });
  });

  describe('applyEntryHazards — ordering', () => {
    it('applies all four hazards in order when all are set', () => {
      const pkmn = makePokemon({ maxHp: 200, currentHp: 200 });
      const side = makeSide({ stealthRock: true, spikes: 1, toxicSpikes: 1, stickyWeb: true });
      const events = applyEntryHazards(pkmn, 'slot-a', side, 0, ['Normal'], true, data);
      const srIdx = events.findIndex(e => e.type === 'hazard-damage' && e.data['hazard'] === 'stealthRock');
      const spkIdx = events.findIndex(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes');
      const psnIdx = events.findIndex(e => e.type === 'status-applied');
      const speIdx = events.findIndex(e => e.type === 'stat-change');
      expect(srIdx).toBeGreaterThanOrEqual(0);
      expect(spkIdx).toBeGreaterThan(srIdx);
      expect(psnIdx).toBeGreaterThan(spkIdx);
      expect(speIdx).toBeGreaterThan(psnIdx);
    });
  });
});
