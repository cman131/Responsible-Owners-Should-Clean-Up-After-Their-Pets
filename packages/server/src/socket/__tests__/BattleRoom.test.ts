import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State } from '../../engine/__tests__/fixtures.js';
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
    expect(req!.legalTargets).toContain('slot-b1');
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
