import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move, HeldItem,
} from '@poke-fighter/shared';
import { isStartingWeather } from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { LobbyManager } from '../LobbyManager.js';
import type { AppDatabase } from '../../db/Database.js';
import { IMPLEMENTED_ITEM_IDS } from '../../engine/items.js';
import { BattleConfigurator } from '../../setup/BattleConfigurator.js';
import { prepareBattleTeams, type StartTeams } from '../../setup/battleStart.js';
import { buildPlayerHealth, healPlayer, type HealthService } from '../../setup/playerHealth.js';

export function pokemonMatchesQuery(s: PokemonSpecies, query: string): boolean {
  const q = query.toLowerCase();
  return s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || String(s.id).includes(q);
}

export function moveMatchesQuery(m: Move, query: string): boolean {
  const q = query.toLowerCase();
  return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
}

export function itemMatchesQuery(i: HeldItem, query: string): boolean {
  const q = query.toLowerCase();
  return i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
}

export function filterItemsQuery(items: HeldItem[], opts: { equippableOnly?: boolean; query?: string; speciesName?: string }): HeldItem[] {
  const base = opts.equippableOnly ? items.filter((i) => i.equippable) : items;
  const speciesFiltered = opts.speciesName !== undefined
    ? base.filter((i) => !i.speciesRestriction || i.speciesRestriction === opts.speciesName)
    : base;
  return opts.query ? speciesFiltered.filter((i) => itemMatchesQuery(i, opts.query!)) : speciesFiltered;
}

const NO_HEALTH: HealthService = { isInBattle: () => false, publish: () => {} };

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom,
  db: AppDatabase,
  lobby: LobbyManager,
  cancelRoom: (battleId: string) => void,
  health: HealthService = NO_HEALTH
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
        const { battleId, label, teams, levelCap, weather } = payload.data as {
          battleId: string; label: string; levelCap?: number; weather?: unknown; teams: StartTeams;
        };
        if (weather !== undefined && !isStartingWeather(weather)) {
          socket.emit('admin:start-result', { battleId, ok: false, message: 'Unknown starting weather.' });
          break;
        }
        // No await between the checks and startBattle, so two quick requests can't both pass
        try {
          const prepared = prepareBattleTeams(db, teams, (id) => health.isInBattle(id));
          if (!prepared.ok) {
            socket.emit('admin:start-result', { battleId, ok: false, message: prepared.message });
            break;
          }
          const state = new BattleConfigurator().build({
            battleId, label, teams: prepared.teams,
            ...(levelCap !== undefined ? { levelCap } : {}),
            ...(weather !== undefined ? { weather } : {}),
          });
          db.battles.insert(state);
          if (weather !== undefined) {
            // Turn 0 marks the pre-battle entry; real turns are numbered from 1
            db.battles.appendTurnEvents(battleId, { turnNumber: 0, events: [{ type: 'weather-started', data: { weather } }] });
          }
          startBattle(state);
          socket.emit('admin:start-result', { battleId, ok: true });
        } catch (err) {
          console.error('[start-battle] failed:', err);
          socket.emit('admin:start-result', { battleId, ok: false, message: 'Battle failed to start. Check the server log.' });
        }
        break;
      }
      case 'battles:list': {
        socket.emit('battles:data', { battles: db.battles.list() });
        break;
      }
      case 'battles:connect': {
        const { battleId } = payload.data as { battleId: string };
        const prevBattleId = socket.data['watchingBattleId'] as string | undefined;
        if (prevBattleId) socket.leave(`battle:${prevBattleId}`);
        socket.join(`battle:${battleId}`);
        socket.data['watchingBattleId'] = battleId;
        const state = db.battles.get(battleId);
        if (state) socket.emit('state:sync', state);
        socket.emit('battle:history', { turns: db.battles.getEventLog(battleId) });
        const liveRoom = getRoom(battleId);
        if (liveRoom) {
          const npcRequests = liveRoom.getPendingNpcRequests();
          if (npcRequests.length > 0) socket.emit('npc:action-request', { battleId, slots: npcRequests });
        }
        break;
      }
      case 'data:query': {
        try {
          const { resource } = payload.data as { resource: 'pokemon' | 'moves' | 'items' };
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
            case 'items': {
              const { query: itemQuery, equippableOnly, speciesName } = payload.data as { query?: string; equippableOnly?: boolean; speciesName?: string };
              const allImplemented = data.getAllItems().filter((i) => {
                // Normalise via item NAME to match ITEM_HOOKS hyphenated keys
                // (items.json ids are camelCase and don't match ITEM_HOOKS keys directly)
                const normByName = i.name.toLowerCase().replace(/\s+/g, '-');
                return IMPLEMENTED_ITEM_IDS.has(normByName);
              });
              results = filterItemsQuery(allImplemented, {
                ...(equippableOnly !== undefined ? { equippableOnly } : {}),
                ...(itemQuery !== undefined ? { query: itemQuery } : {}),
                ...(speciesName !== undefined ? { speciesName } : {}),
              });
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
      case 'cancel-battle': {
        const { battleId } = payload.data as { battleId: string };
        if (typeof battleId === 'string') cancelRoom(battleId);
        break;
      }
      case 'submit-default-action': {
        const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
        if (typeof battleId === 'string' && typeof slotId === 'string') {
          getRoom(battleId)?.submitDefaultAction(slotId);
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
            joined: lobby.isConnected(battleId, s.slotId),
          }));
        socket.emit('lobby:slot-status', { battleId, slots });
        break;
      }
      case 'force-switch': {
        const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
        if (typeof battleId === 'string' && typeof slotId === 'string') {
          getRoom(battleId)?.forceSwitch(slotId);
        }
        break;
      }
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
        const allPokemon = [
          ...(profile.defaultTeam?.pokemon ?? []),
          ...(profile.bank ?? []),
        ];
        const leased: Record<string, number> = {};
        for (const p of allPokemon) {
          if (p.heldItem) leased[p.heldItem] = (leased[p.heldItem] ?? 0) + 1;
        }
        const inventory = profile.inventory ?? {};
        const violation = Object.entries(leased).find(([itemId, count]) => count > (inventory[itemId] ?? 0));
        if (violation) {
          socket.emit('registry:error', { type: 'registry:save-player', message: `Item '${violation[0]}' is held by more Pokémon than owned (${violation[1]} held, ${inventory[violation[0]] ?? 0} owned).` });
          break;
        }
        db.players.save(profile);
        socket.emit('registry:data', { resource: 'players', data: db.players.list() });
        health.publish(profile.profileId);
        break;
      }
      case 'registry:player-health': {
        const { profileId } = payload.data as { profileId: string };
        socket.emit('player:health', buildPlayerHealth(db, profileId, health.isInBattle(profileId)));
        break;
      }
      case 'registry:heal-player': {
        const { profileId, pokemonId } = payload.data as { profileId: string; pokemonId?: string };
        const result = healPlayer(db, profileId, pokemonId, health.isInBattle(profileId));
        if (!result.ok) {
          socket.emit('registry:error', { type: 'registry:heal-player', message: result.message });
          break;
        }
        health.publish(profileId);
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
