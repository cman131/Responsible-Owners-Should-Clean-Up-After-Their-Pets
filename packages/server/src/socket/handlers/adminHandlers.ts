import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move,
} from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { RegistryStore } from '../../registry/RegistryStore.js';

export function pokemonMatchesQuery(s: PokemonSpecies, query: string): boolean {
  const q = query.toLowerCase();
  return s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || String(s.id).includes(q);
}

export function moveMatchesQuery(m: Move, query: string): boolean {
  const q = query.toLowerCase();
  return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
}

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom,
  registry: RegistryStore
): void {
  socket.on('admin:action', async (payload: AdminActionPayload) => {
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
      case 'start-battle': {
        const { battleId, label, turnTimerSeconds, teams } = payload.data as {
          battleId: string; label: string; turnTimerSeconds: number;
          teams: [{ slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }, { slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }];
        };
        const { BattleConfigurator } = await import('../../setup/BattleConfigurator.js');
        const configurator = new BattleConfigurator();
        const state = configurator.build({ battleId, label, turnTimerSeconds, teams });
        startBattle(state);
        break;
      }
      case 'data:query': {
        try {
          const { resource, query } = payload.data as { resource: 'pokemon' | 'moves'; query?: string };
          const { DataLoader } = await import('../../data/loader.js');
          const data = new DataLoader();
          let results: unknown[];
          switch (resource) {
            case 'pokemon':
              results = data.getAllSpecies().filter((s) => !query || pokemonMatchesQuery(s, query)).slice(0, 30);
              break;
            case 'moves': {
              const { speciesId, query: moveQuery } = payload.data as { resource: 'moves'; speciesId?: number; query?: string };
              if (speciesId !== undefined) {
                const species = data.getSpecies(speciesId);
                results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
              } else if (moveQuery) {
                results = data.getAllMoves().filter((m) => moveMatchesQuery(m, moveQuery)).slice(0, 30);
              } else {
                results = [];
              }
              break;
            }
            default:
              results = [];
          }
          socket.emit('data:results', { resource, results });
        } catch (err) {
          console.error('[data:query] handler error:', err);
        }
        break;
      }
      case 'force-faint': {
        const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
        if (typeof battleId === 'string' && typeof slotId === 'string') {
          getRoom(battleId)?.forceFaint(slotId);
        }
        break;
      }
      case 'forfeit': {
        const { battleId, teamId } = payload.data as { battleId: string; teamId: string };
        if (typeof battleId === 'string' && typeof teamId === 'string') {
          getRoom(battleId)?.forfeit(teamId);
        }
        break;
      }
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
