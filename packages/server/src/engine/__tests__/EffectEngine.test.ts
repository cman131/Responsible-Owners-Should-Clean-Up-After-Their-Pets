import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../EffectEngine.js';
import type { SlotContext } from '../EffectEngine.js';
import { makePokemon } from './fixtures.js';
import type { BattleState } from '@poke-fighter/shared';

const emptyState = {} as BattleState;
const emptySlots: SlotContext[] = [];

describe('EffectEngine.runPreMove — sleep', () => {
  it('blocks the move and decrements counter when counter > 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 2 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('asleep');
  });

  it('wakes the pokemon and allows the move when counter is 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 0 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
    expect(pokemon.volatileStatus.find(v => v.name === 'sleep')).toBeUndefined();
    expect(result.events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('wakes the pokemon when there is no sleep volatile entry (defensive guard)', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'slp', volatileStatus: [] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
  });

  it('does not block a pokemon with no status', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon();
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});
