import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload, TurnResolveEvent } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined,
  notifyAdmins: () => void,
  notifyAdminsOfSlotStatus: (battleId: string) => void,
  notifyPlayersOfBattles: () => void,
  getEventLog: (battleId: string) => Array<{ turnNumber: number; events: TurnResolveEvent[] }>,
): void {
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    const { battleId, slotId } = payload;

    const room = getRoom(battleId);
    if (!room) {
      socket.emit('lobby:error', { code: 'BATTLE_NOT_FOUND', message: 'Battle not found or has ended.' });
      return;
    }

    const state = room.getStateSnapshot();
    const slot = state.teams.flatMap((t) => t.slots).find((s) => s.slotId === slotId);
    if (!slot || slot.isNpc || slot.isSpectator) {
      socket.emit('lobby:error', { code: 'BATTLE_NOT_FOUND', message: 'Slot not available.' });
      return;
    }

    const existing = lobby.getBySlotId(slotId);
    if (existing && existing.disconnectedAt === undefined) {
      socket.emit('lobby:error', { code: 'SLOT_TAKEN', message: 'That slot is already taken.' });
      return;
    }

    const result = lobby.registerPlayer(socket.id, slot.displayName);
    if (!result.ok) {
      socket.emit('lobby:error', { code: result.code, message: result.message });
      return;
    }

    const player = result.player;
    player.battleSlotId = slotId;
    player.battleId = battleId;
    socket.data['battleId'] = battleId;

    socket.join(`battle:${battleId}`);
    socket.emit('state:sync', state);
    socket.emit('battle:history', { turns: getEventLog(battleId) });

    const pending = room.getPendingActionRequest(slotId);
    if (pending) {
      socket.emit('action:request', pending);
    } else {
      const pendingSwitch = room.getPendingSwitchRequest(slotId);
      if (pendingSwitch) socket.emit('switch:request', pendingSwitch);
    }

    notifyAdminsOfSlotStatus(battleId);
    notifyPlayersOfBattles();
  });

  socket.on('player:leave', () => {
    const player = lobby.getBySocketId(socket.id);
    if (!player?.battleId) return;
    const { battleId } = player;
    lobby.removePlayer(socket.id);
    delete socket.data['battleId'];
    socket.leave(`battle:${battleId}`);
    notifyAdminsOfSlotStatus(battleId);
    notifyPlayersOfBattles();
  });
}
