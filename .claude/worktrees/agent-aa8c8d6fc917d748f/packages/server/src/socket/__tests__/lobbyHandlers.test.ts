import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock types matching the subset of Socket.io and domain types we need
interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

function makeSocket(id = 'sock1'): MockSocket & { trigger(e: string, p: unknown): void } {
  const handlers: Record<string, (p: unknown) => void> = {};
  return {
    id,
    data: {},
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    on: (event, handler) => { handlers[event] = handler; },
    trigger(event: string, payload: unknown) {
      handlers[event]?.(payload);
    },
  };
}

function makeLobby() {
  return {
    registerPlayer: vi.fn(),
    getBySlotId: vi.fn(),
    getBySocketId: vi.fn(),
    markDisconnected: vi.fn(),
    removePlayer: vi.fn(),
    getWaitingPlayers: vi.fn(() => []),
    getByName: vi.fn(),
  };
}

function makeRoom(
  slotOverrides: Partial<{ isNpc: boolean; isSpectator: boolean }> = {},
  methodOverrides: Partial<{ getPendingActionRequest: ReturnType<typeof vi.fn> }> = {},
) {
  const defaultSlotA = {
    slotId: 'slot-a1',
    displayName: 'Conor',
    isNpc: false,
    isSpectator: false,
    ...slotOverrides,
  };
  return {
    getStateSnapshot: vi.fn(() => ({
      battleId: 'battle-1',
      label: 'Test Battle',
      teams: [
        { teamId: 'team-a', slots: [defaultSlotA] },
        { teamId: 'team-b', slots: [{ slotId: 'slot-b1', displayName: 'Kyle', isNpc: false, isSpectator: false }] },
      ],
    })),
    getPendingActionRequest: methodOverrides.getPendingActionRequest ?? vi.fn(() => null),
  };
}

import { registerLobbyHandlers } from '../handlers/lobbyHandlers.js';

describe('registerLobbyHandlers – player:join', () => {
  let socket: ReturnType<typeof makeSocket>;
  let lobby: ReturnType<typeof makeLobby>;
  let room: ReturnType<typeof makeRoom>;
  let notifyAdmins: ReturnType<typeof vi.fn>;
  let notifyAdminsOfSlotStatus: ReturnType<typeof vi.fn>;
  let notifyPlayersOfBattles: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    socket = makeSocket();
    lobby = makeLobby();
    room = makeRoom();
    notifyAdmins = vi.fn();
    notifyAdminsOfSlotStatus = vi.fn();
    notifyPlayersOfBattles = vi.fn();
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (room as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),  // getEventLog — NEW
    );
  });

  it('emits BATTLE_NOT_FOUND when battle does not exist', () => {
    socket.trigger('player:join', { battleId: 'no-such-battle', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', {
      code: 'BATTLE_NOT_FOUND',
      message: expect.any(String),
    });
  });

  it('emits lobby:error when slot does not exist in the battle', () => {
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'nonexistent-slot' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', expect.objectContaining({ code: expect.any(String) }));
  });

  it('emits lobby:error when slot is NPC', () => {
    const npcRoom = makeRoom({ isNpc: true });
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (npcRoom as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),  // getEventLog — NEW
    );
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', expect.objectContaining({ code: expect.any(String) }));
  });

  it('emits lobby:error when slot is spectator', () => {
    const spectatorRoom = makeRoom({ isSpectator: true });
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (spectatorRoom as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),  // getEventLog — NEW
    );
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', expect.objectContaining({ code: expect.any(String) }));
  });

  it('emits SLOT_TAKEN when an active player holds the slot', () => {
    lobby.getBySlotId.mockReturnValue({ socketId: 'other-sock', displayName: 'Conor', disconnectedAt: undefined });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', {
      code: 'SLOT_TAKEN',
      message: expect.any(String),
    });
  });

  it('allows join when slot is held only by a disconnected player', () => {
    lobby.getBySlotId.mockReturnValue({ socketId: 'other-sock', displayName: 'Conor', disconnectedAt: Date.now() - 1000 });
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).not.toHaveBeenCalledWith('lobby:error', expect.anything());
  });

  it('registers the player using slot displayName and sets battleId/battleSlotId', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    const player = { displayName: 'Conor', battleId: null as string | null, battleSlotId: null as string | null };
    lobby.registerPlayer.mockReturnValue({ ok: true, player });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(lobby.registerPlayer).toHaveBeenCalledWith('sock1', 'Conor');
    expect(player.battleId).toBe('battle-1');
    expect(player.battleSlotId).toBe('slot-a1');
  });

  it('joins the battle room socket channel', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.join).toHaveBeenCalledWith('battle:battle-1');
  });

  it('sets socket.data.battleId', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.data['battleId']).toBe('battle-1');
  });

  it('emits state:sync after joining', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('state:sync', expect.objectContaining({ battleId: 'battle-1' }));
  });

  it('calls notifyAdminsOfSlotStatus and notifyPlayersOfBattles on success', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(notifyAdminsOfSlotStatus).toHaveBeenCalledWith('battle-1');
    expect(notifyPlayersOfBattles).toHaveBeenCalled();
  });

  it('emits action:request when getPendingActionRequest returns a pending request', () => {
    const pendingRequest = {
      slotId: 'slot-a1',
      validMoves: [{ index: 0 as const, moveId: 'tackle', pp: 35, disabled: false, targetType: 'normal' as const, legalTargets: ['slot-b1'] }],
      canSwitch: false,
      switchTargets: [],
      canTerastallize: false,
    };

    const roomWithPending = makeRoom({}, { getPendingActionRequest: vi.fn<any[], any>(() => pendingRequest) });
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (roomWithPending as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),  // getEventLog — NEW
    );

    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });

    expect(socket.emit).toHaveBeenCalledWith('action:request', pendingRequest);
  });

  it('emits battle:history after state:sync on successful join', () => {
    const turn = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
    const getEventLog = vi.fn(() => [turn]);
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (room as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      getEventLog,
    );
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [turn] });
    expect(getEventLog).toHaveBeenCalledWith('battle-1');
  });
});

describe('registerLobbyHandlers – player:leave', () => {
  it('removes the player, clears socket.data.battleId, leaves the room, and notifies', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    const room = makeRoom();
    const notifyAdminsOfSlotStatus = vi.fn();
    const notifyPlayersOfBattles = vi.fn();

    socket.data['battleId'] = 'battle-1';
    lobby.getBySocketId.mockReturnValue({
      socketId: 'sock1',
      displayName: 'Ash',
      battleId: 'battle-1',
      battleSlotId: 'slot-a1',
    });

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (room as any) : undefined),
      vi.fn(),
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).toHaveBeenCalledWith('sock1');
    expect(socket.data['battleId']).toBeUndefined();
    expect(socket.leave).toHaveBeenCalledWith('battle:battle-1');
    expect(notifyAdminsOfSlotStatus).toHaveBeenCalledWith('battle-1');
    expect(notifyPlayersOfBattles).toHaveBeenCalled();
  });

  it('is a no-op when the socket has no associated player', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    lobby.getBySocketId.mockReturnValue(undefined);
    const notifyPlayersOfBattles = vi.fn();

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      () => undefined,
      vi.fn(),
      vi.fn(),
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).not.toHaveBeenCalled();
    expect(notifyPlayersOfBattles).not.toHaveBeenCalled();
  });

  it('is a no-op when the player has no battleId', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    lobby.getBySocketId.mockReturnValue({
      socketId: 'sock1',
      displayName: 'Ash',
      battleId: undefined,
    });
    const notifyPlayersOfBattles = vi.fn();

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      () => undefined,
      vi.fn(),
      vi.fn(),
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).not.toHaveBeenCalled();
    expect(notifyPlayersOfBattles).not.toHaveBeenCalled();
  });
});
