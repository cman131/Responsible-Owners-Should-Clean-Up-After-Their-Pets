import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

vi.mock('../PokemonSlotEditor.js', () => ({
  PokemonSlotEditor: ({ onChange, inventory, leasedItems }: any) => (
    <div>
      <button onClick={() => onChange({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['', '', '', ''], ability: 'Overgrow', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } })}>
        pick-bulbasaur
      </button>
      {inventory && <span>slot-inventory-{JSON.stringify(inventory)}</span>}
      {leasedItems && <span>slot-leased-{JSON.stringify(leasedItems)}</span>}
    </div>
  ),
}));

import { BankTab } from '../BankTab.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('BankTab inventory prop forwarding', () => {
  it('forwards inventory and leasedItems to PokemonSlotEditor in the add modal', () => {
    render(
      <BankTab
        bank={[]}
        teamSize={0}
        onBankChange={vi.fn()}
        onMoveToTeam={vi.fn()}
        inventory={{ 'leftovers': 2 }}
        leasedItems={{ 'leftovers': 1 }}
      />
    );
    fireEvent.click(screen.getByText('+ ADD TO BANK'));
    expect(screen.getByText('slot-inventory-{"leftovers":2}')).toBeTruthy();
    expect(screen.getByText('slot-leased-{"leftovers":1}')).toBeTruthy();
  });

  it('does not forward inventory when not provided', () => {
    render(
      <BankTab
        bank={[]}
        teamSize={0}
        onBankChange={vi.fn()}
        onMoveToTeam={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('+ ADD TO BANK'));
    expect(screen.queryByText(/slot-inventory-/)).toBeNull();
    expect(screen.queryByText(/slot-leased-/)).toBeNull();
  });
});
