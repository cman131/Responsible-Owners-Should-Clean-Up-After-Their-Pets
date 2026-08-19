import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LobbyPage } from '../pages/LobbyPage.js';

// Mock socket module
vi.mock('../socket.js', () => ({
  connectAsPlayer: vi.fn(),
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

describe('LobbyPage', () => {
  it('renders the login form', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/enter your name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /join/i })).toBeTruthy();
  });

  it('disables submit for empty name', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    const button = screen.getByRole('button', { name: /join/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables submit when name is typed', async () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/enter your name/i), { target: { value: 'Ash' } });
    const button = screen.getByRole('button', { name: /join/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
