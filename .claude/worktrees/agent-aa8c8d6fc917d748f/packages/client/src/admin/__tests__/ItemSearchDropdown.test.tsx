import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { ItemSearchDropdown } from '../ItemSearchDropdown.js';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

const MOCK_ITEMS = [
  { id: 'leftovers', name: 'Leftovers', effectId: 'leftovers', isBerry: false },
  { id: 'sitrusberry', name: 'Sitrus Berry', effectId: 'sitrusberry', isBerry: true },
  { id: 'choiceband', name: 'Choice Band', effectId: 'choiceband', isBerry: false },
];

function fireItemResults() {
  const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
  act(() => { handler({ resource: 'items', results: MOCK_ITEMS }); });
}

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('ItemSearchDropdown', () => {
  it('emits data:query for items resource on mount', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'data:query',
      data: { resource: 'items' },
    });
  });

  it('shows all items in dropdown when input is focused after items load', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    fireItemResults();
    fireEvent.focus(screen.getByPlaceholderText('Search items...'));
    expect(screen.getByText('Leftovers')).toBeTruthy();
    expect(screen.getByText('Sitrus Berry')).toBeTruthy();
    expect(screen.getByText('Choice Band')).toBeTruthy();
  });

  it('filters dropdown list by query text', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    fireItemResults();
    fireEvent.change(screen.getByPlaceholderText('Search items...'), { target: { value: 'berry' } });
    expect(screen.getByText('Sitrus Berry')).toBeTruthy();
    expect(screen.queryByText('Leftovers')).toBeNull();
  });

  it('calls onChange with name-normalized id when an item is clicked', () => {
    const onChange = vi.fn();
    render(<ItemSearchDropdown value="" onChange={onChange} />);
    fireItemResults();
    fireEvent.focus(screen.getByPlaceholderText('Search items...'));
    fireEvent.click(screen.getByText('Leftovers'));
    expect(onChange).toHaveBeenCalledWith('leftovers'); // name.toLowerCase().replace(/\s+/g, '-')
  });

  it('calls onChange with hyphenated id for multi-word items', () => {
    const onChange = vi.fn();
    render(<ItemSearchDropdown value="" onChange={onChange} />);
    fireItemResults();
    fireEvent.focus(screen.getByPlaceholderText('Search items...'));
    fireEvent.click(screen.getByText('Choice Band'));
    expect(onChange).toHaveBeenCalledWith('choice-band'); // NOT 'choiceband'
  });

  it('shows selected item chip with name when value is set (hyphenated id lookup)', () => {
    render(<ItemSearchDropdown value="sitrus-berry" onChange={vi.fn()} />);
    fireItemResults();
    // Must find the item whose name normalises to 'sitrus-berry', then show "Sitrus Berry"
    expect(screen.getByText('Sitrus Berry')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search items...')).toBeNull();
  });

  it('shows Berry badge on berry items in the chip', () => {
    render(<ItemSearchDropdown value="sitrus-berry" onChange={vi.fn()} />);
    fireItemResults();
    expect(screen.getByText('Berry')).toBeTruthy();
  });

  it('calls onChange with empty string when clear button is clicked', () => {
    const onChange = vi.fn();
    render(<ItemSearchDropdown value="leftovers" onChange={onChange} />);
    fireItemResults();
    fireEvent.click(screen.getByText('✕'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows raw value as italic chip when value is set but items have not loaded', () => {
    render(<ItemSearchDropdown value="focus-sash" onChange={vi.fn()} />);
    // Items not loaded yet — selectedItem is null — should show fallback chip
    expect(screen.getByText('focus-sash')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search items...')).toBeNull();
  });

  it('cleans up the data:results listener on unmount', () => {
    const { unmount } = render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('data:results', expect.any(Function));
  });
});
