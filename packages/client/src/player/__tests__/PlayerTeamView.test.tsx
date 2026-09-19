import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PokemonSet } from '@poke-fighter/shared';
import { PlayerTeamView } from '../PlayerTeamView.js';

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
});
