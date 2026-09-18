import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { NpcTabPanel } from '../NpcTabPanel.js';
import type { BattleState, ActionRequestPayload, PartyMember } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn() };
beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const makeRequest = (slotId: string, legalTargets: string[]): ActionRequestPayload => ({
  slotId,
  validMoves: [
    { index: 0, moveId: 'surf', type: 'Water', pp: 15, disabled: false, targetType: 'normal', legalTargets },
    { index: 1, moveId: 'icebeam', type: 'Ice', pp: 10, disabled: false, targetType: 'normal', legalTargets },
    { index: 2, moveId: 'blizzard', type: 'Ice', pp: 5, disabled: false, targetType: 'allAdjacentFoes', legalTargets },
    { index: 3, moveId: 'flash', type: 'Normal', pp: 20, disabled: false, targetType: 'normal', legalTargets },
  ],
  canSwitch: false,
  switchTargets: [],
  canTerastallize: false,
});

const npcRequests = [
  { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1']) },
  { slotId: 'b2', displayName: 'Snorlax', request: makeRequest('b2', ['a1']) },
];

const state: BattleState = {
  battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
  teams: [
    { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [{ instanceId: 'p1', speciesId: 25, speciesName: 'pikachu', nickname: 'Pikachu', level: 50, currentHp: 134, maxHp: 150, stats: { hp: 150, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'static', moves: [{ moveId: 'thunderbolt', currentPp: 15, maxPp: 15 }, { moveId: 'quickattack', currentPp: 30, maxPp: 30 }, { moveId: 'ironjaw', currentPp: 15, maxPp: 15 }, { moveId: 'charm', currentPp: 20, maxPp: 20 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 }] },
    { teamId: 'team-b', slots: [
      { slotId: 'b1', displayName: 'Blastoise', isNpc: true, isSpectator: false, party: [{ instanceId: 'p2', speciesId: 9, speciesName: 'blastoise', nickname: 'Blastoise', level: 52, currentHp: 160, maxHp: 200, stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'torrent', moves: [{ moveId: 'surf', currentPp: 15, maxPp: 15 }, { moveId: 'icebeam', currentPp: 10, maxPp: 10 }, { moveId: 'blizzard', currentPp: 5, maxPp: 5 }, { moveId: 'flash', currentPp: 20, maxPp: 20 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 },
      { slotId: 'b2', displayName: 'Snorlax', isNpc: true, isSpectator: false, party: [{ instanceId: 'p3', speciesId: 143, speciesName: 'snorlax', nickname: 'Snorlax', level: 50, currentHp: 300, maxHp: 400, stats: { hp: 400, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'immunity', moves: [{ moveId: 'bodyslam', currentPp: 15, maxPp: 15 }, { moveId: 'earthquake', currentPp: 10, maxPp: 10 }, { moveId: 'crunch', currentPp: 15, maxPp: 15 }, { moveId: 'rest', currentPp: 10, maxPp: 10 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 },
    ]},
  ],
  field: { trickroom: 0, gravity: 0, sideConditions: [
    { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
  ]},
};

describe('NpcTabPanel', () => {
  it('renders one tab per NPC request', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    expect(screen.getByText('Blastoise')).toBeTruthy();
    expect(screen.getByText('Snorlax')).toBeTruthy();
  });

  it('shows move buttons for the active tab', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    expect(screen.getByText('Surf')).toBeTruthy();
    expect(screen.getByText('Icebeam')).toBeTruthy();
  });

  it('emits npc-action and marks tab as submitted on single-target move click', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    fireEvent.click(screen.getByText('Surf'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'npc-action',
      data: { battleId: 'test', slotId: 'b1', action: { type: 'move', moveIndex: 0, targetSlotId: 'a1' } },
    });
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('shows target buttons for multi-target moves', () => {
    const multiTargetRequests = [
      { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1', 'a2']) },
    ];
    render(<NpcTabPanel battleId="test" npcRequests={multiTargetRequests} state={state} />);
    fireEvent.click(screen.getByText('Surf'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy();
    expect(screen.queryByText('Blastoise ✓')).toBeFalsy(); // not yet submitted
  });

  it('submits after clicking a target button', () => {
    const multiTargetRequests = [
      { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1', 'a2']) },
    ];
    render(<NpcTabPanel battleId="test" npcRequests={multiTargetRequests} state={state} />);
    fireEvent.click(screen.getByText('Surf'));
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'npc-action',
      data: expect.objectContaining({ slotId: 'b1', action: expect.objectContaining({ type: 'move', moveIndex: 0 }) }),
    }));
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('returns null when npcRequests is empty', () => {
    const { container } = render(<NpcTabPanel battleId="test" npcRequests={[]} state={state} />);
    expect(container.firstChild).toBeNull();
  });

  it('includes terastallize:true in emitted action when Tera checkbox is checked', () => {
    const teraRequest: ActionRequestPayload = { ...makeRequest('b1', ['a1']), canTerastallize: true };
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: teraRequest }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={state} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Surf'));

    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'npc-action',
      data: { battleId: 'test', slotId: 'b1', action: { type: 'move', moveIndex: 0, targetSlotId: 'a1', terastallize: true } },
    });
  });
});

const makeSwitchableRequest = (slotId: string, legalTargets: string[], switchTargets: string[]): ActionRequestPayload => ({
  slotId,
  validMoves: [
    { index: 0, moveId: 'surf', type: 'Water', pp: 15, disabled: false, targetType: 'normal', legalTargets },
    { index: 1, moveId: 'icebeam', type: 'Ice', pp: 10, disabled: false, targetType: 'normal', legalTargets },
    { index: 2, moveId: 'blizzard', type: 'Ice', pp: 5, disabled: false, targetType: 'allAdjacentFoes', legalTargets },
    { index: 3, moveId: 'flash', type: 'Normal', pp: 20, disabled: false, targetType: 'normal', legalTargets },
  ],
  canSwitch: true,
  switchTargets,
  canTerastallize: false,
});

const benchMon: PartyMember = {
  instanceId: 'bench1', speciesId: 7, speciesName: 'squirtle', nickname: 'Squirtle',
  level: 40, currentHp: 100, maxHp: 120,
  stats: { hp: 120, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
  ability: 'torrent',
  moves: [
    { moveId: 'watergun', currentPp: 25, maxPp: 25 },
    { moveId: 'tackle', currentPp: 35, maxPp: 35 },
    { moveId: 'tail-whip', currentPp: 30, maxPp: 30 },
    { moveId: 'bubble', currentPp: 30, maxPp: 30 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const stateWithBench: BattleState = {
  ...state,
  teams: [
    state.teams[0]!,
    {
      teamId: 'team-b',
      slots: [
        { ...state.teams[1]!.slots[0]!, party: [state.teams[1]!.slots[0]!.party[0]!, benchMon] },
        state.teams[1]!.slots[1]!,
      ],
    },
  ],
};

describe('NpcTabPanel — voluntary switch', () => {
  it('shows SWITCH POKÉMON button when canSwitch is true and moves are available', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    expect(screen.getByText('SWITCH POKÉMON')).toBeTruthy();
  });

  it('clicking SWITCH POKÉMON shows bench list and Cancel button', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    expect(screen.getByText(/Squirtle/)).toBeTruthy();
    expect(screen.getByText('[Cancel]')).toBeTruthy();
    expect(screen.queryByText('Surf')).toBeNull();
  });

  it('clicking a bench Pokémon submits the switch action and marks slot submitted', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText(/Squirtle/));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'npc-action',
      data: { battleId: 'test', slotId: 'b1', action: { type: 'switch', targetInstanceId: 'bench1' } },
    });
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('clicking Cancel returns to the move grid without submitting', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('[Cancel]'));
    expect(screen.getByText('Surf')).toBeTruthy();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('forced switch (no valid moves, canSwitch true) shows no Cancel button', () => {
    const forcedRequest: ActionRequestPayload = {
      slotId: 'b1', validMoves: [], canSwitch: true, switchTargets: ['bench1'], canTerastallize: false,
    };
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: forcedRequest }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    expect(screen.getByText(/Squirtle/)).toBeTruthy();
    expect(screen.queryByText('[Cancel]')).toBeNull();
  });
});
