import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type EventHandler = (...args: unknown[]) => void;

const listeners = new Map<string, EventHandler[]>();
const mockSocket = {
  on: vi.fn((event: string, handler: EventHandler) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(handler);
  }),
  off: vi.fn((event: string, handler: EventHandler) => {
    listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
  }),
};

function emit(event: string, ...args: unknown[]) {
  listeners.get(event)?.forEach((h) => h(...args));
}

vi.mock('../../socket.js', () => ({
  connectAsAdmin: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
}));
vi.mock('../AdminRouter.tsx', () => ({ AdminRouter: () => <div>admin-router</div> }));

import { connectAsAdmin } from '../../socket.js';
import { AdminShell } from '../AdminShell.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  listeners.clear();
});

describe('AdminShell', () => {
  it('shows login form when no session in localStorage', () => {
    render(<AdminShell />);
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });

  it('shows connecting state and calls connectAsAdmin when valid session exists', () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'stored-token',
      expiresAt: Date.now() + 60_000,
    }));
    render(<AdminShell />);
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('stored-token');
    expect(screen.getByText(/verifying token/i)).toBeTruthy();
  });

  it('renders AdminRouter after server confirms admin:authenticated from session', async () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'stored-token',
      expiresAt: Date.now() + 60_000,
    }));
    render(<AdminShell />);
    await act(async () => { emit('admin:authenticated'); });
    expect(screen.getByText('admin-router')).toBeTruthy();
  });

  it('shows login form when session is expired', () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'old-token',
      expiresAt: Date.now() - 1000,
    }));
    render(<AdminShell />);
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });

  it('shows connecting state after form submit and renders AdminRouter on admin:authenticated', async () => {
    render(<AdminShell />);
    fireEvent.change(screen.getByPlaceholderText(/admin token/i), { target: { value: 'my-token' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('my-token');
    expect(screen.getByText(/verifying token/i)).toBeTruthy();

    await act(async () => { emit('admin:authenticated'); });
    const stored = JSON.parse(localStorage.getItem('poke_admin_session')!);
    expect(stored.token).toBe('my-token');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
    expect(screen.getByText('admin-router')).toBeTruthy();
  });

  it('clears session and shows error on admin:error', async () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'bad-token',
      expiresAt: Date.now() + 60_000,
    }));
    render(<AdminShell />);
    await act(async () => { emit('admin:error', { message: 'Invalid admin token' }); });
    expect(localStorage.getItem('poke_admin_session')).toBeNull();
    expect(screen.getByText('Invalid admin token')).toBeTruthy();
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });
});
