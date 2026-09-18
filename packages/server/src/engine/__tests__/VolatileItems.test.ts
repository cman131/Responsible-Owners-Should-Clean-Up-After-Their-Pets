import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('Mental Herb', () => {
  it('cures infatuation immediately when Attract is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'attract', currentPp: 15, maxPp: 15 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'infatuation')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any)['item'] === 'mental-herb')).toBe(true);
  });

  it('cures taunt when Taunt is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'taunt', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'taunt')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });

  it('cures encore when Encore is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'encore', currentPp: 5, maxPp: 5 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'encore')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });

  it('cures torment when Torment is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'torment', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'torment')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });

  it('cures disable when Disable is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'disable', currentPp: 20, maxPp: 20 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'disable')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });

  it('cures heal-block when Heal Block is used and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'mental-herb';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'healblock', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'heal-block')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });
});

describe('Destiny Knot', () => {
  it('spreads infatuation to the attacker when holder is infatuated by Attract', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'destiny-knot';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'attract', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'infatuation')).toBeDefined();
    expect(p2.volatileStatus.find(v => v.name === 'infatuation')).toBeDefined();
  });

  it('is not consumed when infatuation is spread', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'destiny-knot';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'attract', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('destiny-knot');
  });

  it('does not spread infatuation if attacker is already infatuated', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'destiny-knot';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'attract', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'infatuation', sourceSlotId: 'slot-a1' });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.filter(v => v.name === 'infatuation').length).toBe(1);
  });
});
