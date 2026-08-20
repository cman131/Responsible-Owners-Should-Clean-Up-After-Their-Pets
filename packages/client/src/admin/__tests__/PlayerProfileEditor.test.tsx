import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, onSendToBank }: any) => (
    <div>
      <span>team-builder</span>
      <button onClick={() => onSendToBank?.({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['','','',''], ability: 'Overgrow', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} })}>
        send-to-bank
      </button>
      <button onClick={() => onTeamSaved([])}>clear-team</button>
    </div>
  ),
}));
vi.mock('../BankTab.js', () => ({
  BankTab: ({ bank, onMoveToTeam }: any) => (
    <div>
      <span>bank-tab-{bank.length}</span>
      <button onClick={() => onMoveToTeam({ speciesId: 2, nickname: 'Ivysaur', level: 16, nature: 'bold', moves: ['','','',''], ability: 'Overgrow', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} })}>
        move-to-team
      </button>
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { PlayerProfileEditor } from '../PlayerProfileEditor.js';

const mockSocket = { emit: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('PlayerProfileEditor', () => {
  it('renders name field and TEAM / BANK tabs', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/ash ketchum/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^team/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^bank/i })).toBeTruthy();
  });

  it('shows bank tab content when BANK tab is clicked', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-0')).toBeTruthy();
  });

  it('SAVE is disabled when name is empty', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits registry:save-player with displayName and bank on SAVE', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/ash ketchum/i), { target: { value: 'Ash' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-player',
      data: expect.objectContaining({
        profile: expect.objectContaining({ displayName: 'Ash', bank: [] }),
      }),
    }));
  });

  it('bank count increases when a pokemon is sent to bank', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('send-to-bank'));
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-1')).toBeTruthy();
  });

  it('pre-fills name and bank from existing profile', () => {
    const profile = {
      profileId: 'p1', displayName: 'Misty', createdAt: '2026-01-01T00:00:00Z',
      bank: [{ speciesId: 120, nickname: 'Staryu', level: 30, nature: 'bold', moves: ['','','',''], ability: 'Illuminate', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} }],
    };
    render(<PlayerProfileEditor profile={profile} onBack={vi.fn()} />);
    expect(screen.getByDisplayValue('Misty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-1')).toBeTruthy();
  });
});
