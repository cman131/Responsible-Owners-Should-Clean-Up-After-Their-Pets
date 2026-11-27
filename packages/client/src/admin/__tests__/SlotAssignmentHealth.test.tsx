import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const handlers: Record<string, (p: any) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (p: any) => void) => { handlers[event] = handler; }),
  off: vi.fn(),
};
vi.mock('../../socket.js', () => ({ getSocket: vi.fn(() => mockSocket) }));

import { SlotAssignmentStep } from '../steps/SlotAssignmentStep.js';

describe('SlotAssignmentStep health', () => {
  it('requests health, blocks Next for a fainted team and unblocks after a heal', () => {
    render(<SlotAssignmentStep teamASlots={1} teamBSlots={0} onNext={vi.fn()} onBack={vi.fn()} />);
    act(() => handlers['registry:data']!({
      resource: 'players',
      data: [{ profileId: 'p1', displayName: 'Misty', defaultTeam: { pokemon: [{ pokemonId: 'a' }] } }],
    }));
    const nameSelect = screen.getAllByRole('combobox').find(
      (s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text.includes('Misty'))
    )!;
    fireEvent.change(nameSelect, { target: { value: 'Misty' } });
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', { type: 'registry:player-health', data: { profileId: 'p1' } });

    const health = (currentHp: number) => ({
      profileId: 'p1', inBattle: false, pokemon: [{ pokemonId: 'a', currentHp, maxHp: 100, moves: [] }],
    });
    const next = () => screen.getByRole('button', { name: /next/i }) as HTMLButtonElement;

    act(() => handlers['player:health']!(health(0)));
    expect(screen.getByText(/no usable pokémon/i)).toBeTruthy();
    expect(next().disabled).toBe(true);

    act(() => handlers['player:health']!(health(100)));
    expect(screen.queryByText(/no usable pokémon/i)).toBeNull();
    expect(next().disabled).toBe(false);
  });
});
