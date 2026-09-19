import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...(actual as object), useNavigate: () => mockNavigate };
});

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
  connectAsPlayerPortal: vi.fn(),
}));

import { connectAsPlayerPortal } from '../../socket.js';

import { PlayerPortalPage } from '../PlayerPortalPage.js';
import type { PlayerProfile } from '@poke-fighter/shared';

const mockProfile: PlayerProfile = {
  profileId: 'p1',
  displayName: 'Ash Ketchum',
  createdAt: '2024-01-01',
};

describe('PlayerPortalPage', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    vi.mocked(connectAsPlayerPortal).mockClear();
    mockNavigate.mockClear();
  });

  it('shows key input and ENTER button in entry phase', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/player key/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /enter/i })).toBeTruthy();
  });

  it('shows loading state after submitting a key', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(screen.getByText(/authenticating/i)).toBeTruthy();
  });

  it('calls connectAsPlayerPortal and emits player:portal-auth on submit', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(vi.mocked(connectAsPlayerPortal)).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-auth', { playerKey: 'my-key' });
  });

  it('shows portal with displayName when player:portal-data fires', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByText(/ash ketchum/i)).toBeTruthy();
  });

  it('shows Team, Bank, and Inventory tab buttons in portal phase', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByRole('button', { name: /^team$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^bank$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^inventory$/i })).toBeTruthy();
  });

  it('shows back to lobby link in portal phase', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByText(/back to lobby/i)).toBeTruthy();
  });

  it('returns to entry phase with error message when player:portal-error fires', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-error']?.({ message: 'Invalid player key.' });
    });
    expect(screen.getByText(/invalid player key/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/player key/i)).toBeTruthy();
  });
});
