import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PokemonSet } from '@poke-fighter/shared';
import { PlayerBankTab } from '../PlayerBankTab.js';

vi.mock('../ItemEquipDropdown.js', () => ({
  ItemEquipDropdown: ({ onEquip, onClose }: { onEquip: (id: string) => void; onClose: () => void }) => (
    <div data-testid="item-equip-dropdown">
      <button onClick={() => onEquip('leftovers')}>Pick Leftovers</button>
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

const bulbasaur: PokemonSet = {
  speciesId: 1, nickname: 'Bulby', level: 40, ability: 'Overgrow',
  moves: ['tackle', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'bold',
};

describe('PlayerBankTab', () => {
  let onBankChange: ReturnType<typeof vi.fn>;
  let onMoveToParty: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onBankChange = vi.fn();
    onMoveToParty = vi.fn();
  });

  it('renders bank card for each pokemon with nickname and level', () => {
    render(
      <PlayerBankTab
        bank={[pikachu, bulbasaur]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    expect(screen.getByText('Pikachu')).toBeTruthy();
    expect(screen.getByText(/Lv\.50/)).toBeTruthy();
    expect(screen.getByText('Bulby')).toBeTruthy();
    expect(screen.getByText(/Lv\.40/)).toBeTruthy();
  });

  it('shows empty state when bank is empty', () => {
    render(
      <PlayerBankTab
        bank={[]}
        partySize={0}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    expect(screen.getByText(/no pokémon in bank/i)).toBeTruthy();
  });

  it('clicking a card opens popup with RENAME and → PARTY buttons', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    expect(screen.getByRole('button', { name: /rename/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /→ party/i })).toBeTruthy();
  });

  it('popup does not show EDIT or REMOVE buttons', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('→ PARTY button is disabled when party is full at 6', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={6}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    const partyBtn = screen.getByRole('button', { name: /→ party/i }) as HTMLButtonElement;
    expect(partyBtn.disabled).toBe(true);
  });

  it('calls onMoveToParty with pokemon and index when → PARTY clicked', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    fireEvent.click(screen.getByRole('button', { name: /→ party/i }));
    expect(onMoveToParty).toHaveBeenCalledWith(pikachu, 0);
  });

  it('RENAME in popup opens nickname modal pre-filled with current nickname', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Pikachu');
  });

  it('calls onBankChange with updated nickname when modal saved', () => {
    render(
      <PlayerBankTab
        bank={[pikachu]}
        partySize={2}
        onBankChange={onBankChange}
        onMoveToParty={onMoveToParty}
      />
    );
    fireEvent.click(screen.getByText('Pikachu'));
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sparky' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onBankChange).toHaveBeenCalledWith([{ ...pikachu, nickname: 'Sparky' }]);
  });

  describe('item equip/unequip in popup', () => {
    const pikachuWithItem: PokemonSet = { ...pikachu, heldItem: 'focus-sash' };

    it('shows the held item id in the popup when pokemon has a heldItem', () => {
      render(
        <PlayerBankTab bank={[pikachuWithItem]} partySize={0} onBankChange={onBankChange} onMoveToParty={onMoveToParty} />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      expect(screen.getByText('focus-sash')).toBeTruthy();
    });

    it('shows UNEQUIP button in popup when pokemon has a held item', () => {
      render(
        <PlayerBankTab bank={[pikachuWithItem]} partySize={0} onBankChange={onBankChange} onMoveToParty={onMoveToParty} />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      expect(screen.getByRole('button', { name: /unequip/i })).toBeTruthy();
    });

    it('calls onBankChange without heldItem when UNEQUIP is clicked in popup', () => {
      render(
        <PlayerBankTab bank={[pikachuWithItem]} partySize={0} onBankChange={onBankChange} onMoveToParty={onMoveToParty} />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      fireEvent.click(screen.getByRole('button', { name: /unequip/i }));
      const { heldItem: _removed, ...pikachuNoItem } = pikachuWithItem;
      expect(onBankChange).toHaveBeenCalledWith([pikachuNoItem]);
    });

    it('shows EQUIP button in popup when no heldItem and inventory prop is provided', () => {
      render(
        <PlayerBankTab
          bank={[pikachu]}
          partySize={0}
          onBankChange={onBankChange}
          onMoveToParty={onMoveToParty}
          inventory={{}}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      expect(screen.getByRole('button', { name: /^equip$/i })).toBeTruthy();
    });

    it('does not show EQUIP button in popup when inventory prop is not provided', () => {
      render(
        <PlayerBankTab bank={[pikachu]} partySize={0} onBankChange={onBankChange} onMoveToParty={onMoveToParty} />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      expect(screen.queryByRole('button', { name: /^equip$/i })).toBeNull();
    });

    it('opens ItemEquipDropdown when EQUIP is clicked in popup', () => {
      render(
        <PlayerBankTab
          bank={[pikachu]}
          partySize={0}
          onBankChange={onBankChange}
          onMoveToParty={onMoveToParty}
          inventory={{}}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      fireEvent.click(screen.getByRole('button', { name: /^equip$/i }));
      expect(screen.getByTestId('item-equip-dropdown')).toBeTruthy();
    });

    it('calls onBankChange with heldItem when item is selected from dropdown in popup', () => {
      render(
        <PlayerBankTab
          bank={[pikachu]}
          partySize={0}
          onBankChange={onBankChange}
          onMoveToParty={onMoveToParty}
          inventory={{ leftovers: 1 }}
          leasedItems={{}}
        />
      );
      fireEvent.click(screen.getByText('Pikachu'));
      fireEvent.click(screen.getByRole('button', { name: /^equip$/i }));
      fireEvent.click(screen.getByRole('button', { name: /pick leftovers/i }));
      expect(onBankChange).toHaveBeenCalledWith([{ ...pikachu, heldItem: 'leftovers' }]);
    });
  });
});
