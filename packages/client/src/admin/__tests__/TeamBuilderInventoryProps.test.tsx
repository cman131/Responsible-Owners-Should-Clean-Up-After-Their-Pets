import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

vi.mock('../PokemonSlotEditor.js', () => ({
  PokemonSlotEditor: ({ value, onChange, inventory, leasedItems }: any) => (
    <div>
      <span>slot-editor</span>
      {inventory && <span>slot-inventory-{JSON.stringify(inventory)}</span>}
      {leasedItems && <span>slot-leased-{JSON.stringify(leasedItems)}</span>}
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { TeamBuilder } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('TeamBuilder inventory prop forwarding', () => {
  it('forwards inventory to PokemonSlotEditor', () => {
    render(
      <TeamBuilder
        onTeamSaved={vi.fn()}
        initialTeam={[pikachu]}
        inventory={{ 'choice-band': 2 }}
        leasedItems={{ 'choice-band': 1 }}
      />
    );
    expect(screen.getByText('slot-inventory-{"choice-band":2}')).toBeTruthy();
  });

  it('forwards leasedItems to PokemonSlotEditor', () => {
    render(
      <TeamBuilder
        onTeamSaved={vi.fn()}
        initialTeam={[pikachu]}
        inventory={{ 'choice-band': 2 }}
        leasedItems={{ 'choice-band': 1 }}
      />
    );
    expect(screen.getByText('slot-leased-{"choice-band":1}')).toBeTruthy();
  });

  it('does not pass inventory or leasedItems when they are not provided', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.queryByText(/slot-inventory-/)).toBeNull();
    expect(screen.queryByText(/slot-leased-/)).toBeNull();
  });
});
