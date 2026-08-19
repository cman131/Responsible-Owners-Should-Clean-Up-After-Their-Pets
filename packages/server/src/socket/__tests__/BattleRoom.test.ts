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
});
