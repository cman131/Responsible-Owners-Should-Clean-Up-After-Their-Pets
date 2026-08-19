import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager
): void {
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    const result = lobby.registerPlayer(socket.id, payload.displayName);
    if (!result.ok) {
      socket.emit('lobby:error', { code: result.code, message: result.message });
      return;
    }
    console.log(`Player joined: ${result.player.displayName} (${socket.id})`);
    socket.join('lobby');
  });
}
