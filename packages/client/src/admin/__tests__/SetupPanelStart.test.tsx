import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers: Record<string, (p: any) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (p: any) => void) => { handlers[event] = handler; }),
  off: vi.fn(),
};
vi.mock('../../socket.js', () => ({ getSocket: vi.fn(() => mockSocket) }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'battle-1') }));
vi.mock('../steps/TeamStructureStep.js', () => ({
  TeamStructureStep: ({ onNext }: any) => <button onClick={() => onNext({ teamASlots: 1, teamBSlots: 0 })}>structure</button>,
}));
vi.mock('../steps/SlotAssignmentStep.js', () => ({
  SlotAssignmentStep: ({ onNext }: any) => (
    <button onClick={() => onNext({ teamA: [{ slotId: 'a1', type: 'player', displayName: 'Ash', profileId: 'p1', defaultTeam: [] }], teamB: [] })}>assign</button>
  ),
}));
vi.mock('../steps/BattleSettingsStep.js', () => ({
  BattleSettingsStep: ({ onStart }: any) => (
    <>
      <button onClick={() => onStart({ label: 'Battle' })}>start</button>
      <button onClick={() => onStart({ label: 'Battle', weather: 'rain' })}>start-rain</button>
    </>
  ),
}));
vi.mock('../BattleWaitingScreen.js', () => ({ BattleWaitingScreen: () => <div>waiting-screen</div> }));

import { SetupPanel } from '../SetupPanel.js';

function startBattle() {
  render(<SetupPanel onBack={vi.fn()} onWatch={vi.fn()} />);
  fireEvent.click(screen.getByText('structure'));
  fireEvent.click(screen.getByText('assign'));
  fireEvent.click(screen.getByText('start'));
}

beforeEach(() => { vi.clearAllMocks(); });

describe('SetupPanel start result', () => {
  it('sends the profile ID and waits for success', () => {
    startBattle();
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      data: expect.objectContaining({ teams: [{ slots: [expect.objectContaining({ profileId: 'p1' })] }, { slots: [] }] }),
    }));
    expect(screen.queryByText('waiting-screen')).toBeNull();
    act(() => handlers['admin:start-result']!({ battleId: 'battle-1', ok: true }));
    expect(screen.getByText('waiting-screen')).toBeTruthy();
  });

  it('sends starting weather only when chosen', () => {
    startBattle();
    expect(mockSocket.emit.mock.calls[0]![1].data).not.toHaveProperty('weather');
    act(() => handlers['admin:start-result']!({ battleId: 'battle-1', ok: false, message: 'no' }));
    fireEvent.click(screen.getByText('start-rain'));
    expect(mockSocket.emit.mock.calls[1]![1].data).toMatchObject({ weather: 'rain' });
  });

  it('stays on settings and shows the reason when refused', () => {
    startBattle();
    act(() => handlers['admin:start-result']!({ battleId: 'battle-1', ok: false, message: 'Ash has no usable Pokémon.' }));
    expect(screen.getByText('Ash has no usable Pokémon.')).toBeTruthy();
    expect(screen.getByText('start')).toBeTruthy();
    expect(screen.queryByText('waiting-screen')).toBeNull();
  });
});
