import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../PokemonSearchDropdown.js', () => ({
  PokemonSearchDropdown: ({ onSelect }: any) => (
    <button onClick={() => onSelect({
      id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'],
      baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
      abilities: { 0: 'Blaze', H: 'Solar Power' },
      baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3,
    })}>pick-charizard</button>
  ),
}));
vi.mock('../MoveSearchDropdown.js', () => ({
  MoveSearchDropdown: ({ onChange, value }: any) => (
    <button onClick={() => onChange('flamethrower')}>move-{value || 'empty'}</button>
  ),
}));

import { PokemonSlotEditor } from '../PokemonSlotEditor.js';

describe('PokemonSlotEditor', () => {
  it('renders the species search', () => {
    render(<PokemonSlotEditor value={{}} onChange={vi.fn()} />);
    expect(screen.getByText('pick-charizard')).toBeTruthy();
  });

  it('shows editing fields when value has speciesId', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByDisplayValue('Charizard')).toBeTruthy();
    expect(screen.getByDisplayValue('50')).toBeTruthy();
  });

  it('calls onChange with updated nickname', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    fireEvent.change(screen.getByDisplayValue('Charizard'), { target: { value: 'Firewing' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Firewing' }));
  });

  it('calls onChange with full defaults when a species is picked', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText('pick-charizard'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      speciesId: 6,
      nickname: 'Charizard',
      level: 50,
      nature: 'hardy',
    }));
  });
});
