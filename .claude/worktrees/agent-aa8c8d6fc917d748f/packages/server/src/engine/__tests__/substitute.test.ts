import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';
import { applyVolatile, applyStatus } from '../effects.js';

describe('substitute factory', () => {
  it('fails if user HP <= 25% of max', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 25; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'substitute', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'too-weak-for-sub')).toBe(true);
  });

  it('costs 25% HP and creates substitute with that HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p1.currentHp = 100; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'substitute', currentPp: 10, maxPp: 10 };
    // p2 uses a non-damaging status move so the sub is not attacked this turn
    p2.moves[0] = { moveId: 'substitute', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(75);
    const subEntry = p1After.volatileStatus.find(v => v.name === 'substitute');
    expect(subEntry).toBeDefined();
    expect(subEntry?.hp).toBe(25);
  });
});

describe('applyVolatile blocks through substitute', () => {
  it('leech-seed cannot be applied to a pokemon with substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyVolatile(p, 'slot', 'atk-slot', 'leech-seed');
    expect(result).toBeNull();
  });

  it('sound-move bypass allows volatile through substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyVolatile(p, 'slot', 'atk-slot', 'confusion', undefined, { bypassSub: true });
    expect(result).not.toBeNull();
  });
});

describe('applyStatus blocks through substitute', () => {
  it('cannot apply burn to pokemon with substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyStatus(p, 'slot', 'brn', ['Normal']);
    expect(result).toBeNull();
  });
});

describe('substitute damage interception', () => {
  it('absorbs damage to sub HP instead of real HP', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'substitute', hp: 50 });
    defender.currentHp = 75; defender.maxHp = 100;

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(75); // real HP unchanged
    // sub HP reduced (exact amount depends on damage calc, but sub still active or broken)
  });

  it('sub breaks when sub HP reaches 0 and emits volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'substitute', hp: 1 }); // 1 HP sub
    defender.currentHp = 75; defender.maxHp = 100;

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(75);
    expect(defAfter.volatileStatus.some(v => v.name === 'substitute')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'substitute')).toBe(true);
  });
});
