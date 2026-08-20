import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { MoveSearchDropdown } from '../MoveSearchDropdown.js';
import type { Move } from '@poke-fighter/shared';

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

const flamethrower: Move = {
  id: 'flamethrower', name: 'Flamethrower', type: 'Fire', category: 'special',
  basePower: 90, accuracy: 100, pp: 15, priority: 0, target: 'normal', makesContact: false,
};
const icebeam: Move = {
  id: 'icebeam', name: 'Ice Beam', type: 'Ice', category: 'special',
  basePower: 90, accuracy: 100, pp: 10, priority: 0, target: 'normal', makesContact: false,
};

const defaultProps = {
  speciesId: 6,
  value: '',
  selectedMoves: ['', '', '', ''],
  onChange: vi.fn(),
};

describe('MoveSearchDropdown', () => {
  it('emits data:query for the species learnset on mount', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', speciesId: 6 }) })
    );
  });

  it('shows all learnset results when the input is focused', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.getByText('Ice Beam')).toBeTruthy();
  });

  it('filters learnset client-side without emitting to the server', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search moves/i), { target: { value: 'flame' } });
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.queryByText('Ice Beam')).toBeNull();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('marks moves already in selectedMoves as unselectable with "already picked" label', () => {
    render(<MoveSearchDropdown {...defaultProps} selectedMoves={['flamethrower', '', '', '']} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    expect(screen.getByText('already picked')).toBeTruthy();
  });

  it('calls onChange with move id when a result is clicked', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    fireEvent.click(screen.getByText('Flamethrower'));
    expect(onChange).toHaveBeenCalledWith('flamethrower');
  });

  it('shows selected-state summary row when value is non-empty and learnset loaded', () => {
    render(<MoveSearchDropdown {...defaultProps} value='flamethrower' />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search moves/i)).toBeNull();
  });

  it('clear button calls onChange with empty string', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} value='flamethrower' onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    fireEvent.click(screen.getByText('✕'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('emits server query in all-moves mode when 2+ chars typed', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [] }); });
    fireEvent.click(screen.getByRole('checkbox'));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search all moves/i), { target: { value: 'fl' } });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', query: 'fl' }) })
    );
  });

  it('does not emit in all-moves mode for fewer than 2 chars', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [] }); });
    fireEvent.click(screen.getByRole('checkbox'));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search all moves/i), { target: { value: 'f' } });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    const input = screen.getByPlaceholderText(/search moves/i);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('icebeam');
  });

  it('closes dropdown on Escape', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    const input = screen.getByPlaceholderText(/search moves/i);
    fireEvent.focus(input);
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Flamethrower')).toBeNull();
  });

  it('re-fetches learnset when speciesId prop changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MoveSearchDropdown {...defaultProps} onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    rerender(<MoveSearchDropdown {...defaultProps} onChange={onChange} speciesId={9} />);
    expect(mockSocket.emit).toHaveBeenLastCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', speciesId: 9 }) })
    );
    expect(onChange).toHaveBeenCalledWith('');
  });
});
