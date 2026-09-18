// packages/client/src/admin/__tests__/PokemonSearchDropdown.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { PokemonSearchDropdown } from '../PokemonSearchDropdown.js';
import type { PokemonSpecies } from '@poke-fighter/shared';

let dataResultsHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'data:results') dataResultsHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  dataResultsHandler = null;
  vi.clearAllMocks();
});

const psyduck: PokemonSpecies = {
  id: 54, name: 'psyduck', displayName: 'Psyduck', types: ['Water'],
  baseStats: { hp: 50, atk: 52, def: 48, spa: 65, spd: 50, spe: 55 },
  abilities: { 0: 'Damp', 1: 'Cloud Nine', H: 'Swift Swim' },
  baseExpYield: 64, expGrowth: 'MediumFast', learnset: [], evolutionStage: 1,
};
const golduck: PokemonSpecies = { ...psyduck, id: 55, name: 'golduck', displayName: 'Golduck' };

describe('PokemonSearchDropdown', () => {
  it('emits data:query when 2+ characters are typed after debounce fires', () => {
    vi.useFakeTimers();
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { vi.advanceTimersByTime(150); });
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ type: 'data:query' }));
    vi.useRealTimers();
  });

  it('does not emit for empty input even after debounce fires', () => {
    vi.useFakeTimers();
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(150); });
    expect(mockSocket.emit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('emits data:query after typing a single character once debounce fires', () => {
    vi.useFakeTimers();
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'p' } });
    expect(mockSocket.emit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(150); });
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ type: 'data:query' }));
    vi.useRealTimers();
  });

  it('does not emit immediately before debounce delay elapses', () => {
    vi.useFakeTimers();
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { vi.advanceTimersByTime(100); });
    expect(mockSocket.emit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows results from data:results event', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    expect(screen.getByText('Psyduck')).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
  });

  it('calls onSelect and clears input when a result is clicked', () => {
    const onSelect = vi.fn();
    render(<PokemonSearchDropdown onSelect={onSelect} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    fireEvent.click(screen.getByText('Psyduck'));
    expect(onSelect).toHaveBeenCalledWith(psyduck);
    expect(screen.queryByText('Psyduck')).toBeNull();
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onSelect = vi.fn();
    render(<PokemonSearchDropdown onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck, golduck] }); });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(golduck);
  });

  it('closes dropdown on Escape', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Psyduck')).toBeNull();
  });
});
