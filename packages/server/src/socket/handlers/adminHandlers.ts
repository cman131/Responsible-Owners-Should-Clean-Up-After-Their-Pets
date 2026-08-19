import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState,
} from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom
): void {
  socket.on('admin:action', (payload: AdminActionPayload) => {
    switch (payload.type) {
      case 'npc-action': {
        const { battleId, slotId, action } = payload.data as { battleId: string; slotId: string; action: MoveAction | SwitchAction };
        const room = getRoom(battleId);
        room?.submitAction(slotId, action);
        break;
      }
      case 'pause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.pause();
        const state = getRoom(battleId)?.getState();
        if (state) io.to(`battle:${battleId}`).emit('state:sync', state);
        break;
      }
      case 'unpause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.unpause();
        break;
      }
      case 'force-faint':
      case 'forfeit':
      case 'force-switch':
        // Deferred to later plans
        break;
    }
  });
}
