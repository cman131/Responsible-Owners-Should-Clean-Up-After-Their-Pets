import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

vi.mock('../../components/QrCodeModal.js', () => ({
  QrCodeModal: ({ url, onClose }: { url: string; onClose: () => void }) => (
    <div data-testid="qr-modal" data-url={url}>
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));
import { getSocket } from '../../socket.js';

vi.mock('../../battle/BattleScene.js', () => ({
  BattleScene: () => <div data-testid="battle-scene" />,
}));
vi.mock('../NpcTabPanel.js', () => ({
  NpcTabPanel: ({ npcRequests }: { npcRequests: unknown[] }) =>
    <div data-testid="npc-tab-panel" data-count={npcRequests.length} />,
}));
vi.mock('../../battle/overlays/TurnLog.js', () => ({
  TurnLog: () => <div data-testid="turn-log" />,
}));
vi.mock('../../battle/overlays/HpBarsRow.js', () => ({
  HpBarsRow: ({ label }: { label: string }) =>
    <div data-testid={`hp-bars-${label.toLowerCase().replace(/ /g, '-')}`} />,
}));
vi.mock('../../battle/overlays/BattleResultPanel.js', () => ({
  BattleResultPanel: ({ winningTeamId, onGoHome }: { winningTeamId: string; onGoHome: () => void }) => (
    <div data-testid="battle-result-panel" data-winner={winningTeamId}>
      <button onClick={onGoHome}>Return</button>
    </div>
  ),
}));

import { ControlPanel } from '../ControlPanel.js';
import type { BattleState, PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 1, speciesName: 'bulbasaur', nickname: 'Bulbasaur',
    level: 50, currentHp: 100, maxHp: 200,
    stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'overgrow',
    moves: [
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'growl', currentPp: 40, maxPp: 40 },
      { moveId: 'vinewhip', currentPp: 25, maxPp: 25 },
      { moveId: 'leechseed', currentPp: 10, maxPp: 10 },
    ],
    volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0, growthRate: 'MediumFast',
    ...overrides,
  };
}

function makeState(): BattleState {
  return {
    battleId: 'b1', label: 'Battle 1', turnNumber: 3, phase: 'action',
    teams: [
      { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [makeMon()], activePokemonIndex: 0 }] },
      { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Blastoise', isNpc: true, isSpectator: false, party: [makeMon({ speciesName: 'blastoise' })], activePokemonIndex: 0 }] },
    ],
    field: { trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
    ]},
  };
}

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.mocked(mockSocket.on).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('ControlPanel', () => {
  it('renders the back button', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('← BATTLES')).toBeTruthy();
  });

  it('renders ADMIN VIEW badge', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('ADMIN VIEW')).toBeTruthy();
  });

  it('renders forfeit buttons', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('FORFEIT TEAM A')).toBeTruthy();
    expect(screen.getByText('FORFEIT TEAM B')).toBeTruthy();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<ControlPanel battleId="b1" onBack={onBack} />);
    fireEvent.click(screen.getByText('← BATTLES'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders HP bars and BattleScene when state:sync arrives', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const stateCall = mockSocket.on.mock.calls.find((c) => c[0] === 'state:sync');
    act(() => { stateCall![1](makeState()); });
    expect(screen.getByTestId('hp-bars-team-b')).toBeTruthy();
    expect(screen.getByTestId('hp-bars-team-a')).toBeTruthy();
    expect(screen.getByTestId('battle-scene')).toBeTruthy();
  });

  it('shows placeholder when no NPC requests are pending', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('No pending NPC actions')).toBeTruthy();
  });

  it('shows NpcTabPanel when NPC requests arrive', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const npcCall = mockSocket.on.mock.calls.find((c) => c[0] === 'npc:action-request');
    act(() => {
      npcCall![1]({
        battleId: 'b1',
        slots: [{ slotId: 'b1', displayName: 'Blastoise', request: { slotId: 'b1', validMoves: [], canSwitch: false, switchTargets: [], canTerastallize: false } }],
      });
    });
    expect(screen.getByTestId('npc-tab-panel')).toBeTruthy();
    expect(screen.queryByText('No pending NPC actions')).toBeNull();
  });

  it('emits forfeit action when forfeit button is clicked and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('FORFEIT TEAM A'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'forfeit',
      data: { battleId: 'b1', teamId: 'team-a' },
    });
    vi.restoreAllMocks();
  });

  it('shows disconnect indicator when lobby:slot-status arrives with a disconnected slot', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
    act(() => {
      slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
    });
    expect(screen.getByText(/Alice disconnected/)).toBeTruthy();
  });

  it('does not show disconnect indicator when all slots are joined', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
    act(() => {
      slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: true }] });
    });
    expect(screen.queryByText(/Alice disconnected/)).toBeNull();
  });

  it('ignores lobby:slot-status for a different battleId', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
    act(() => {
      slotStatusCall![1]({ battleId: 'OTHER', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
    });
    expect(screen.queryByText(/Alice disconnected/)).toBeNull();
  });

  it('emits forfeit action for team-b when forfeit team b button is clicked and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('FORFEIT TEAM B'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'forfeit',
      data: { battleId: 'b1', teamId: 'team-b' },
    });
    vi.restoreAllMocks();
  });

  it('shows BattleResultPanel when battle:end arrives', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const battleEndCall = mockSocket.on.mock.calls.find((c) => c[0] === 'battle:end');
    act(() => {
      battleEndCall![1]({ winningTeamId: 'team-a', state: makeState() });
    });
    expect(screen.getByTestId('battle-result-panel')).toBeTruthy();
    expect(screen.queryByText('No pending NPC actions')).toBeNull();
  });

  it('calls onBack when Return is clicked in BattleResultPanel', () => {
    const onBack = vi.fn();
    render(<ControlPanel battleId="b1" onBack={onBack} />);
    const battleEndCall = mockSocket.on.mock.calls.find((c) => c[0] === 'battle:end');
    act(() => {
      battleEndCall![1]({ winningTeamId: 'team-a', state: makeState() });
    });
    fireEvent.click(screen.getByRole('button', { name: /return/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows a SUBMIT ACTION button for each disconnected slot', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
    act(() => {
      slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
    });
    expect(screen.getByRole('button', { name: /submit action/i })).toBeTruthy();
  });

  it('emits submit-default-action when SUBMIT ACTION is clicked', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
    act(() => {
      slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
    });
    fireEvent.click(screen.getByRole('button', { name: /submit action/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'submit-default-action',
      data: { battleId: 'b1', slotId: 'a1' },
    });
  });

  it('header bar is fluid with max-width 800', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const header = screen.getByTestId('battle-header-bar');
    expect(header.style.width).toBe('100%');
    expect(header.style.maxWidth).toBe('800px');
  });

  it('action-log wrapper is fluid with flex-wrap and max-width 800', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const wrapper = screen.getByTestId('action-log-wrapper');
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.maxWidth).toBe('800px');
    expect(wrapper.style.flexWrap).toBe('wrap');
  });

  it('renders a Join QR button', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /join qr/i })).toBeTruthy();
  });

  it('opens QR modal when Join QR button is clicked', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /join qr/i }));
    expect(screen.getByTestId('qr-modal')).toBeTruthy();
  });

  it('QR modal URL contains the battleId', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /join qr/i }));
    expect(screen.getByTestId('qr-modal').getAttribute('data-url')).toContain('battleId=b1');
  });

  it('closes QR modal when modal close is triggered', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /join qr/i }));
    fireEvent.click(screen.getByRole('button', { name: 'close-modal' }));
    expect(screen.queryByTestId('qr-modal')).toBeNull();
  });
});
