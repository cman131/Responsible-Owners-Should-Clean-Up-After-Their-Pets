import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers: Record<string, (p: any) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (p: any) => void) => { handlers[event] = handler; }),
  off: vi.fn(),
};
vi.mock('../../socket.js', () => ({ getSocket: vi.fn(() => mockSocket) }));

import { HealthTab } from '../HealthTab.js';
import type { PokemonSet } from '@poke-fighter/shared';

const make = (nickname: string, pokemonId?: string): PokemonSet => ({
  ...(pokemonId ? { pokemonId } : {}),
  speciesId: 25, nickname, level: 50, ability: 'static', nature: 'timid',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
});

const payload = (inBattle = false) => ({
  profileId: 'p1', inBattle,
  pokemon: [
    { pokemonId: 'a', currentHp: 0, maxHp: 100, moves: [{ moveId: 'thunderbolt', currentPp: 3, maxPp: 15 }] },
    { pokemonId: 'b', currentHp: 60, maxHp: 100, status: 'brn', moves: [] },
  ],
});

function renderTab() {
  render(<HealthTab profileId="p1" team={[make('Sparky', 'a'), make('Newbie')]} bank={[make('Banked', 'b')]} />);
}
const row = (name: string) => within(screen.getByTestId(`health-row-${name}`));

beforeEach(() => { vi.clearAllMocks(); });

describe('HealthTab', () => {
  it('requests health and shows HP, status and PP', () => {
    renderTab();
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', { type: 'registry:player-health', data: { profileId: 'p1' } });
    act(() => handlers['player:health']!(payload()));
    expect(row('Sparky').getByText('FAINTED')).toBeTruthy();
    expect(row('Sparky').getByText('thunderbolt 3/15')).toBeTruthy();
    expect(row('Banked').getByText('60/100 HP')).toBeTruthy();
    expect(row('Banked').getByText('BURNED')).toBeTruthy();
    expect(row('Newbie').getByText(/no health data/i)).toBeTruthy();
  });

  it('heals one Pokémon or all', () => {
    renderTab();
    act(() => handlers['player:health']!(payload()));
    fireEvent.click(row('Sparky').getByRole('button', { name: 'HEAL' }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', { type: 'registry:heal-player', data: { profileId: 'p1', pokemonId: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'HEAL ALL' }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', { type: 'registry:heal-player', data: { profileId: 'p1' } });
  });

  it('disables healing during a battle and ignores other players', () => {
    renderTab();
    act(() => handlers['player:health']!(payload(true)));
    act(() => handlers['player:health']!({ profileId: 'p2', inBattle: false, pokemon: [] }));
    expect(screen.getByText(/in battle/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'HEAL ALL' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows heal errors', () => {
    renderTab();
    act(() => handlers['registry:error']!({ type: 'registry:heal-player', message: 'Ash is in a battle.' }));
    expect(screen.getByText('Ash is in a battle.')).toBeTruthy();
  });
});
