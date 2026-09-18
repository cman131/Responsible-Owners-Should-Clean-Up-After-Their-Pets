import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { TeamBuilder, slotStatus } from '../TeamBuilder.js';
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

const charizard: PokemonSet = {
  speciesId: 6,
  nickname: 'Charizard',
  level: 50,
  ability: 'Blaze',
  moves: ['flamethrower', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('slotStatus', () => {
  it('returns empty for undefined', () => {
    expect(slotStatus(undefined)).toBe('empty');
  });
  it('returns empty for slot with no speciesId', () => {
    expect(slotStatus({})).toBe('empty');
  });
  it('returns incomplete for slot with speciesId but no moves array', () => {
    expect(slotStatus({ speciesId: 6 })).toBe('incomplete');
  });
  it('returns incomplete for slot with speciesId and all-empty moves', () => {
    expect(slotStatus({ speciesId: 6, moves: ['', '', '', ''] })).toBe('incomplete');
  });
  it('returns complete for slot with speciesId and at least one non-empty move', () => {
    expect(slotStatus({ speciesId: 6, moves: ['flamethrower', '', '', ''] })).toBe('complete');
  });
});

describe('TeamBuilder tab strip', () => {
  it('shows only + Add tab when no initialTeam provided', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} />);
    expect(screen.getByText('+ Add')).toBeTruthy();
    expect(screen.queryByText('Slot 2')).toBeNull();
    expect(screen.queryByText('Slot 3')).toBeNull();
  });

  it('shows filled tab and + Add for a single-pokemon team', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.some(b => b.textContent === 'Pikachu')).toBe(true);
    expect(screen.getByText('+ Add')).toBeTruthy();
    expect(screen.queryByText('Slot 3')).toBeNull();
  });
});

describe('TeamBuilder nature field', () => {
  it('renders nature as a select/combobox, not a text input', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('has all 25 natures as options', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const natureSelect = selects.find((s) => s.options.length === 25)!;
    expect(natureSelect).toBeTruthy();
    expect(natureSelect.options.length).toBe(25);
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
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const natureSelect = selects.find((s) => s.options.length === 25)!;
    expect(natureSelect.value).toBe('timid');
  });
});

describe('TeamBuilder initialSelectedSlot', () => {
  it('starts on the specified slot when initialSelectedSlot is provided', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} initialSelectedSlot={1} />);
    expect(screen.getByDisplayValue('Charizard')).toBeTruthy();
  });
});

describe('TeamBuilder slot compaction', () => {
  it('collapses the gap when a slot is cleared from a multi-pokemon team', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
    fireEvent.click(screen.getByText('✕ CLEAR'));
    expect(screen.queryByText('Slot 1')).toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons.some(b => b.textContent === 'Charizard')).toBe(true);
    expect(screen.getByText('+ Add')).toBeTruthy();
  });
});

describe('TeamBuilder slot reorder', () => {
  it('swaps slots when down arrow on first slot is clicked', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
    fireEvent.click(screen.getByLabelText('Move slot 1 down'));
    const tabButtons = screen.getAllByRole('button').filter(
      (b) => b.textContent === 'Pikachu' || b.textContent === 'Charizard'
    );
    expect(tabButtons[0]?.textContent).toBe('Charizard');
    expect(tabButtons[1]?.textContent).toBe('Pikachu');
  });

  it('up arrow on the first slot is disabled', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
    const upButton = screen.getByLabelText('Move slot 1 up') as HTMLButtonElement;
    expect(upButton.disabled).toBe(true);
  });

  it('down arrow on the last filled slot is disabled', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
    const downButton = screen.getByLabelText('Move slot 2 down') as HTMLButtonElement;
    expect(downButton.disabled).toBe(true);
  });
});
