import { describe, it, expect } from 'vitest';
import { eventsToPlaybackEntries } from '../BattleContext.js';
import type { TurnResolveEvent } from '@poke-fighter/shared';

describe('eventsToPlaybackEntries', () => {
  it('converts move-used to a single 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'Bulbasaur used Tackle!', delay: 600 });
  });

  it('converts neutral damage-dealt to one entry with hpDelta', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 30, moveId: 'tackle', effectiveness: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      text: 'Dealt 30 damage to b1.',
      hpDelta: { slotId: 'b1', delta: 30 },
      animation: { slotId: 'b1', kind: 'hit' },
      delay: 600,
    });
  });

  it('converts super effective damage to two entries', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 60, moveId: 'ember', effectiveness: 2 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      text: 'Dealt 60 damage to b1.',
      hpDelta: { slotId: 'b1', delta: 60 },
      animation: { slotId: 'b1', kind: 'hit' },
      delay: 600,
    });
    expect(entries[1]).toEqual({ text: "It's super effective!", delay: 300 });
  });

  it('converts not-very-effective damage to two entries', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 15, moveId: 'ember', effectiveness: 0.5 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({ text: "It's not very effective...", delay: 300 });
  });

  it('converts damage-dealt with no moveId to one entry without effectiveness text', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', damage: 10 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Dealt 10 damage to b1.');
  });

  it('converts crit to a 300ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'crit', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'A critical hit!', delay: 300 });
  });

  it('converts faint to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'faint', data: { slotId: 'b1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      text: "b1's Pokémon fainted!",
      animation: { slotId: 'b1', kind: 'faint' },
      delay: 600,
    });
  });

  it('converts sleep wake-up to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status: 'slp', pokemonName: 'Snorlax' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Snorlax woke up!');
  });

  it('omits status-cured with non-sleep status', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status: 'brn', pokemonName: 'Charizard' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(0);
  });

  it('converts heal to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'heal', data: { slotId: 'a1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'a1 restored HP.', delay: 600 });
  });

  it('converts status-applied to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-applied', data: { slotId: 'a1', pokemonName: 'Pikachu', status: 'brn' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'Pikachu was brn!', delay: 600 });
  });

  it('converts terastallize to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'terastallize', data: { slotId: 'b1', teraType: 'Fire' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'b1 Terastallized into Fire type!', delay: 600 });
  });

  it('converts pokemon-switched to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'pokemon-switched', data: { slotId: 'a1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: "a1's Pokémon was switched out!", delay: 600 });
  });

  it('omits unknown event types', () => {
    const events: TurnResolveEvent[] = [{ type: 'unknown-type' as any, data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(0);
  });

  it('converts multiple events in sequence', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerName: 'Pikachu', moveName: 'Thunderbolt' } },
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 45, moveId: 'thunderbolt', effectiveness: 2 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.text).toBe('Pikachu used Thunderbolt!');
    expect(entries[1]!.hpDelta).toEqual({ slotId: 'b1', delta: 45 });
    expect(entries[2]!.text).toBe("It's super effective!");
  });

  it('adds attack animation to move-used entry when attackerSlotId is present', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerSlotId: 'a1', attackerName: 'Bulbasaur', moveName: 'Tackle', moveId: 'tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries[0]!.animation).toEqual({ slotId: 'a1', kind: 'attack' });
  });

  it('omits animation on move-used when attackerSlotId is absent', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries[0]!.animation).toBeUndefined();
  });

  it('adds hit animation to damage-dealt entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 30, moveId: 'tackle', effectiveness: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries[0]!.animation).toEqual({ slotId: 'b1', kind: 'hit' });
  });

  it('adds faint animation to faint entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'faint', data: { slotId: 'b1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries[0]!.animation).toEqual({ slotId: 'b1', kind: 'faint' });
  });
});
