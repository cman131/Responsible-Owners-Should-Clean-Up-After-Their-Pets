import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn(), connectAsPlayer: vi.fn() }));
import { getSocket } from '../../socket.js';

vi.mock('../../battle/BattleScene.js', () => ({
  BattleScene: ({ state }: { state: unknown }) =>
    <div data-testid="battle-scene" data-state={JSON.stringify(state)} />,
}));

import { BattlePage } from '../BattlePage.js';
import type { BattleState, PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 6, speciesName: 'charizard', nickname: 'Charizard',
    level: 50, currentHp: 80, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

function makeState(): BattleState {
  return {
    battleId: 'b1', label: 'Battle 1', turnNumber: 1, phase: 'action',
    teams: [
      { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [makeMon({ instanceId: 'my-mon', speciesName: 'bulbasaur', currentHp: 180, maxHp: 210 })], activePokemonIndex: 0 }] },
      { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Charizard', isNpc: true, isSpectator: false, party: [makeMon({ instanceId: 'foe-mon', currentHp: 68, maxHp: 194 })], activePokemonIndex: 0 }] },
    ],
    field: { trickroom: 0, gravity: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ]},
    turnTimerSeconds: 60,
  };
}

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
  sessionStorage.setItem('mySlotId', 'a1');
});

function renderBattlePage(battleState: BattleState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/battle', state: { battleState } }]}>
      <BattlePage />
    </MemoryRouter>
  );
}

describe('BattlePage', () => {
  it('renders the BattleScene component', () => {
    renderBattlePage(makeState());
    expect(screen.getByTestId('battle-scene')).toBeTruthy();
  });

  it('renders enemy HP bar row with enemy slot name', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Charizard L50')).toBeTruthy();
  });

  it('renders own team HP bar row with own slot name highlighted', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Alice L50')).toBeTruthy();
    expect(screen.getByText('▶')).toBeTruthy();
  });

  it('shows move panel when action:request arrives for own slot', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    expect(onCall).toBeTruthy();
    act(() => {
      onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false }], legalTargets: ['b1'], canSwitch: false, switchTargets: [], canTerastallize: false, timerSeconds: 60 });
    });
    expect(screen.getByText('tackle')).toBeTruthy();
  });

  it('shows target dropdown when move has multiple legal targets', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    act(() => {
      onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false }], legalTargets: ['b1', 'b2'], canSwitch: false, switchTargets: [], canTerastallize: false, timerSeconds: 60 });
    });
    fireEvent.click(screen.getByText('tackle'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('shows waiting message when no action request is pending', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Waiting for others...')).toBeTruthy();
  });
});
