import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture event handlers registered on the socket mock
let socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => mockSocket),
}));

import { BattleWaitingScreen } from '../BattleWaitingScreen.js';

const slotAssignment = {
  teamA: [{ slotId: 'slot-a1', displayName: 'Conor', type: 'player' as const }],
  teamB: [{ slotId: 'slot-b1', displayName: 'Ash NPC', type: 'npc' as const }],
};

describe('BattleWaitingScreen', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  it('renders team sections with player names', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText('Conor')).toBeTruthy();
    expect(screen.getByText('Ash NPC')).toBeTruthy();
  });

  it('requests slot status on mount', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'lobby:slot-status',
      data: { battleId: 'battle-1' },
    });
  });

  it('shows Waiting for player slots by default', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/waiting/i)).toBeTruthy();
  });

  it('shows Joined indicator after lobby:slot-status event marks slot joined', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );

    act(() => {
      socketHandlers['lobby:slot-status']?.({
        battleId: 'battle-1',
        slots: [{ slotId: 'slot-a1', displayName: 'Conor', joined: true }],
      });
    });

    expect(screen.getByText(/joined/i)).toBeTruthy();
  });

  it('ignores slot-status events for other battles', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );

    act(() => {
      socketHandlers['lobby:slot-status']?.({
        battleId: 'battle-DIFFERENT',
        slots: [{ slotId: 'slot-a1', displayName: 'Conor', joined: true }],
      });
    });

    expect(screen.queryByText(/joined/i)).toBeFalsy();
  });

  it('shows NPC label for NPC slots', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/npc/i)).toBeTruthy();
  });

  it('shows the connected count', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/0\s*\/\s*1/)).toBeTruthy();
  });

  it('calls onWatch with battleId when WATCH BATTLE is clicked', () => {
    const onWatch = vi.fn();
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={onWatch}
      />
    );
    screen.getByRole('button', { name: /watch/i }).click();
    expect(onWatch).toHaveBeenCalledWith('battle-1');
  });

  it('removes lobby:slot-status listener on unmount', () => {
    const { unmount } = render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('lobby:slot-status', expect.any(Function));
  });
});
