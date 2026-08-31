import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State, makePokemon } from '../../engine/__tests__/fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleRoom', () => {
  let room: BattleRoom;

  beforeEach(() => {
    const state = make1v1State();
    room = new BattleRoom({ initialState: state });
  });

  it('starts in action phase waiting for submissions', () => {
    expect(room.getState().phase).toBe('action');
  });

  it('collects a valid action from a slot', () => {
    const action: MoveAction = { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' };
    const result = room.submitAction('slot-a1', action);
    expect(result.ok).toBe(true);
  });

  it('resolves turn when all slots have submitted', () => {
    const events: unknown[] = [];
    room.onTurnResolved((e) => events.push(e));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(events.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });

  it('rejects action from unknown slot', () => {
    const result = room.submitAction('slot-unknown', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(false);
  });

  it('fires onBattleEnd when a team wins', () => {
    const endEvents: string[] = [];
    room.onBattleEnd((winningTeamId) => endEvents.push(winningTeamId));

    const state = room.getState();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(endEvents.length).toBe(1);
    expect(endEvents[0]).toBe('team-a');
  });
});

describe('getPendingActionRequest', () => {
  it('returns an action request for a human slot that has not yet submitted', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req).not.toBeNull();
    expect(req!.slotId).toBe('slot-a1');
    expect(req!.validMoves).toHaveLength(4);
    expect(req!.validMoves[0]!.legalTargets).toContain('slot-b1');
    expect(req!.validMoves[0]!.targetType).toBe('normal'); // flamethrower targets normal
  });

  it('returns null after the slot has submitted an action', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });

  it('returns null for an NPC slot', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-b1')).toBeNull();
  });

  it('returns null for a fainted slot', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });
});

describe('onPlayerActionRequired', () => {
  it('fires deferred at construction with one entry per active human slot', async () => {
    // make1v1State has slot-a1 (isNpc=false) and slot-b1 (isNpc=true)
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    // Must not fire synchronously
    expect(cb).not.toHaveBeenCalled();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('fires again after resolveTurn with the next turn human slots', async () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    cb.mockClear();

    // Both slots submit — triggers resolveTurn synchronously
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    // resolveTurn fires synchronously — callback fires synchronously in else-branch
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('excludes NPC and spectator slots', async () => {
    const state = make1v1State();
    // slot-b1 is isNpc=true, slot-a1 is isNpc=false
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    const requests: Array<{ slotId: string }> = cb.mock.calls[0]![0];
    expect(requests.every((r) => r.slotId !== 'slot-b1')).toBe(true);
  });
});

describe('forced switch correctness', () => {
  function makeStateWithBench() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    return state;
  }

  it('forced switch applies Stealth Rock to incoming Pokémon', () => {
    const state = makeStateWithBench();
    state.field.sideConditions[0]!.stealthRock = true;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    const result = room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });
    expect(result.ok).toBe(true);

    const bench = room.getState().teams[0]!.slots[0]!.party[1]!;
    expect(bench.currentHp).toBeLessThan(bench.maxHp);
    expect(events.some(e => e.type === 'hazard-damage')).toBe(true);
  });

  it('forced switch emits pokemon-switched event', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });

    expect(events.some(e => e.type === 'pokemon-switched' && e.data['reason'] === 'forced')).toBe(true);
  });
});
