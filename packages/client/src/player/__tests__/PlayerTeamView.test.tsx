import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PokemonSet } from '@poke-fighter/shared';
import { PlayerTeamView } from '../PlayerTeamView.js';

vi.mock('../ItemEquipDropdown.js', () => ({
  ItemEquipDropdown: ({ onEquip, onClose }: { onEquip: (id: string) => void; onClose: () => void }) => (
    <div data-testid="item-equip-dropdown">
      <button onClick={() => onEquip('focus-sash')}>Pick Focus Sash</button>
      <button onClick={onClose}>Close Dropdown</button>
    </div>
  ),
}));

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

const charizard: PokemonSet = {
  speciesId: 6, nickname: 'Char', level: 55, ability: 'Blaze',
  moves: ['flamethrower', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'modest',
};

describe('PlayerTeamView', () => {
  let onTeamChange: ReturnType<typeof vi.fn>;
  let onBankMove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTeamChange = vi.fn();
    onBankMove = vi.fn();
  });

  it('renders each pokemon nickname and level', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    expect(screen.getByText('Pikachu')).toBeTruthy();
    expect(screen.getByText(/Lv\.50/)).toBeTruthy();
    expect(screen.getByText('Char')).toBeTruthy();
    expect(screen.getByText(/Lv\.55/)).toBeTruthy();
  });

  it('disables UP button for the first slot', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((upButtons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables DOWN button for the last slot', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    const downButtons = screen.getAllByRole('button', { name: /move down/i });
    expect((downButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((downButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onTeamChange with swapped slots when UP clicked', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    fireEvent.click(upButtons[1]!);
    expect(onTeamChange).toHaveBeenCalledWith([charizard, pikachu]);
  });

  it('calls onTeamChange with swapped slots when DOWN clicked', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    const downButtons = screen.getAllByRole('button', { name: /move down/i });
    fireEvent.click(downButtons[0]!);
    expect(onTeamChange).toHaveBeenCalledWith([charizard, pikachu]);
  });

  it('opens nickname modal when RENAME clicked', () => {
    render(
      <PlayerTeamView
        team={[pikachu]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Pikachu');
  });

  it('calls onTeamChange with updated nickname when modal saved', () => {
    render(
      <PlayerTeamView
        team={[pikachu]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sparky' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onTeamChange).toHaveBeenCalledWith([{ ...pikachu, nickname: 'Sparky' }]);
  });

  it('calls onBankMove with pokemon and index when → BANK clicked', () => {
    render(
      <PlayerTeamView
        team={[pikachu, charizard]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    const bankButtons = screen.getAllByRole('button', { name: /→ bank/i });
    fireEvent.click(bankButtons[0]!);
    expect(onBankMove).toHaveBeenCalledWith(pikachu, 0);
  });

  it('does not render EDIT or stat controls', () => {
    render(
      <PlayerTeamView
        team={[pikachu]}
        onTeamChange={onTeamChange}
        onBankMove={onBankMove}
      />
    );
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByText(/ability/i)).toBeNull();
    expect(screen.queryByText(/nature/i)).toBeNull();
  });

  describe('item equip/unequip', () => {
    const pikachuWithItem: PokemonSet = { ...pikachu, heldItem: 'focus-sash' };

    it('shows the held item id when pokemon has a heldItem', () => {
      render(
        <PlayerTeamView team={[pikachuWithItem]} onTeamChange={onTeamChange} onBankMove={onBankMove} />
      );
      expect(screen.getByText('focus-sash')).toBeTruthy();
    });

    it('shows UNEQUIP button when pokemon has a held item', () => {
      render(
        <PlayerTeamView team={[pikachuWithItem]} onTeamChange={onTeamChange} onBankMove={onBankMove} />
      );
      expect(screen.getByRole('button', { name: /unequip/i })).toBeTruthy();
    });

    it('calls onTeamChange without heldItem when UNEQUIP is clicked', () => {
      render(
        <PlayerTeamView team={[pikachuWithItem]} onTeamChange={onTeamChange} onBankMove={onBankMove} />
      );
      fireEvent.click(screen.getByRole('button', { name: /unequip/i }));
      const { heldItem: _removed, ...pikachuNoItem } = pikachuWithItem;
      expect(onTeamChange).toHaveBeenCalledWith([pikachuNoItem]);
    });

    it('does not show EQUIP button when inventory prop is not provided', () => {
      render(
        <PlayerTeamView team={[pikachu]} onTeamChange={onTeamChange} onBankMove={onBankMove} />
      );
      expect(screen.queryByRole('button', { name: /^equip$/i })).toBeNull();
    });

    it('shows EQUIP button when no heldItem and inventory prop is provided', () => {
      render(
        <PlayerTeamView
          team={[pikachu]}
          onTeamChange={onTeamChange}
          onBankMove={onBankMove}
          inventory={{}}
          leasedItems={{}}
        />
      );
      expect(screen.getByRole('button', { name: /^equip$/i })).toBeTruthy();
    });

    it('opens ItemEquipDropdown when EQUIP button is clicked', () => {
      render(
        <PlayerTeamView
          team={[pikachu]}
          onTeamChange={onTeamChange}
          onBankMove={onBankMove}
          inventory={{}}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^equip$/i }));
      expect(screen.getByTestId('item-equip-dropdown')).toBeTruthy();
    });

    it('calls onTeamChange with new heldItem when item is selected from dropdown', () => {
      render(
        <PlayerTeamView
          team={[pikachu]}
          onTeamChange={onTeamChange}
          onBankMove={onBankMove}
          inventory={{ 'focus-sash': 1 }}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^equip$/i }));
      fireEvent.click(screen.getByRole('button', { name: /pick focus sash/i }));
      expect(onTeamChange).toHaveBeenCalledWith([{ ...pikachu, heldItem: 'focus-sash' }]);
    });

    it('closes the dropdown without changes when Close Dropdown is clicked', () => {
      render(
        <PlayerTeamView
          team={[pikachu]}
          onTeamChange={onTeamChange}
          onBankMove={onBankMove}
          inventory={{}}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^equip$/i }));
      fireEvent.click(screen.getByRole('button', { name: /close dropdown/i }));
      expect(screen.queryByTestId('item-equip-dropdown')).toBeNull();
      expect(onTeamChange).not.toHaveBeenCalled();
    });
  });
});
