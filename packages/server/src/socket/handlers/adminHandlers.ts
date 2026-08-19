import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState,
} from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { RegistryStore } from '../../registry/RegistryStore.js';

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom,
  registry: RegistryStore
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
      case 'registry:list': {
        const { resource } = payload.data as { resource: 'players' | 'npcs' | 'teams' };
        const data = resource === 'players' ? registry.listPlayers()
          : resource === 'npcs' ? registry.listNpcs()
          : registry.listTeams();
        socket.emit('registry:data', { resource, data });
        break;
      }
      case 'registry:save-player': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').PlayerProfile };
        registry.savePlayer(profile);
        socket.emit('registry:data', { resource: 'players', data: registry.listPlayers() });
        break;
      }
      case 'registry:delete-player': {
        const { profileId } = payload.data as { profileId: string };
        registry.deletePlayer(profileId);
        socket.emit('registry:data', { resource: 'players', data: registry.listPlayers() });
        break;
      }
      case 'registry:save-npc': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').NpcProfile };
        registry.saveNpc(profile);
        socket.emit('registry:data', { resource: 'npcs', data: registry.listNpcs() });
        break;
      }
      case 'registry:delete-npc': {
        const { profileId } = payload.data as { profileId: string };
        registry.deleteNpc(profileId);
        socket.emit('registry:data', { resource: 'npcs', data: registry.listNpcs() });
        break;
      }
      case 'registry:save-team': {
        const { template } = payload.data as { template: import('@poke-fighter/shared').TeamTemplate };
        registry.saveTeam(template);
        socket.emit('registry:data', { resource: 'teams', data: registry.listTeams() });
        break;
      }
      case 'registry:delete-team': {
        const { templateId } = payload.data as { templateId: string };
        registry.deleteTeam(templateId);
        socket.emit('registry:data', { resource: 'teams', data: registry.listTeams() });
        break;
      }
    }
  });
}
