import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { TeamBuilder } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const pikachu: PokemonSet = {
  speciesId: 25,
  nickname: 'Pikachu',
  level: 50,
  ability: 'Static',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('TeamBuilder nature field', () => {
  it('renders nature as a select/combobox, not a text input', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('has all 25 natures as options', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.options.length).toBe(25);
  });

  it('labels non-neutral natures with stat shorthand', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByText('Adamant (+Atk / -SpA)')).toBeTruthy();
  });

  it('labels neutral natures with (neutral)', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByText('Hardy (neutral)')).toBeTruthy();
  });

  it('pre-selects the current nature value', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('timid');
  });
});
