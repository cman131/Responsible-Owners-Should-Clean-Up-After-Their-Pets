import { describe, it, expect } from 'vitest';
import { captureCondition, applyCondition, toHealth } from '../condition.js';
import { makePokemon } from '../../engine/__tests__/fixtures.js';

const MOVES = ['flamethrower', 'airslash', 'roost', 'willowisp'];

describe('captureCondition', () => {
  it('records HP, status, sleep turns and PP used', () => {
    const mon = makePokemon({ currentHp: 40, status: 'slp', volatileStatus: [{ name: 'sleep', counter: 2 }] });
    mon.moves[0].currentPp = 12;

    expect(captureCondition(mon, MOVES)).toEqual({
      currentHp: 40, maxHp: 100, status: 'slp', sleepTurns: 2,
      ppUsed: { flamethrower: 3, airslash: 0, roost: 0, willowisp: 0 },
    });
  });

  it('saves a fainted Pokémon with 0 HP and no status', () => {
    const mon = makePokemon({ currentHp: 0, fainted: true, status: 'brn' });
    const condition = captureCondition(mon, MOVES);
    expect(condition.currentHp).toBe(0);
    expect(condition.status).toBeUndefined();
  });

  it('uses the original moves of a transformed Pokémon', () => {
    const mon = makePokemon();
    const original = mon.moves.map((m) => ({ ...m })) as typeof mon.moves;
    original[1].currentPp = 10;
    mon.originalForm = { stats: mon.stats, ability: mon.ability, moves: original };
    mon.moves[1] = { moveId: 'tackle', currentPp: 1, maxPp: 5 };

    expect(captureCondition(mon, MOVES).ppUsed['airslash']).toBe(5);
  });

  it('keeps the previous PP for a move replaced during battle', () => {
    const mon = makePokemon();
    mon.moves[2] = { moveId: 'tackle', currentPp: 5, maxPp: 5 };

    const condition = captureCondition(mon, MOVES, { currentHp: 100, maxHp: 100, ppUsed: { roost: 4 } });

    expect(condition.ppUsed['roost']).toBe(4);
    expect(condition.ppUsed['tackle']).toBeUndefined();
  });
});

describe('applyCondition', () => {
  it('round-trips into a fresh Pokémon', () => {
    const mon = makePokemon();
    applyCondition(mon, { currentHp: 40, maxHp: 100, status: 'slp', sleepTurns: 2, ppUsed: { flamethrower: 3 } });

    expect(mon.currentHp).toBe(40);
    expect(mon.fainted).toBe(false);
    expect(mon.status).toBe('slp');
    expect(mon.volatileStatus).toEqual([{ name: 'sleep', counter: 2 }]);
    expect(mon.moves[0].currentPp).toBe(12);
  });

  it('keeps the HP percentage when max HP changed', () => {
    const mon = makePokemon({ maxHp: 150, currentHp: 150 });
    applyCondition(mon, { currentHp: 50, maxHp: 100, ppUsed: {} });
    expect(mon.currentHp).toBe(75);
  });

  it('leaves a living Pokémon at least 1 HP', () => {
    const mon = makePokemon({ maxHp: 20, currentHp: 20 });
    applyCondition(mon, { currentHp: 1, maxHp: 300, ppUsed: {} });
    expect(mon.currentHp).toBe(1);
    expect(mon.fainted).toBe(false);
  });

  it('keeps a fainted Pokémon fainted', () => {
    const mon = makePokemon({ maxHp: 200, currentHp: 200 });
    applyCondition(mon, { currentHp: 0, maxHp: 100, ppUsed: {} });
    expect(mon.currentHp).toBe(0);
    expect(mon.fainted).toBe(true);
  });

  it('keeps HP and PP in range and ignores unknown moves', () => {
    const mon = makePokemon();
    applyCondition(mon, { currentHp: 999, maxHp: 100, ppUsed: { flamethrower: 99, splash: 3 } });
    expect(mon.currentHp).toBe(100);
    expect(mon.moves[0].currentPp).toBe(0);
  });
});

describe('toHealth', () => {
  it('describes a Pokémon and skips empty move slots', () => {
    const mon = makePokemon({ currentHp: 55, status: 'par' });
    mon.moves[3] = { moveId: '', currentPp: 0, maxPp: 0 };
    const health = toHealth('pk1', mon);
    expect(health).toMatchObject({ pokemonId: 'pk1', currentHp: 55, maxHp: 100, status: 'par' });
    expect(health.moves).toHaveLength(3);
  });
});
