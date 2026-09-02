import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

let socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../socket.js', () => ({
  getSocket: vi.fn(() => mockSocket),
  connectAsPlayer: vi.fn(),
}));

import { LobbyPage } from '../pages/LobbyPage.js';

const mockBattles = [
  {
    battleId: 'battle-1',
    label: 'Friday Night Brawl',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor', status: 'available' as const },
      { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
    ],
  },
];

describe('LobbyPage', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  it('shows empty state when no battles are available', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: [] });
    });
    expect(screen.getByText(/no active battles/i)).toBeTruthy();
  });

  it('renders a battle card for each available battle', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    expect(screen.getByText('Friday Night Brawl')).toBeTruthy();
  });

  it('shows slot count on battle card', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    expect(screen.getByText(/2 slots/i)).toBeTruthy();
  });

  it('shows slot dropdown after selecting a battle', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('JOIN BATTLE button is disabled until both battle and slot are selected', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    const btn = screen.getByRole('button', { name: /join battle/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('emits player:join with battleId and slotId on submit', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('player:join', {
      battleId: 'battle-1',
      slotId: 'slot-a1',
    });
  });

  it('shows waiting screen after joining', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(screen.getByText(/waiting/i)).toBeTruthy();
  });

  it('shows display name in waiting screen derived from selected slot', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(screen.getByText(/conor/i)).toBeTruthy();
  });

  it('shows error and stays in browse phase on lobby:error', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    act(() => {
      socketHandlers['lobby:error']?.({ code: 'SLOT_TAKEN', message: 'That slot is already taken.' });
    });
    expect(screen.getByText(/already taken/i)).toBeTruthy();
    expect(screen.queryByText(/waiting for the battle/i)).toBeFalsy();
  });

  it('shows "Full – In Progress" and no slot dropdown when all slots are occupied', () => {
    const fullBattle = {
      battleId: 'battle-2',
      label: 'Locked Battle',
      slots: [
        { slotId: 'slot-a1', displayName: 'Conor', status: 'occupied' as const },
        { slotId: 'slot-b1', displayName: 'Kyle', status: 'occupied' as const },
      ],
    };
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: [fullBattle] });
    });
    fireEvent.click(screen.getByText('Locked Battle'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/full/i)).toBeTruthy();
  });

  it('appends (reconnect) to reconnectable slot names in the dropdown', () => {
    const reconnectBattle = {
      battleId: 'battle-3',
      label: 'Reconnect Battle',
      slots: [
        { slotId: 'slot-a1', displayName: 'Conor', status: 'reconnectable' as const },
        { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
      ],
    };
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: [reconnectBattle] });
    });
    fireEvent.click(screen.getByText('Reconnect Battle'));
    expect(screen.getByText('Conor (reconnect)')).toBeTruthy();
  });

  it('excludes occupied slots from the slot dropdown', () => {
    const mixedBattle = {
      battleId: 'battle-4',
      label: 'Mixed Battle',
      slots: [
        { slotId: 'slot-a1', displayName: 'Conor', status: 'occupied' as const },
        { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
      ],
    };
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: [mixedBattle] });
    });
    fireEvent.click(screen.getByText('Mixed Battle'));
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.queryByText(/Conor/)).toBeNull();
    expect(screen.getByText('Kyle')).toBeTruthy();
  });
});
