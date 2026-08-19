import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ connectAsAdmin: vi.fn() }));
vi.mock('../AdminRouter.tsx', () => ({ AdminRouter: () => <div>admin-router</div> }));

import { connectAsAdmin } from '../../socket.js';
import { AdminShell } from '../AdminShell.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AdminShell', () => {
  it('shows login form when no session in localStorage', () => {
    render(<AdminShell />);
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });

  it('auto-connects and renders AdminRouter when valid session exists', () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'stored-token',
      expiresAt: Date.now() + 60_000,
    }));
    render(<AdminShell />);
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('stored-token');
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

  it('saves session and renders AdminRouter on successful login', () => {
    render(<AdminShell />);
    fireEvent.change(screen.getByPlaceholderText(/admin token/i), { target: { value: 'my-token' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('my-token');
    const stored = JSON.parse(localStorage.getItem('poke_admin_session')!);
    expect(stored.token).toBe('my-token');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
    expect(screen.getByText('admin-router')).toBeTruthy();
  });
});
