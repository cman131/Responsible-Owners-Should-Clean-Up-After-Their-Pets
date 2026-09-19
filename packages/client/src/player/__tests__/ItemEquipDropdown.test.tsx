import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { ItemEquipDropdown } from '../ItemEquipDropdown.js';
import type { HeldItem } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

const MOCK_ITEMS: HeldItem[] = [
  { id: 'focus-sash', name: 'Focus Sash', effectId: 'focus-sash', isBerry: false, equippable: true },
  { id: 'leftovers', name: 'Leftovers', effectId: 'leftovers', isBerry: false, equippable: true },
  { id: 'sitrus-berry', name: 'Sitrus Berry', effectId: 'sitrus-berry', isBerry: true, equippable: true },
];

function fireItemResults(items: HeldItem[] = MOCK_ITEMS) {
  const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'player:portal-items')?.[1];
  act(() => { handler({ results: items }); });
}

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('ItemEquipDropdown', () => {
  it('emits player:portal-items-query on mount', () => {
    render(
      <ItemEquipDropdown inventory={{}} leasedItems={{}} onEquip={vi.fn()} onClose={vi.fn()} />
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-items-query', {});
  });

  it('includes speciesName in the query when provided', () => {
    render(
      <ItemEquipDropdown
        speciesName="marowak"
        inventory={{}} leasedItems={{}} onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-items-query', { speciesName: 'marowak' });
  });

  it('shows items with positive availability in the list', () => {
    render(
      <ItemEquipDropdown
        inventory={{ 'focus-sash': 1, leftovers: 2 }}
        leasedItems={{}}
        onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    fireItemResults();
    expect(screen.getByText('Focus Sash')).toBeTruthy();
    expect(screen.getByText('Leftovers')).toBeTruthy();
  });

  it('hides items not in inventory (availability 0)', () => {
    render(
      <ItemEquipDropdown
        inventory={{}}
        leasedItems={{}}
        onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    fireItemResults();
    expect(screen.queryByText('Focus Sash')).toBeNull();
    expect(screen.queryByText('Leftovers')).toBeNull();
  });

  it('hides items that are fully leased out', () => {
    render(
      <ItemEquipDropdown
        inventory={{ leftovers: 1 }}
        leasedItems={{ leftovers: 1 }}
        onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    fireItemResults();
    expect(screen.queryByText('Leftovers')).toBeNull();
  });

  it('shows the currently held item even when fully leased (availability correction)', () => {
    render(
      <ItemEquipDropdown
        inventory={{ leftovers: 1 }}
        leasedItems={{ leftovers: 1 }}
        currentHeldItem="leftovers"
        onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    fireItemResults();
    expect(screen.getByText('Leftovers')).toBeTruthy();
  });

  it('filters the list by query text', () => {
    render(
      <ItemEquipDropdown
        inventory={{ 'focus-sash': 1, leftovers: 1 }}
        leasedItems={{}}
        onEquip={vi.fn()} onClose={vi.fn()}
      />
    );
    fireItemResults();
    fireEvent.change(screen.getByPlaceholderText(/search items/i), { target: { value: 'sash' } });
    expect(screen.getByText('Focus Sash')).toBeTruthy();
    expect(screen.queryByText('Leftovers')).toBeNull();
  });

  it('calls onEquip with normalized item id when item is clicked', () => {
    const onEquip = vi.fn();
    render(
      <ItemEquipDropdown
        inventory={{ 'focus-sash': 1 }}
        leasedItems={{}}
        onEquip={onEquip} onClose={vi.fn()}
      />
    );
    fireItemResults();
    fireEvent.click(screen.getByText('Focus Sash'));
    expect(onEquip).toHaveBeenCalledWith('focus-sash');
  });

  it('calls onEquip with hyphenated id for multi-word item names', () => {
    const onEquip = vi.fn();
    render(
      <ItemEquipDropdown
        inventory={{ 'sitrus-berry': 1 }}
        leasedItems={{}}
        onEquip={onEquip} onClose={vi.fn()}
      />
    );
    fireItemResults();
    fireEvent.click(screen.getByText('Sitrus Berry'));
    expect(onEquip).toHaveBeenCalledWith('sitrus-berry');
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <ItemEquipDropdown inventory={{}} leasedItems={{}} onEquip={vi.fn()} onClose={onClose} />
    );
    fireEvent.keyDown(screen.getByPlaceholderText(/search items/i), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('cleans up the player:portal-items listener on unmount', () => {
    const { unmount } = render(
      <ItemEquipDropdown inventory={{}} leasedItems={{}} onEquip={vi.fn()} onClose={vi.fn()} />
    );
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('player:portal-items', expect.any(Function));
  });
});
