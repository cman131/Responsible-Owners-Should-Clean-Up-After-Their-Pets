import { render, screen, fireEvent, act } from '@testing-library/react';
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
vi.mock('../ItemSearchDropdown.js', () => ({
  ItemSearchDropdown: ({ value, onChange, equippableOnly, availabilityMap }: any) => (
    <>
      <button onClick={() => onChange('leftovers')}>item-{value || 'none'}</button>
      <button onClick={() => onChange('')}>item-clear</button>
      {equippableOnly && <span>equippable-only</span>}
      {availabilityMap && <span>avail-map-{JSON.stringify(availabilityMap)}</span>}
    </>
  ),
}));

import { getSocket } from '../../socket.js';
import { PokemonSlotEditor } from '../PokemonSlotEditor.js';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

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

  it('auto-fetches species and shows displayName for pre-loaded speciesId', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 34, nickname: 'Sammy', level: 50, nature: 'hardy', moves: ['','','',''], ability: 'Poison Point', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} }}
      onChange={vi.fn()}
    />);

    expect(screen.getByText('Sammy')).toBeTruthy();
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'data:query',
      data: expect.objectContaining({ resource: 'pokemon', query: '34' }),
    }));

    const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
    act(() => {
      handler({ resource: 'pokemon', results: [{ id: 34, name: 'nidoking', displayName: 'Nidoking', types: ['Poison', 'Ground'], baseStats: {hp:81,atk:102,def:77,spa:85,spd:75,spe:85}, abilities: { 0: 'Poison Point' }, baseExpYield: 227, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3 }] });
    });

    expect(screen.getAllByText('Nidoking').length).toBeGreaterThan(0);
  });

  it('shows ability dropdown with all species abilities when species is loaded', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
    act(() => {
      handler({ resource: 'pokemon', results: [{ id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'], baseStats: { hp:78,atk:84,def:78,spa:109,spd:85,spe:100 }, abilities: { 0: 'Blaze', 1: 'Drought', H: 'Solar Power' }, baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3 }] });
    });
    const select = screen.getByDisplayValue('Blaze') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['Blaze', 'Drought', 'Solar Power']);
  });

  it('calls onChange with the new ability when a different ability is selected', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
    act(() => {
      handler({ resource: 'pokemon', results: [{ id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'], baseStats: { hp:78,atk:84,def:78,spa:109,spd:85,spe:100 }, abilities: { 0: 'Blaze', H: 'Solar Power' }, baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3 }] });
    });
    fireEvent.change(screen.getByDisplayValue('Blaze'), { target: { value: 'Solar Power' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ability: 'Solar Power' }));
  });

  it('shows ability as disabled select while currentSpecies is still loading', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    // Do NOT fire socket response — currentSpecies remains null
    const select = screen.getByDisplayValue('Blaze (loading…)') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  it('shows loading hint text in ability option while species is loading', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    // Do NOT fire socket response — currentSpecies remains null
    expect(screen.getByRole('option', { name: 'Blaze (loading…)' })).toBeTruthy();
  });

  it('passes equippableOnly: true to ItemSearchDropdown', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByText('equippable-only')).toBeTruthy();
  });

  it('renders item selector when speciesId is set', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByText('item-none')).toBeTruthy();
  });

  it('passes heldItem to ItemSearchDropdown as value', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', heldItem: 'leftovers', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByText('item-leftovers')).toBeTruthy();
  });

  it('calls onChange with heldItem set when item is selected', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    fireEvent.click(screen.getByText('item-none'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ heldItem: 'leftovers' }));
  });

  it('calls onChange with heldItem undefined when item is cleared', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', heldItem: 'leftovers', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    fireEvent.click(screen.getByText('item-clear'));
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.heldItem).toBeUndefined();
  });

  it('shows no-moves warning when speciesId is set but all moves are empty', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByText('⚠ No moves set')).toBeTruthy();
  });

  it('does not show no-moves warning when at least one move is set', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['flamethrower', '', '', ''], ability: 'Blaze', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.queryByText('⚠ No moves set')).toBeNull();
  });

  describe('EV/IV section', () => {
    const baseValue = {
      speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid',
      moves: ['', '', '', ''] as [string, string, string, string],
      ability: 'Blaze',
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    };

    it('renders EVs / IVs collapsible section when speciesId is set', () => {
      render(<PokemonSlotEditor value={baseValue} onChange={vi.fn()} />);
      expect(screen.getByText('EVs / IVs')).toBeTruthy();
    });

    it('shows HP EV input with current EV value', () => {
      render(<PokemonSlotEditor value={{ ...baseValue, evs: { hp: 84, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }} onChange={vi.fn()} />);
      expect((screen.getByRole('spinbutton', { name: 'HP EV' }) as HTMLInputElement).value).toBe('84');
    });

    it('shows HP IV input with current IV value', () => {
      render(<PokemonSlotEditor value={{ ...baseValue, ivs: { hp: 0, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }} onChange={vi.fn()} />);
      expect((screen.getByRole('spinbutton', { name: 'HP IV' }) as HTMLInputElement).value).toBe('0');
    });

    it('calls onChange with updated EV when HP EV input changes', () => {
      const onChange = vi.fn();
      render(<PokemonSlotEditor value={baseValue} onChange={onChange} />);
      fireEvent.change(screen.getByRole('spinbutton', { name: 'HP EV' }), { target: { value: '252' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        evs: expect.objectContaining({ hp: 252 }),
      }));
    });

    it('calls onChange with updated IV when ATK IV input changes', () => {
      const onChange = vi.fn();
      render(<PokemonSlotEditor value={baseValue} onChange={onChange} />);
      fireEvent.change(screen.getByRole('spinbutton', { name: 'ATK IV' }), { target: { value: '0' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        ivs: expect.objectContaining({ atk: 0 }),
      }));
    });

    it('displays EV total out of 508', () => {
      render(<PokemonSlotEditor value={{ ...baseValue, evs: { hp: 252, atk: 4, def: 0, spa: 252, spd: 0, spe: 0 } }} onChange={vi.fn()} />);
      expect(screen.getByText(/508\s*\/\s*508/)).toBeTruthy();
    });

    it('shows over-limit total when EVs exceed 508', () => {
      render(<PokemonSlotEditor value={{ ...baseValue, evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } }} onChange={vi.fn()} />);
      expect(screen.getByText(/756\s*\/\s*508/)).toBeTruthy();
    });
  });

  describe('Tera Type picker', () => {
    const baseValue = {
      speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid',
      moves: ['', '', '', ''] as [string, string, string, string],
      ability: 'Blaze',
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    };

    it('renders Tera type select when speciesId is set', () => {
      render(<PokemonSlotEditor value={baseValue} onChange={vi.fn()} />);
      expect(screen.getByRole('combobox', { name: /tera type/i })).toBeTruthy();
    });

    it('shows empty value when teraType is not set', () => {
      render(<PokemonSlotEditor value={baseValue} onChange={vi.fn()} />);
      expect((screen.getByRole('combobox', { name: /tera type/i }) as HTMLSelectElement).value).toBe('');
    });

    it('shows selected teraType in the dropdown', () => {
      render(<PokemonSlotEditor value={{ ...baseValue, teraType: 'Dragon' }} onChange={vi.fn()} />);
      expect((screen.getByRole('combobox', { name: /tera type/i }) as HTMLSelectElement).value).toBe('Dragon');
    });

    it('calls onChange with teraType when a type is selected', () => {
      const onChange = vi.fn();
      render(<PokemonSlotEditor value={baseValue} onChange={onChange} />);
      fireEvent.change(screen.getByRole('combobox', { name: /tera type/i }), { target: { value: 'Dragon' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ teraType: 'Dragon' }));
    });

    it('calls onChange without teraType property when selection is cleared', () => {
      const onChange = vi.fn();
      render(<PokemonSlotEditor value={{ ...baseValue, teraType: 'Fire' }} onChange={onChange} />);
      fireEvent.change(screen.getByRole('combobox', { name: /tera type/i }), { target: { value: '' } });
      const lastCall = onChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.teraType).toBeUndefined();
    });

    it('defaults teraType to primary species type when a new species is picked', () => {
      const onChange = vi.fn();
      render(<PokemonSlotEditor value={{}} onChange={onChange} />);
      fireEvent.click(screen.getByText('pick-charizard'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ teraType: 'Fire' }));
    });
  });

  describe('inventory/leasedItems availability forwarding', () => {
    const baseValue = {
      speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid',
      moves: ['', '', '', ''] as [string, string, string, string],
      ability: 'Blaze',
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    };

    it('passes computed availabilityMap to ItemSearchDropdown when inventory and leasedItems are provided', () => {
      render(
        <PokemonSlotEditor
          value={baseValue}
          onChange={vi.fn()}
          inventory={{ 'choice-band': 1 }}
          leasedItems={{ 'choice-band': 0 }}
        />
      );
      expect(screen.getByText(/avail-map-/)).toBeTruthy();
      expect(screen.getByText('avail-map-{"choice-band":1}')).toBeTruthy();
    });

    it('accounts for the current pokemon own held item when computing availability', () => {
      // Charizard holds choice-band; inventory=1, leasedItems=1 → available = 1 - 1 + 1 = 1 (own item not double-counted)
      render(
        <PokemonSlotEditor
          value={{ ...baseValue, heldItem: 'choice-band' }}
          onChange={vi.fn()}
          inventory={{ 'choice-band': 1 }}
          leasedItems={{ 'choice-band': 1 }}
        />
      );
      expect(screen.getByText('avail-map-{"choice-band":1}')).toBeTruthy();
    });

    it('does not pass availabilityMap when inventory is not provided', () => {
      render(<PokemonSlotEditor value={baseValue} onChange={vi.fn()} />);
      expect(screen.queryByText(/avail-map-/)).toBeNull();
    });
  });
});
