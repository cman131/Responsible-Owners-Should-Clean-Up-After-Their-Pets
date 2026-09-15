import { describe, it, expect } from 'vitest';
import { eventsToPlaybackEntries } from '../BattleContext.js';
import type { TurnResolveEvent, BattleState } from '@poke-fighter/shared';

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
      text: 'b1 fainted!',
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

  it('converts status-cured brn to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status: 'brn', pokemonName: 'Charizard' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("Charizard's burn healed!");
  });

  it('converts heal to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'heal', data: { slotId: 'a1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'a1 restored HP.', delay: 600 });
  });

  it('includes hpDelta on heal entry when amount is present', () => {
    const events: TurnResolveEvent[] = [
      { type: 'heal', data: { slotId: 'a1', amount: 25, remainingHp: 75 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hpDelta).toEqual({ slotId: 'a1', delta: -25 });
    expect(entries[0]!.text).toBe('a1 restored HP.');
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

  it('converts move-blocked paralysis to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-blocked', data: { slotId: 'a1', pokemonName: 'Pikachu', reason: 'paralysis' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Pikachu is fully paralyzed!');
    expect(entries[0]!.delay).toBe(600);
  });

  it('converts move-blocked flinch to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-blocked', data: { slotId: 'a1', pokemonName: 'Snorlax', reason: 'flinch' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Snorlax flinched!');
  });

  it('converts move-blocked protect to a 600ms entry using targetSlotId', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-blocked', data: { attackerSlotId: 'a1', targetSlotId: 'b1', reason: 'protect' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('b1 was protected!');
  });

  it('converts move-blocked disabled to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-blocked', data: { slotId: 'a1', reason: 'disabled', moveId: 'tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain('a1');
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

describe('eventsToPlaybackEntries — unhandled event types', () => {
  it('converts miss to a 600ms entry using attackerSlotId', () => {
    const events: TurnResolveEvent[] = [
      { type: 'miss', data: { attackerSlotId: 'a1', moveId: 'tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("a1's attack missed!");
    expect(entries[0]!.delay).toBe(600);
  });

  it('converts stat-change +1 to a 300ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'stat-change', data: { slotId: 'a1', changes: { atk: 1 } } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("a1's Attack rose!");
  });

  it('converts stat-change -2 to a 300ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'stat-change', data: { slotId: 'b1', changes: { def: -2 } } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("b1's Defense fell sharply!");
  });

  it('converts stat-change with multiple stats to multiple entries', () => {
    const events: TurnResolveEvent[] = [
      { type: 'stat-change', data: { slotId: 'a1', changes: { spa: 2, spd: 2, spe: 2 } } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const texts = entries.map(e => e.text);
    expect(texts).toContain("a1's Sp. Atk rose sharply!");
    expect(texts).toContain("a1's Sp. Def rose sharply!");
    expect(texts).toContain("a1's Speed rose sharply!");
  });

  it('converts weather-started rain to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'weather-started', data: { weather: 'rain', turnsRemaining: 5 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('It started to rain!');
  });

  it('converts weather-ended sun to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'weather-ended', data: { weather: 'sun' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('The harsh sunlight faded.');
  });

  it('converts terrain-started electric to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'terrain-started', data: { terrain: 'electric' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Electric Terrain electrified the field!');
  });

  it('converts terrain-ended to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'terrain-ended', data: { terrain: 'electric' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('The terrain returned to normal.');
  });

  it('converts trickroom-started to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'trickroom-started', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('The dimensions were distorted!');
  });

  it('converts trickroom-ended to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'trickroom-ended', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Trick Room ended!');
  });

  it('converts gravity-started to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'gravity-started', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Gravity intensified!');
  });

  it('converts gravity-ended to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'gravity-ended', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.delay).toBe(600);
  });

  it('converts side-condition-set reflect to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'side-condition-set', data: { side: 0, condition: 'reflect', value: 5 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain('Reflect');
  });

  it('converts side-condition-set spikes to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'side-condition-set', data: { side: 1, condition: 'spikes', value: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain('Spikes');
  });

  it('converts volatile-applied confusion to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-applied', data: { targetSlotId: 'b1', volatile: 'confusion' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('b1 became confused!');
  });

  it('converts volatile-applied substitute to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-applied', data: { targetSlotId: 'a1', volatile: 'substitute' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('a1 put in a substitute!');
  });

  it('converts volatile-applied flinch silently (no entry)', () => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-applied', data: { targetSlotId: 'b1', volatile: 'flinch' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(0);
  });

  it('converts volatile-cured confusion to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-cured', data: { slotId: 'b1', volatile: 'confusion' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('b1 snapped out of confusion!');
  });

  it('converts volatile-cured disable to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-cured', data: { slotId: 'a1', volatile: 'disable' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('a1 is no longer disabled!');
  });

  it('converts endure-survived to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'endure-survived', data: { slotId: 'a1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('a1 endured the hit!');
  });

  it('converts move-failed to a generic 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-failed', data: { moveId: 'splash', reason: 'unimplemented' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('But it failed!');
  });

  it('converts focus-sash to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'focus-sash', data: { slotId: 'a1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('a1 hung on using its Focus Sash!');
  });

  it('converts hazard-damage stealthRock to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'hazard-damage', data: { slotId: 'b1', hazard: 'stealthRock', damage: 25 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('b1 was hurt by Stealth Rock!');
  });

  it('converts hazard-damage spikes to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'hazard-damage', data: { slotId: 'b1', hazard: 'spikes', damage: 12 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('b1 was hurt by Spikes!');
  });

  it('converts screen-ended reflect to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'screen-ended', data: { screen: 'reflect', side: 0 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Reflect wore off!');
  });

  it('converts screen-broken lightScreen to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'screen-broken', data: { screen: 'lightScreen', side: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Light Screen was shattered!');
  });

  it('converts item-consumed to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'item-consumed', data: { slotId: 'a1', item: 'sitrus-berry', reason: 'triggered' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('a1 consumed its sitrus-berry!');
  });

  it('converts ability-triggered immune to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'ability-triggered', data: { slotId: 'b1', ability: 'levitate', effect: 'immune' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain('levitate');
  });

  it('converts move-note with inline text to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-note', data: { note: 'Magnitude 7!' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Magnitude 7!');
  });

  it('converts move-note mud-sport-started to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-note', data: { note: 'mud-sport-started', turnsRemaining: 5 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain('Mud Sport');
  });

  it('converts court-change to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'court-change', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.delay).toBe(600);
  });
});

describe('eventsToPlaybackEntries — volatile-applied text', () => {
  it.each([
    ['infatuation', 'mon-a fell in love!'],
    ['yawn', 'mon-a began to doze off!'],
    ['nightmare', 'mon-a fell into a nightmare!'],
    ['focusenergy', 'mon-a is getting pumped!'],
    ['laser-focus', 'mon-a is concentrating intensely!'],
    ['imprison', "mon-a sealed the opponent's moves!"],
    ['magic-coat', 'mon-a shrouded itself with a magic coat!'],
    ['snatch', 'mon-a is waiting to snatch a move!'],
    ['dragon-cheer', 'mon-a received a Dragon Cheer!'],
    ['foresight', 'mon-a was identified!'],
    ['miracle-eye', 'mon-a can no longer evade Psychic moves!'],
    ['electrify', "mon-a's moves were electrified!"],
    ['octolock', 'mon-a can no longer escape!'],
    ['minimize', 'mon-a minimized!'],
    ['geomancy-charge', 'mon-a is absorbing power!'],
    ['transformed', 'mon-a transformed!'],
    ['power-trick', 'mon-a switched its Attack and Defense!'],
    ['psych-up', 'mon-a psyched itself up!'],
    ['charging-solarbeam', 'mon-a absorbed light!'],
    ['outrage-active', 'mon-a began thrashing about!'],
    ['petaldance-active', 'mon-a began thrashing about!'],
    ['thrash-active', 'mon-a began thrashing about!'],
  ])('volatile %s → correct text', (volatile, expected) => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-applied', data: { targetSlotId: 'mon-a', volatile } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe(expected);
  });
});

describe('eventsToPlaybackEntries — volatile-cured text', () => {
  it.each([
    ['lock-on', 'mon-a is no longer taking aim!'],
    ['powder', 'mon-a is no longer covered in powder!'],
    ['power-trick', "mon-a's Attack and Defense returned to normal!"],
    ['outrage-active', 'mon-a became confused due to fatigue!'],
    ['petaldance-active', 'mon-a became confused due to fatigue!'],
    ['thrash-active', 'mon-a became confused due to fatigue!'],
  ])('volatile-cured %s → correct text', (volatile, expected) => {
    const events: TurnResolveEvent[] = [
      { type: 'volatile-cured', data: { slotId: 'mon-a', volatile } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe(expected);
  });
});

describe('eventsToPlaybackEntries — status-cured text', () => {
  it.each([
    ['slp', 'Charizard woke up!'],
    ['brn', "Charizard's burn healed!"],
    ['par', 'Charizard was cured of paralysis!'],
    ['frz', 'Charizard thawed out!'],
    ['psn', 'Charizard was cured of its poisoning!'],
    ['tox', 'Charizard was cured of its poisoning!'],
  ])('status %s → correct text', (status, expected) => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status, pokemonName: 'Charizard' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe(expected);
  });
});

describe('eventsToPlaybackEntries — move-note text', () => {
  it.each([
    ['item-bestowed', 'An item was bestowed!'],
    ['item-recycled', 'The item was recycled!'],
    ['ability-swapped', 'The two Pokémon swapped abilities!'],
    ['ability-copied', 'The ability was copied!'],
    ['ability-entrained', 'The ability was entrained!'],
    ['ability-changed-simple', "The target's ability became Simple!"],
    ['ability-changed-insomnia', "The target's ability became Insomnia!"],
    ['guard-split', 'Defense and Sp. Def were averaged!'],
    ['power-split', 'Attack and Sp. Atk were averaged!'],
    ['power-shift', 'Attack and Defense were swapped!'],
    ['ally-switched', 'The ally switched positions!'],
    ['after-you', 'The target will move next!'],
    ['pp-reduced-by-4', 'Its PP was reduced by 4!'],
    ['pp-reduced-by-1', 'Its PP was reduced by 1!'],
  ])('note %s → correct text', (note, expected) => {
    const events: TurnResolveEvent[] = [
      { type: 'move-note', data: { note } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe(expected);
  });
});

describe('eventsToPlaybackEntries — Pokémon name resolution', () => {
  function makeState(slotId: string, nickname: string): BattleState {
    return {
      battleId: 'b1', label: 'Test', turnNumber: 1, phase: 'action',
      field: { trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0, sideConditions: [{} as any, {} as any] },
      teams: [
        {
          teamId: 'team-a',
          slots: [{
            slotId, displayName: 'Player', isNpc: false, isSpectator: false,
            activePokemonIndex: 0,
            party: [{
              instanceId: 'i1', speciesId: 'charizard', speciesName: 'Charizard',
              level: 50, nickname, currentHp: 100, maxHp: 100,
              stats: { hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
              ability: 'blaze', moves: [], volatileStatus: [],
              statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
              hasTerastallized: false, fainted: false, expTotal: 0,
            }],
          }],
        },
        { teamId: 'team-b', slots: [] },
      ],
    } as BattleState;
  }

  it('uses Pokémon nickname in faint text when state is provided', () => {
    const state = makeState('slot-a1', 'Blaze');
    const events: TurnResolveEvent[] = [{ type: 'faint', data: { slotId: 'slot-a1' } }];
    const entries = eventsToPlaybackEntries(events, state);
    expect(entries[0]!.text).toContain('Blaze');
    expect(entries[0]!.text).not.toContain('slot-a1');
  });

  it('uses Pokémon nickname in damage-dealt text when state is provided', () => {
    const state = makeState('slot-b1', 'Ember');
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'slot-b1', targetSlotId: 'slot-b1', damage: 20, effectiveness: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events, state);
    expect(entries[0]!.text).toContain('Ember');
    expect(entries[0]!.text).not.toContain('slot-b1');
  });

  it('uses Pokémon nickname in heal text when state is provided', () => {
    const state = makeState('slot-a1', 'Leaf');
    const events: TurnResolveEvent[] = [
      { type: 'heal', data: { slotId: 'slot-a1', amount: 30, remainingHp: 90 } },
    ];
    const entries = eventsToPlaybackEntries(events, state);
    expect(entries[0]!.text).toContain('Leaf');
    expect(entries[0]!.text).not.toContain('slot-a1');
  });

  it('falls back to slotId when state is not provided', () => {
    const events: TurnResolveEvent[] = [{ type: 'faint', data: { slotId: 'slot-a1' } }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries[0]!.text).toContain('slot-a1');
  });
});
