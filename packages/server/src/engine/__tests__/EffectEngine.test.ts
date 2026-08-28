import { describe, it, expect, vi } from 'vitest';
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

describe('EffectEngine.runPreMove — freeze', () => {
  it('thaws the pokemon and allows the move on a successful thaw roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.2 → thaws
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'frz' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
    expect(result.events.some(e => e.type === 'status-cured')).toBe(true);
    vi.restoreAllMocks();
  });

  it('blocks the move when the thaw roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 >= 0.2 → stays frozen
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'frz' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.status).toBe('frz');
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('frozen');
    vi.restoreAllMocks();
  });
});

describe('EffectEngine.runPreMove — paralysis', () => {
  it('blocks the move on a full-paralysis roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.25 → fully paralyzed
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'par' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.status).toBe('par'); // status stays
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('paralysis');
    vi.restoreAllMocks();
  });

  it('allows the move when the paralysis roll does not trigger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 >= 0.25 → passes
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'par' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBe('par'); // status stays
    vi.restoreAllMocks();
  });
});

describe('EffectEngine.runPreMove — confusion', () => {
  it('cures confusion and allows the move when counter is 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 0 }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.volatileStatus.find(v => v.name === 'confusion')).toBeUndefined();
    expect(result.events.some(e => e.type === 'volatile-cured')).toBe(true);
    const evt = result.events.find(e => e.type === 'volatile-cured')!;
    expect(evt.data['volatile']).toBe('confusion');
  });

  it('decrements counter and blocks on a self-hit roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < 0.33 → self-hit; also makes randomDamageFactor deterministic
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      volatileStatus: [{ name: 'confusion', counter: 2 }],
      currentHp: 100, maxHp: 100,
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(pokemon.currentHp).toBeLessThan(100);
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
    const dmgEvt = result.events.find(e => e.type === 'damage-dealt')!;
    expect(dmgEvt.data['source']).toBe('confusion');
    vi.restoreAllMocks();
  });

  it('decrements counter and allows the move when self-hit does not trigger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // >= 0.33 → no self-hit
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 2 }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(result.events).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('a sleeping pokemon does not roll confusion', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would trigger self-hit if confusion ran
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 1 }, { name: 'confusion', counter: 2 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    // confusion counter must not have changed
    expect(pokemon.volatileStatus.find(v => v.name === 'confusion')!.counter).toBe(2);
    vi.restoreAllMocks();
  });

  it('a confused pokemon faints from self-hit damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      volatileStatus: [{ name: 'confusion', counter: 1 }],
      currentHp: 1, maxHp: 100,
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.fainted).toBe(true);
    expect(pokemon.currentHp).toBe(0);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('EffectEngine.runEndOfTurn — status damage', () => {
  it('burn deals 1/16 max HP and emits damage-dealt', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'brn', currentHp: 160, maxHp: 160 });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(150); // 160/16=10 damage
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
    const evt = result.events.find(e => e.type === 'damage-dealt')!;
    expect(evt.data['damage']).toBe(10);
    expect(evt.data['source']).toBe('status');
  });

  it('poison deals 1/8 max HP', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'psn', currentHp: 160, maxHp: 160 });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(140); // 160/8=20 damage
  });

  it('toxic damage scales with counter and counter increments each call', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'tox', currentHp: 160, maxHp: 160 });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=1, dmg=10
    expect(pokemon.currentHp).toBe(150);
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=2, dmg=20
    expect(pokemon.currentHp).toBe(130);
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=3, dmg=30
    expect(pokemon.currentHp).toBe(100);
  });

  it('burn faints the pokemon when HP reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'brn', currentHp: 1, maxHp: 160 });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.fainted).toBe(true);
    expect(pokemon.currentHp).toBe(0);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
  });
});

describe('EffectEngine.runEndOfTurn — leech seed', () => {
  it('drains 1/8 maxHp from seeded pokemon and heals source', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      instanceId: 'p-seeded',
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ instanceId: 'p-source', currentHp: 80, maxHp: 100 });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.currentHp).toBe(80);   // 160/8=20 drained
    expect(source.currentHp).toBe(100);  // healed 20, capped at 100
    expect(result.events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'leech-seed')).toBe(true);
    expect(result.events.some(e => e.type === 'heal')).toBe(true);
  });

  it('does not heal source if source is fainted', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ currentHp: 0, maxHp: 100, fainted: true });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.currentHp).toBe(80); // still drained
    expect(result.events.some(e => e.type === 'heal')).toBe(false);
  });

  it('faints the seeded pokemon if drain is lethal', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      currentHp: 1, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ currentHp: 50, maxHp: 100 });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.fainted).toBe(true);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
    // source still gets healed (drain happened, even if lethal)
    expect(source.currentHp).toBe(51);
  });
});

describe('EffectEngine.runEndOfTurn — bind', () => {
  it('deals 1/8 maxHp damage each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'bound', counter: 4, sourceSlotId: 'slot-b1' }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(80); // 160/8=20 damage
  });

  it('decrements the counter each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 100,
      volatileStatus: [{ name: 'bound', counter: 3, sourceSlotId: 'slot-b1' }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus[0]!.counter).toBe(2);
  });

  it('removes bound and emits volatile-cured when counter reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 100,
      volatileStatus: [{ name: 'bound', counter: 1, sourceSlotId: 'slot-b1' }],
    });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'bound')).toBeUndefined();
    expect(result.events.some(e => e.type === 'volatile-cured')).toBe(true);
    const evt = result.events.find(e => e.type === 'volatile-cured')!;
    expect(evt.data['volatile']).toBe('bound');
  });
});

describe('EffectEngine.runEndOfTurn — yawn', () => {
  it('decrements the counter each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'yawn', counter: 2 }] });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(pokemon.status).toBeUndefined();
  });

  it('applies sleep and removes yawn when counter reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'yawn', counter: 1 }] });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'yawn')).toBeUndefined();
    expect(pokemon.status).toBe('slp');
    const sleepEntry = pokemon.volatileStatus.find(v => v.name === 'sleep');
    expect(sleepEntry).toBeDefined();
    expect(sleepEntry!.counter).toBeGreaterThanOrEqual(1);
    expect(sleepEntry!.counter).toBeLessThanOrEqual(3);
  });

  it('silently removes yawn when target already has a status (cannot sleep)', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'par',
      volatileStatus: [{ name: 'yawn', counter: 1 }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'yawn')).toBeUndefined();
    expect(pokemon.status).toBe('par'); // unchanged
  });
});

describe('EffectEngine.runPreMove — flinch', () => {
  it('blocks move and removes flinch volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'flinch' }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
    expect(result.events.find(e => e.type === 'move-blocked')?.data['reason']).toBe('flinch');
  });

  it('does not block if no flinch volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
  });
});

describe('EffectEngine.runPreMove — recharge', () => {
  it('blocks move and removes recharge volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'recharge' }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus.some(v => v.name === 'recharge')).toBe(false);
    expect(result.events.find(e => e.type === 'move-blocked')?.data['reason']).toBe('recharge');
  });
});
