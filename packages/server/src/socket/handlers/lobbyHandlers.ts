import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined
): void {
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    const result = lobby.registerPlayer(socket.id, payload.displayName);
    if (!result.ok) {
      socket.emit('lobby:error', { code: result.code, message: result.message });
      return;
    }

    const player = result.player;
    console.log(`Player joined: ${player.displayName} (${socket.id})`);

    // If player is reconnecting into an active battle, rejoin the room and send snapshot
    if (player.battleId) {
      socket.join(`battle:${player.battleId}`);
      const room = getRoom(player.battleId);
      if (room) {
        socket.emit('state:sync', room.getStateSnapshot());
      }
      return;
    }

    socket.join('lobby');
  });
}
