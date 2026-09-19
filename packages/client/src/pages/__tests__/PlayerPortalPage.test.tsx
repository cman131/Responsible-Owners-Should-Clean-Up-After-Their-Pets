import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...(actual as object), useNavigate: () => mockNavigate };
});

let socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => mockSocket),
  connectAsPlayerPortal: vi.fn(),
}));

import { connectAsPlayerPortal } from '../../socket.js';

let capturedTeamInventory: Record<string, number> | undefined;
let capturedTeamLeasedItems: Record<string, number> | undefined;

vi.mock('../../player/PlayerTeamView.js', () => ({
  PlayerTeamView: ({ team, onBankMove, inventory, leasedItems }: any) => {
    capturedTeamInventory = inventory;
    capturedTeamLeasedItems = leasedItems;
    return (
      <div data-testid="player-team-view">
        {team.map((p: any, i: number) => (
          <div key={i}>
            <span>{p.nickname}</span>
            <button onClick={() => onBankMove(p, i)}>→ BANK {p.nickname}</button>
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('../../player/PlayerBankTab.js', () => ({
  PlayerBankTab: ({ bank, onMoveToParty }: any) => (
    <div data-testid="player-bank-tab">
      {bank.map((p: any, i: number) => (
        <div key={i}>
          <span>{p.nickname}</span>
          <button onClick={() => onMoveToParty(p, i)}>→ PARTY {p.nickname}</button>
        </div>
      ))}
    </div>
  ),
}));

import { PlayerPortalPage } from '../PlayerPortalPage.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

const mockProfile: PlayerProfile = {
  profileId: 'p1',
  displayName: 'Ash Ketchum',
  createdAt: '2024-01-01',
};

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

const mockProfileWithTeam: PlayerProfile = {
  profileId: 'p2',
  displayName: 'Red',
  createdAt: '2024-01-01',
  defaultTeam: {
    templateId: 'p2-team',
    name: "Red's Team",
    createdAt: '2024-01-01',
    pokemon: [pikachu],
  },
  bank: [],
};

const rosterWith = (players: Array<{ profileId: string; displayName: string }>) => {
  act(() => {
    socketHandlers['player:portal-roster']?.({ players });
  });
};

const selectPlayer = (displayName: string) => {
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: screen.getByRole('option', { name: displayName }).getAttribute('value') },
  });
};

describe('PlayerPortalPage', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    vi.mocked(connectAsPlayerPortal).mockClear();
    mockNavigate.mockClear();
    capturedTeamInventory = undefined;
    capturedTeamLeasedItems = undefined;
  });

  it('calls connectAsPlayerPortal and emits player:portal-roster-request on mount', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    expect(vi.mocked(connectAsPlayerPortal)).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-roster-request');
  });

  it('shows player dropdown and key input in entry phase after roster loads', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByPlaceholderText(/player key/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /enter/i })).toBeTruthy();
  });

  it('populates dropdown with player names from roster', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([
      { profileId: 'p1', displayName: 'Ash Ketchum' },
      { profileId: 'p2', displayName: 'Misty' },
    ]);
    expect(screen.getByRole('option', { name: /ash ketchum/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /misty/i })).toBeTruthy();
  });

  it('ENTER is disabled when no player is selected', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'somekey' } });
    expect(screen.getByRole('button', { name: /enter/i })).toHaveProperty('disabled', true);
  });

  it('ENTER is disabled when no key is entered', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    expect(screen.getByRole('button', { name: /enter/i })).toHaveProperty('disabled', true);
  });

  it('ENTER is enabled when player is selected and key is entered', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    expect(screen.getByRole('button', { name: /enter/i })).toHaveProperty('disabled', false);
  });

  it('emits player:portal-auth with profileId and playerKey on submit', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-auth', { profileId: 'p1', playerKey: 'my-key' });
  });

  it('shows loading state after submitting', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(screen.getByText(/authenticating/i)).toBeTruthy();
  });

  it('shows portal with displayName when player:portal-data fires', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByText(/ash ketchum/i)).toBeTruthy();
  });

  it('shows Team, Bank, and Inventory tab buttons in portal phase', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByRole('button', { name: /^team$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^bank$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^inventory$/i })).toBeTruthy();
  });

  it('shows back to lobby link in portal phase', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-data']?.({ profile: mockProfile });
    });
    expect(screen.getByText(/back to lobby/i)).toBeTruthy();
  });

  it('returns to entry phase with error message when player:portal-error fires during auth', () => {
    render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
    rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
    selectPlayer('Ash Ketchum');
    fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    act(() => {
      socketHandlers['player:portal-error']?.({ message: 'Invalid player key.' });
    });
    expect(screen.getByText(/invalid player key/i)).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  describe('portal save/discard', () => {
    function renderPortalWithTeam() {
      render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
      rosterWith([{ profileId: 'p2', displayName: 'Red' }]);
      selectPlayer('Red');
      fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'my-key' } });
      fireEvent.click(screen.getByRole('button', { name: /enter/i }));
      act(() => {
        socketHandlers['player:portal-data']?.({ profile: mockProfileWithTeam });
      });
      mockSocket.emit.mockClear();
    }

    it('shows SAVE CHANGES and DISCARD buttons in portal phase', () => {
      renderPortalWithTeam();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
    });

    it('emits player:portal-save with profileId, team, and bank when SAVE clicked', () => {
      renderPortalWithTeam();
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(mockSocket.emit).toHaveBeenCalledWith('player:portal-save', {
        profileId: 'p2',
        team: [pikachu],
        bank: [],
      });
    });

    it('shows inline save error when player:portal-error fires in portal phase', () => {
      renderPortalWithTeam();
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      act(() => {
        socketHandlers['player:portal-error']?.({ message: 'Only nicknames may be changed.' });
      });
      expect(screen.getByText(/only nicknames may be changed/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    });

    it('shows saved indicator after player:portal-data fires following a save', () => {
      renderPortalWithTeam();
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      act(() => {
        socketHandlers['player:portal-data']?.({ profile: mockProfileWithTeam });
      });
      expect(screen.getByText(/saved/i)).toBeTruthy();
    });

    it('DISCARD resets local team to original profile team', () => {
      renderPortalWithTeam();
      fireEvent.click(screen.getByRole('button', { name: /team/i }));
      fireEvent.click(screen.getByRole('button', { name: /→ bank pikachu/i }));
      fireEvent.click(screen.getByRole('button', { name: /discard/i }));
      expect(screen.getByTestId('player-team-view')).toBeTruthy();
      expect(mockSocket.emit).not.toHaveBeenCalledWith('player:portal-save', expect.anything());
    });
  });

  describe('inventory tab', () => {
    const mockProfileWithInventory: PlayerProfile = {
      profileId: 'p3',
      displayName: 'Misty',
      createdAt: '2024-01-01',
      defaultTeam: {
        templateId: 'p3-team',
        name: "Misty's Team",
        createdAt: '2024-01-01',
        pokemon: [pikachu],
      },
      bank: [],
      inventory: { leftovers: 2, 'focus-sash': 1 },
    };

    function enterPortalWithInventory() {
      render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
      rosterWith([{ profileId: 'p3', displayName: 'Misty' }]);
      selectPlayer('Misty');
      fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'key' } });
      fireEvent.click(screen.getByRole('button', { name: /enter/i }));
      act(() => { socketHandlers['player:portal-data']?.({ profile: mockProfileWithInventory }); });
    }

    it('shows item names and quantities when inventory tab is clicked', () => {
      enterPortalWithInventory();
      fireEvent.click(screen.getByRole('button', { name: /^inventory$/i }));
      expect(screen.getByText(/leftovers/i)).toBeTruthy();
      expect(screen.getByText(/focus-sash/i)).toBeTruthy();
    });

    it('shows empty message when profile has no inventory', () => {
      render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
      rosterWith([{ profileId: 'p1', displayName: 'Ash Ketchum' }]);
      selectPlayer('Ash Ketchum');
      fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'key' } });
      fireEvent.click(screen.getByRole('button', { name: /enter/i }));
      act(() => { socketHandlers['player:portal-data']?.({ profile: mockProfile }); });
      fireEvent.click(screen.getByRole('button', { name: /^inventory$/i }));
      expect(screen.getByText(/no items/i)).toBeTruthy();
    });

    it('passes inventory from profile to PlayerTeamView', () => {
      enterPortalWithInventory();
      expect(capturedTeamInventory).toEqual({ leftovers: 2, 'focus-sash': 1 });
    });

    it('passes leasedItems computed from held items to PlayerTeamView', () => {
      const profileWithItemsEquipped: PlayerProfile = {
        ...mockProfileWithInventory,
        defaultTeam: {
          templateId: 'p3-team',
          name: "Misty's Team",
          createdAt: '2024-01-01',
          pokemon: [{ ...pikachu, heldItem: 'leftovers' }],
        },
        bank: [],
      };
      render(<MemoryRouter><PlayerPortalPage /></MemoryRouter>);
      rosterWith([{ profileId: 'p3', displayName: 'Misty' }]);
      selectPlayer('Misty');
      fireEvent.change(screen.getByPlaceholderText(/player key/i), { target: { value: 'key' } });
      fireEvent.click(screen.getByRole('button', { name: /enter/i }));
      act(() => { socketHandlers['player:portal-data']?.({ profile: profileWithItemsEquipped }); });
      expect(capturedTeamLeasedItems).toEqual({ leftovers: 1 });
    });
  });
});
