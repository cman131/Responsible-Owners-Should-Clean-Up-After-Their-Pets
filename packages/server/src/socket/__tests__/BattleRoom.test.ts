import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State } from '../../engine/__tests__/fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleRoom', () => {
  let room: BattleRoom;

  beforeEach(() => {
    const state = make1v1State();
    room = new BattleRoom({ initialState: state, timerSeconds: 60 });
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

  it('auto-submits and resolves when timer expires', () => {
    vi.useFakeTimers();
    try {
      const state = make1v1State();
      const fakeRoom = new BattleRoom({ initialState: state, timerSeconds: 60 });
      const events: unknown[] = [];
      fakeRoom.onTurnResolved((e) => events.push(e));

      // Only slot-a1 submits; slot-b1 does not
      fakeRoom.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });

      // Advance timer past 60 seconds
      vi.advanceTimersByTime(61_000);

      expect(events.length).toBeGreaterThan(0);
      expect(fakeRoom.getState().turnNumber).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires onBattleEnd when a team wins', () => {
    const endEvents: string[] = [];
    room.onBattleEnd((winningTeamId) => endEvents.push(winningTeamId));

    // Set p2 to 1 HP so one hit kills them
    const state = room.getState();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    // getState() returns mutable ref in current impl — this tests that path
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(endEvents.length).toBe(1);
    expect(endEvents[0]).toBe('team-a');
  });

  it('pause stops the timer from auto-resolving', () => {
    vi.useFakeTimers();
    try {
      const state = make1v1State();
      const fakeRoom = new BattleRoom({ initialState: state, timerSeconds: 60 });
      const events: unknown[] = [];
      fakeRoom.onTurnResolved((e) => events.push(e));

      fakeRoom.pause();
      vi.advanceTimersByTime(120_000); // 2 minutes — well past timer

      expect(events.length).toBe(0); // timer should not have fired
    } finally {
      vi.useRealTimers();
    }
  });
});
