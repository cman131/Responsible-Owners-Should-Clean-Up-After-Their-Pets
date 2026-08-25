import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move,
} from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { LobbyManager } from '../LobbyManager.js';
import type { AppDatabase } from '../../db/Database.js';

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
  db: AppDatabase,
  lobby: LobbyManager
): void {
  socket.on('admin:action', async (payload: AdminActionPayload) => {
    switch (payload.type) {
      case 'npc-action': {
        const { battleId, slotId, action } = payload.data as { battleId: string; slotId: string; action: MoveAction | SwitchAction };
        const room = getRoom(battleId);
        room?.submitAction(slotId, action);
        break;
      }
      case 'start-battle': {
        const { battleId, label, teams } = payload.data as {
          battleId: string; label: string;
          teams: [{ slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }, { slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }];
        };
        const { BattleConfigurator } = await import('../../setup/BattleConfigurator.js');
        const configurator = new BattleConfigurator();
        const state = configurator.build({ battleId, label, teams });
        db.battles.insert(state);
        startBattle(state);
        break;
      }
      case 'battles:list': {
        socket.emit('battles:data', { battles: db.battles.list() });
        break;
      }
      case 'battles:connect': {
        const { battleId } = payload.data as { battleId: string };
        const state = db.battles.get(battleId);
        if (state) socket.emit('state:sync', state);
        break;
      }
      case 'data:query': {
        try {
          const { resource } = payload.data as { resource: 'pokemon' | 'moves' };
          const { DataLoader } = await import('../../data/loader.js');
          const data = new DataLoader();
          let results: unknown[];
          switch (resource) {
            case 'pokemon': {
              const { query } = payload.data as { query?: string };
              results = data.getAllSpecies().filter((s) => !query || pokemonMatchesQuery(s, query)).slice(0, 30);
              break;
            }
            case 'moves': {
              const { speciesId, query: moveQuery } = payload.data as { speciesId?: number; query?: string };
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
      case 'lobby:list': {
        const players = lobby.getWaitingPlayers().map((p) => p.displayName);
        socket.emit('lobby:players', players);
        break;
      }
      case 'lobby:slot-status': {
        const { battleId } = payload.data as { battleId: string };
        const room = getRoom(battleId);
        if (!room) break;
        const state = room.getStateSnapshot();
        const slots = state.teams
          .flatMap((t) => t.slots)
          .filter((s) => !s.isNpc && !s.isSpectator)
          .map((s) => ({
            slotId: s.slotId,
            displayName: s.displayName,
            joined: !!lobby.getBySlotId(s.slotId),
          }));
        socket.emit('lobby:slot-status', { battleId, slots });
        break;
      }
      case 'force-switch':
        break;
      case 'registry:list': {
        const { resource } = payload.data as { resource: 'players' | 'npcs' | 'teams' };
        const data = resource === 'players' ? db.players.list()
          : resource === 'npcs' ? db.npcs.list()
          : db.teams.list();
        socket.emit('registry:data', { resource, data });
        break;
      }
      case 'registry:save-player': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').PlayerProfile };
        db.players.save(profile);
        socket.emit('registry:data', { resource: 'players', data: db.players.list() });
        break;
      }
      case 'registry:delete-player': {
        const { profileId } = payload.data as { profileId: string };
        db.players.delete(profileId);
        socket.emit('registry:data', { resource: 'players', data: db.players.list() });
        break;
      }
      case 'registry:save-npc': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').NpcProfile };
        db.npcs.save(profile);
        socket.emit('registry:data', { resource: 'npcs', data: db.npcs.list() });
        break;
      }
      case 'registry:delete-npc': {
        const { profileId } = payload.data as { profileId: string };
        db.npcs.delete(profileId);
        socket.emit('registry:data', { resource: 'npcs', data: db.npcs.list() });
        break;
      }
      case 'registry:save-team': {
        const { template } = payload.data as { template: import('@poke-fighter/shared').TeamTemplate };
        db.teams.save(template);
        socket.emit('registry:data', { resource: 'teams', data: db.teams.list() });
        break;
      }
      case 'registry:delete-team': {
        const { templateId } = payload.data as { templateId: string };
        db.teams.delete(templateId);
        socket.emit('registry:data', { resource: 'teams', data: db.teams.list() });
        break;
      }
    }
  });
}
