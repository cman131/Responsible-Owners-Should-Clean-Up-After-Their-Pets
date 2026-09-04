import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../PokemonSlotEditor.js', () => ({
  PokemonSlotEditor: ({ onChange }: any) => (
    <button onClick={() => onChange({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['', '', '', ''], ability: 'Overgrow', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } })}>
      pick-bulbasaur
    </button>
  ),
}));

import { BankTab } from '../BankTab.js';
import type { PokemonSet } from '@poke-fighter/shared';

const charizard: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid',
  moves: ['', '', '', ''], ability: 'Blaze',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
};

beforeEach(() => { vi.clearAllMocks(); });

describe('BankTab', () => {
  it('renders empty state when bank is empty', () => {
    render(<BankTab bank={[]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    expect(screen.getByText(/no pokemon/i)).toBeTruthy();
  });

  it('renders a card for each bank pokemon', () => {
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    expect(screen.getByText('Charizard')).toBeTruthy();
  });

  it('shows popup actions when a card is clicked', () => {
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    expect(screen.getByText(/move to team/i)).toBeTruthy();
    expect(screen.getByText(/edit/i)).toBeTruthy();
    expect(screen.getByText(/remove/i)).toBeTruthy();
  });

  it('disables Move to Team when team is full', () => {
    render(<BankTab bank={[charizard]} teamSize={6} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    const btn = screen.getByText(/move to team/i).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onBankChange without the removed pokemon on Remove', () => {
    const onBankChange = vi.fn();
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    fireEvent.click(screen.getByText(/remove/i));
    expect(onBankChange).toHaveBeenCalledWith([]);
  });

  it('calls onMoveToTeam and removes from bank on Move to Team', () => {
    const onMoveToTeam = vi.fn();
    const onBankChange = vi.fn();
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={onMoveToTeam} />);
    fireEvent.click(screen.getByText('Charizard'));
    fireEvent.click(screen.getByText(/move to team/i));
    expect(onMoveToTeam).toHaveBeenCalledWith(charizard);
    expect(onBankChange).toHaveBeenCalledWith([]);
  });

  it('opens the add modal when + ADD TO BANK is clicked', () => {
    render(<BankTab bank={[]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText(/add to bank/i));
    expect(screen.getByText(/add to bank/i, { selector: '[data-modal-title]' })).toBeTruthy();
  });

  it('calls onBankChange with new pokemon when modal is saved', () => {
    const onBankChange = vi.fn();
    render(<BankTab bank={[]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText(/add to bank/i));
    fireEvent.click(screen.getByText('pick-bulbasaur'));
    fireEvent.click(screen.getByText(/^save$/i));
    expect(onBankChange).toHaveBeenCalledWith([expect.objectContaining({ speciesId: 1, nickname: 'Bulbasaur' })]);
  });
});
