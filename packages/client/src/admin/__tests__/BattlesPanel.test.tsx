import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { BattlesPanel } from '../BattlesPanel.js';
import type { BattleSummary } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.mocked(mockSocket.on).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

function emitBattlesData(battles: BattleSummary[]) {
  const call = mockSocket.on.mock.calls.find((c) => c[0] === 'battles:data');
  act(() => { call![1]({ battles }); });
}

function makeSummary(overrides: Partial<BattleSummary> = {}): BattleSummary {
  return {
    battleId: 'b1',
    label: 'Test Battle',
    status: 'ended',
    winningTeamId: 'uuid-aaa',
    startedAt: 1000,
    endedAt: 2000,
    turnNumber: 5,
    teams: [
      { teamId: 'uuid-aaa', slots: [{ displayName: 'Alice', isNpc: false }] },
      { teamId: 'uuid-bbb', slots: [{ displayName: 'Bob', isNpc: false }] },
    ],
    ...overrides,
  };
}

describe('BattlesPanel — winnerLabel', () => {
  it('shows correct winner name when the first team wins with a non-standard teamId', () => {
    render(<BattlesPanel onBack={vi.fn()} onWatch={vi.fn()} />);
    emitBattlesData([makeSummary({ winningTeamId: 'uuid-aaa' })]);
    expect(screen.getByText('Winner: Alice')).toBeTruthy();
  });

  it('shows correct winner name when the second team wins with a non-standard teamId', () => {
    render(<BattlesPanel onBack={vi.fn()} onWatch={vi.fn()} />);
    emitBattlesData([makeSummary({ winningTeamId: 'uuid-bbb' })]);
    expect(screen.getByText('Winner: Bob')).toBeTruthy();
  });

  it('shows raw teamId as fallback when teamId does not match any team', () => {
    render(<BattlesPanel onBack={vi.fn()} onWatch={vi.fn()} />);
    emitBattlesData([makeSummary({ winningTeamId: 'unknown-team' })]);
    expect(screen.getByText('Winner: unknown-team')).toBeTruthy();
  });

  it('shows dash when winningTeamId is null', () => {
    render(<BattlesPanel onBack={vi.fn()} onWatch={vi.fn()} />);
    emitBattlesData([makeSummary({ winningTeamId: null })]);
    expect(screen.getByText('Winner: —')).toBeTruthy();
  });
});
