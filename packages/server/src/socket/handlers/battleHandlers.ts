import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ActionSubmitPayload, SwitchSubmitPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerBattleHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined
): void {
  socket.on('action:submit', (payload: ActionSubmitPayload) => {
    const player = lobby.getBySocketId(socket.id);
    if (!player?.battleId) return;

    const room = getRoom(player.battleId);
    if (!room) return;

    const result = room.submitAction(payload.slotId, payload.action);
    if (!result.ok) {
      console.warn(`Invalid action from ${player.displayName}: ${result.reason}`);
    }
  });

  socket.on('switch:submit', (payload: SwitchSubmitPayload) => {
    const player = lobby.getBySocketId(socket.id);
    if (!player?.battleId) return;

    const room = getRoom(player.battleId);
    if (!room) return;

    room.submitAction(payload.slotId, { type: 'switch', targetInstanceId: payload.targetInstanceId });
  });
}
