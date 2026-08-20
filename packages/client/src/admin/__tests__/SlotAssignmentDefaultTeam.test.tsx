import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { SlotAssignmentStep } from '../steps/SlotAssignmentStep.js';
import type { PokemonSet } from '@poke-fighter/shared';

const staryu: PokemonSet = {
  speciesId: 120, nickname: 'Staryu', level: 30, nature: 'bold',
  moves: ['watergun', '', '', ''], ability: 'Illuminate',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
};

let registryHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'registry:data') registryHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  registryHandler = null;
  vi.clearAllMocks();
});

describe('SlotAssignmentStep — defaultTeam threading', () => {
  it('passes defaultTeam through onNext when a saved player with a team is selected', () => {
    const onNext = vi.fn();
    render(<SlotAssignmentStep teamASlots={1} teamBSlots={0} onNext={onNext} onBack={vi.fn()} />);

    act(() => {
      registryHandler?.({
        resource: 'players',
        data: [{
          profileId: 'p1',
          displayName: 'Misty',
          defaultTeam: { templateId: 't1', name: "Misty's Team", pokemon: [staryu], createdAt: '2026-01-01T00:00:00Z' },
          createdAt: '2026-01-01T00:00:00Z',
        }],
      });
    });

    const selects = screen.getAllByRole('combobox');
    const playerTypeSelect = selects[0]!;
    fireEvent.change(playerTypeSelect, { target: { value: 'player' } });

    const playerNameSelects = screen.getAllByRole('combobox');
    const playerNameSelect = playerNameSelects.find(
      (s: any) => Array.from((s as HTMLSelectElement).options).some((o: any) => o.text.includes('Misty'))
    )!;
    fireEvent.change(playerNameSelect, { target: { value: 'Misty' } });

    fireEvent.click(screen.getByText(/next/i));
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        teamA: expect.arrayContaining([
          expect.objectContaining({ displayName: 'Misty', defaultTeam: [staryu] }),
        ]),
      })
    );
  });
});
