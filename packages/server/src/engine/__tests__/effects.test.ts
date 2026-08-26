import { describe, it, expect, vi } from 'vitest';
import { applyStatus, applyStatBoost, evaluateSecondaryEffect } from '../effects.js';
import type { Move } from '@poke-fighter/shared';
import { makePokemon } from './fixtures.js';

describe('applyStatus', () => {
  it('applies burn and returns a status-applied event', () => {
    const mon = makePokemon({ ability: '' });
    const event = applyStatus(mon, 'slot-a1', 'brn', ['Water']);
    expect(mon.status).toBe('brn');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('status-applied');
    expect(event!.data['slotId']).toBe('slot-a1');
    expect(event!.data['status']).toBe('brn');
  });

  it('returns null and leaves status unchanged if target is type-immune', () => {
    const mon = makePokemon({ ability: '' });
    const event = applyStatus(mon, 'slot-a1', 'brn', ['Fire']);
    expect(event).toBeNull();
    expect(mon.status).toBeUndefined();
  });

  it('returns null if target already has a status condition', () => {
    const mon = makePokemon({ status: 'par', ability: '' });
    const event = applyStatus(mon, 'slot-a1', 'brn', ['Water']);
    expect(event).toBeNull();
    expect(mon.status).toBe('par');
  });

  it('adds a sleep volatile entry with counter 1–3 when applying sleep', () => {
    const mon = makePokemon({ ability: '' });
    applyStatus(mon, 'slot-a1', 'slp', ['Normal']);
    expect(mon.status).toBe('slp');
    const entry = mon.volatileStatus.find(v => v.name === 'sleep');
    expect(entry).toBeDefined();
    expect(entry!.counter).toBeGreaterThanOrEqual(1);
    expect(entry!.counter).toBeLessThanOrEqual(3);
  });
});

describe('applyStatBoost', () => {
  it('raises attack by 2 and returns a stat-change event', () => {
    const mon = makePokemon();
    const event = applyStatBoost(mon, 'slot-a1', { atk: 2 });
    expect(mon.statBoosts.atk).toBe(2);
    expect(event.type).toBe('stat-change');
    expect(event.data['slotId']).toBe('slot-a1');
    expect(event.data['changes']).toEqual({ atk: 2 });
  });

  it('lowers attack by 1', () => {
    const mon = makePokemon();
    applyStatBoost(mon, 'slot-a1', { atk: -1 });
    expect(mon.statBoosts.atk).toBe(-1);
  });

  it('clamps boost at +6', () => {
    const mon = makePokemon({
      statBoosts: { atk: 5, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    });
    applyStatBoost(mon, 'slot-a1', { atk: 3 });
    expect(mon.statBoosts.atk).toBe(6);
  });

  it('clamps boost at -6', () => {
    const mon = makePokemon({
      statBoosts: { atk: -5, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    });
    applyStatBoost(mon, 'slot-a1', { atk: -3 });
    expect(mon.statBoosts.atk).toBe(-6);
  });

  it('applies multiple stat changes at once', () => {
    const mon = makePokemon();
    applyStatBoost(mon, 'slot-a1', { spa: 1, spd: 1 });
    expect(mon.statBoosts.spa).toBe(1);
    expect(mon.statBoosts.spd).toBe(1);
  });
});

describe('evaluateSecondaryEffect', () => {
  it('returns null if the move has no effect or effectChance', () => {
    const move = {} as Move;
    const target = makePokemon({ ability: '' });
    expect(evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal'])).toBeNull();
  });

  it('applies the status when the random roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 * 100 = 0, which is < 30
    const move = { effect: 'psn', effectChance: 30 } as unknown as Move;
    const target = makePokemon({ ability: '' });
    const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal']);
    expect(event).not.toBeNull();
    expect(target.status).toBe('psn');
    vi.restoreAllMocks();
  });

  it('returns null when the random roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 99 >= 30
    const move = { effect: 'brn', effectChance: 30 } as unknown as Move;
    const target = makePokemon({ ability: '' });
    const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal']);
    expect(event).toBeNull();
    expect(target.status).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('returns null if the target is immune to the secondary status', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // roll succeeds
    const move = { effect: 'brn', effectChance: 10 } as unknown as Move;
    const target = makePokemon({ ability: '' });
    const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Fire']); // Fire immune to burn
    expect(event).toBeNull();
    expect(target.status).toBeUndefined();
    vi.restoreAllMocks();
  });
});
