import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
      onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false, targetType: 'normal', legalTargets: ['b1'] }], canSwitch: false, switchTargets: [], canTerastallize: false });
    });
    expect(screen.getByText('Tackle')).toBeTruthy();
  });

  it('shows target dropdown when move has multiple legal targets', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    act(() => {
      onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false, targetType: 'normal', legalTargets: ['b1', 'b2'] }], canSwitch: false, switchTargets: [], canTerastallize: false });
    });
    fireEvent.click(screen.getByText('Tackle'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('auto-submits self-targeting move without showing targeting UI', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    act(() => {
      onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'roost', pp: 10, disabled: false, targetType: 'self', legalTargets: ['a1'] }], canSwitch: false, switchTargets: [], canTerastallize: false });
    });
    fireEvent.click(screen.getByText('Roost'));
    expect(mockSocket.emit).toHaveBeenCalledWith('action:submit', expect.objectContaining({ action: expect.objectContaining({ type: 'move', targetSlotId: 'a1' }) }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Confirm')).toBeNull();
  });

  it('shows waiting message when no action request is pending', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Waiting for others...')).toBeTruthy();
  });

  it('shows MUST RECHARGE panel when action request has lockedReason recharge', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    act(() => {
      onCall![1]({
        slotId: 'a1',
        validMoves: [{ index: 0, moveId: 'hyperbeam', pp: 5, disabled: false, targetType: 'normal', legalTargets: ['b1'] }],
        canSwitch: false, switchTargets: [], canTerastallize: false,
        lockedReason: 'recharge',
      });
    });
    expect(screen.getByText('MUST RECHARGE')).toBeTruthy();
    expect(screen.queryByText('Hyperbeam')).toBeNull();
  });

  it('gates action panel behind turn:resolve playback queue', async () => {
    vi.useFakeTimers();
    renderBattlePage(makeState());

    const turnResolveCall = mockSocket.on.mock.calls.find((c) => c[0] === 'turn:resolve');
    const actionRequestCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    expect(turnResolveCall).toBeTruthy();
    expect(actionRequestCall).toBeTruthy();

    // Simulate turn:resolve with one move-used event (600ms delay)
    act(() => {
      turnResolveCall![1]({
        turnNumber: 2,
        events: [{ type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } }],
        state: makeState(),
      });
    });

    // action:request arrives right after (as it does on the server)
    act(() => {
      actionRequestCall![1]({
        slotId: 'a1',
        validMoves: [{ index: 0, moveId: 'watergun', pp: 25, disabled: false, targetType: 'normal', legalTargets: ['b1'] }],
        canSwitch: false, switchTargets: [], canTerastallize: false,
      });
    });

    // Move panel must NOT be visible — queue is still draining
    expect(screen.queryByText('Watergun')).toBeNull();

    // Advance past the 600ms delay
    await act(async () => { vi.advanceTimersByTime(700); });

    // Now the queue is empty → pending action released → move panel visible
    expect(screen.getByText('Watergun')).toBeTruthy();

    vi.useRealTimers();
  });

  it('passes displayHp from context to HpBarsRow so HP animates during playback', async () => {
    vi.useFakeTimers();
    renderBattlePage(makeState());
    // makeState has b1 slot with mon currentHp: 68, maxHp: 194

    const turnResolveCall = mockSocket.on.mock.calls.find((c) => c[0] === 'turn:resolve');

    const updatedState = makeState();
    // In the updated state, enemy hp is 0 (fainted) — but during playback displayHp should show 28
    updatedState.teams[1]!.slots[0]!.party[0]!.currentHp = 0;
    updatedState.teams[1]!.slots[0]!.party[0]!.fainted = true;

    act(() => {
      turnResolveCall![1]({
        turnNumber: 2,
        events: [
          { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 40, moveId: 'tackle', effectiveness: 1 } },
        ],
        state: updatedState,
      });
    });

    // Before timer fires, displayHp should show 68 - 0 = 68 (snapshot not yet decremented)
    // HP numbers for b1: initial state has 68 hp
    expect(screen.getByText('68/194')).toBeTruthy();

    // Advance past the 600ms damage entry
    await act(async () => { vi.advanceTimersByTime(700); });

    // After damage entry fires and queue empties: displayHp is cleared, so HP should show the actual game state (fainted)
    // The enemy Charizard should show FAINTED status, not the animated 28/194
    expect(screen.getByText('FAINTED')).toBeTruthy();
    expect(screen.queryByText('28/194')).toBeNull();

    vi.useRealTimers();
  });

  it('renders a Home button in the battle view', () => {
    renderBattlePage(makeState());
    expect(screen.getByRole('button', { name: /home/i })).toBeTruthy();
  });

  it('renders a Home button on the waiting screen when no initial state is provided', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/battle', state: null }]}>
        <BattlePage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /home/i })).toBeTruthy();
    expect(screen.getByText(/waiting for battle/i)).toBeTruthy();
  });

  it('clicking Home emits player:leave and clears sessionStorage.mySlotId', () => {
    sessionStorage.setItem('mySlotId', 'a1');
    renderBattlePage(makeState());
    fireEvent.click(screen.getByRole('button', { name: /home/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('player:leave');
    expect(sessionStorage.getItem('mySlotId')).toBeNull();
  });
});
