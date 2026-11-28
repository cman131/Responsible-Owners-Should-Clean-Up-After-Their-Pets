import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, BattleState, SlotState, BattleJoinOption } from '@poke-fighter/shared';
import { LobbyManager, computeSlotStatus } from './LobbyManager.js';
import { BattleRoom } from './BattleRoom.js';
import { registerLobbyHandlers } from './handlers/lobbyHandlers.js';
import { registerBattleHandlers } from './handlers/battleHandlers.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { registerPlayerPortalHandlers } from './handlers/playerPortalHandlers.js';
import { AppDatabase } from '../db/Database.js';
import { buildPlayerHealth, getOwnerProfileIds, saveBattleConditions, type HealthService } from '../setup/playerHealth.js';

interface SocketServerOptions { adminToken: string }

export class SocketServer {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly lobby = new LobbyManager();
  private readonly rooms = new Map<string, BattleRoom>();
  private readonly db: AppDatabase;
  private readonly healthService: HealthService = {
    isInBattle: (profileId) => this.isPlayerInBattle(profileId),
    publish: (profileId) => this.publishPlayerHealth(profileId),
  };

  constructor(httpServer: HttpServer, { adminToken }: SocketServerOptions) {
    this.io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    this.db = new AppDatabase(join(process.cwd(), 'data/poke-fighter.db'));

    this.io.use((socket, next) => {
      const token = socket.handshake.auth['token'] as string | undefined;
      if (token && token === adminToken) {
        socket.data['isAdmin'] = true;
      }
      next();
    });

    this.io.on('connection', (socket) => {
      console.log(`Connected: ${socket.id} (admin=${socket.data['isAdmin'] ?? false})`);

      const notifyAdminsOfLobby = () => {
        const players = this.lobby.getWaitingPlayers().map((p) => p.displayName);
        for (const s of this.io.sockets.sockets.values()) {
          if (s.data['isAdmin']) s.emit('lobby:players', players);
        }
      };

      registerLobbyHandlers(
        socket,
        this.lobby,
        (id) => this.rooms.get(id),
        notifyAdminsOfLobby,
        this.notifyAdminsOfSlotStatus.bind(this),
        this.notifyPlayersOfBattles.bind(this),
        (battleId) => this.db.battles.getEventLog(battleId),
      );
      registerBattleHandlers(socket, this.lobby, (id) => this.rooms.get(id));

      if (socket.data['isAdmin']) {
        registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this), this.db, this.lobby, this.cancelBattle.bind(this), this.healthService);
        socket.emit('admin:authenticated');
      } else {
        const providedToken = socket.handshake.auth['token'] as string | undefined;
        if (providedToken) {
          socket.emit('admin:error', { message: 'Invalid admin token' });
        }
        socket.on('admin:action', () => {
          socket.emit('admin:error', { message: 'Unauthorized' });
        });
        registerPlayerPortalHandlers(socket, this.db, this.healthService);
        // Push current battle list immediately to this new non-admin connection
        const battles = this.getBattleJoinOptions();
        socket.emit('lobby:battles', { battles });
      }

      socket.on('disconnect', () => {
        const player = this.lobby.getBySocketId(socket.id);
        if (player) {
          const { battleId } = player;
          console.log(`Disconnected: ${player.displayName}`);
          this.lobby.markDisconnected(socket.id);
          if (battleId) {
            this.notifyAdminsOfSlotStatus(battleId);
          }
          this.notifyPlayersOfBattles();
        }
      });
    });
  }

  private getBattleJoinOptions(): BattleJoinOption[] {
    const options: BattleJoinOption[] = [];
    for (const [battleId, room] of this.rooms) {
      const state = room.getStateSnapshot();
      const slots = state.teams
        .flatMap((t) => t.slots)
        .filter((s) => !s.isNpc && !s.isSpectator)
        .map((s) => ({
          slotId: s.slotId,
          displayName: s.displayName,
          status: computeSlotStatus(this.lobby.getBySlotId(battleId, s.slotId)),
        }));
      options.push({ battleId, label: state.label, slots });
    }
    return options;
  }

  private notifyPlayersOfBattles(): void {
    const battles = this.getBattleJoinOptions();
    for (const s of this.io.sockets.sockets.values()) {
      if (!s.data['isAdmin'] && !s.data['battleId']) {
        s.emit('lobby:battles', { battles });
      }
    }
  }

  private notifyAdminsOfSlotStatus(battleId: string): void {
    const room = this.rooms.get(battleId);
    if (!room) return;
    const state = room.getStateSnapshot();
    const slots = state.teams
      .flatMap((t) => t.slots)
      .filter((s) => !s.isNpc && !s.isSpectator)
      .map((s) => ({
        slotId: s.slotId,
        displayName: s.displayName,
        joined: this.lobby.isConnected(battleId, s.slotId),
      }));
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data['isAdmin']) s.emit('lobby:slot-status', { battleId, slots });
    }
  }

  private notifyAdminsOfBattles(): void {
    const summaries = this.db.battles.list();
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data['isAdmin']) s.emit('battles:data', { battles: summaries });
    }
  }

  private isPlayerInBattle(profileId: string): boolean {
    return [...this.rooms.values()].some((room) => getOwnerProfileIds(room.getState()).includes(profileId));
  }

  private publishPlayerHealth(profileId: string): void {
    const payload = buildPlayerHealth(this.db, profileId, this.isPlayerInBattle(profileId));
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data['isAdmin'] || s.data['portalProfileId'] === profileId) {
        s.emit('player:health', payload);
      }
    }
  }

  private saveHealthAfterBattle(state: BattleState): void {
    try {
      saveBattleConditions(this.db, state);
    } catch (err) {
      console.error('[SocketServer] failed to save Pokémon condition:', err);
      for (const s of this.io.sockets.sockets.values()) {
        if (s.data['isAdmin']) {
          s.emit('admin:warning', { message: `Health was not updated after "${state.label}". Check the server log.` });
        }
      }
    }
  }

  private releasePlayers(battleId: string): void {
    this.lobby.releaseBattle(battleId);
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data['battleId'] === battleId) {
        delete s.data['battleId'];
        s.leave(`battle:${battleId}`);
      }
    }
  }

  private cancelBattle(battleId: string): void {
    const room = this.rooms.get(battleId);
    const owners = room ? getOwnerProfileIds(room.getState()) : [];
    this.rooms.delete(battleId);
    this.db.battles.markEnded(battleId, null);
    this.releasePlayers(battleId);
    this.notifyAdminsOfBattles();
    this.notifyPlayersOfBattles();
    owners.forEach((profileId) => this.publishPlayerHealth(profileId));
  }

  startBattle(initialState: BattleState): BattleRoom {
    const room = new BattleRoom({ initialState: structuredClone(initialState) });
    this.rooms.set(initialState.battleId, room);
    getOwnerProfileIds(initialState).forEach((profileId) => this.publishPlayerHealth(profileId));

    this.io.to(`battle:${initialState.battleId}`).emit('battle:start', { state: initialState });
    this.notifyAdminsOfBattles();
    this.notifyPlayersOfBattles();  // push new battle to connected players

    room.onTurnResolved((events, newState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
        turnNumber: newState.turnNumber,
        events,
        state: newState,
      });
      this.db.battles.updateState(initialState.battleId, newState);
      this.db.battles.appendTurnEvents(initialState.battleId, { turnNumber: newState.turnNumber, events });
      this.notifyAdminsOfBattles();
    });

    room.onExpAward((awards) => {
      this.io.to(`battle:${initialState.battleId}`).emit('exp:award', { awards });
    });

    room.onLevelUp((result, newStats) => {
      this.io.to(`battle:${initialState.battleId}`).emit('level:up', {
        instanceId: result.instanceId,
        newLevel: result.newLevel,
        newStats,
      });
    });

    room.onBattleEnd((winningTeamId, finalState, conditionState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
      this.saveHealthAfterBattle(conditionState);
      this.db.battles.markEnded(initialState.battleId, winningTeamId);
      this.rooms.delete(initialState.battleId);
      this.releasePlayers(initialState.battleId);
      this.notifyAdminsOfBattles();
      this.notifyPlayersOfBattles();
      getOwnerProfileIds(initialState).forEach((profileId) => this.publishPlayerHealth(profileId));
    });

    room.onSwitchRequest((slots: SlotState[]) => {
      for (const slot of slots) {
        if (slot.isNpc) {
          const switchTargets = slot.party
            .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
            .map((p) => p.instanceId);
          const npcSwitchRequest: import('@poke-fighter/shared').ActionRequestPayload = {
            slotId: slot.slotId,
            validMoves: [],
            canSwitch: true,
            switchTargets,
            canTerastallize: false,
          };
          const adminSockets = [...this.io.sockets.sockets.values()].filter(
            (s) => s.data['isAdmin'] === true,
          );
          for (const adminSocket of adminSockets) {
            adminSocket.emit('npc:action-request', {
              battleId: initialState.battleId,
              slots: [{ slotId: slot.slotId, displayName: slot.displayName, request: npcSwitchRequest }],
            });
          }
          continue;
        }
        const player = this.lobby.getBySlotId(initialState.battleId, slot.slotId);
        if (!player) continue;
        const availableParty = slot.party.filter((p, i) => i !== slot.activePokemonIndex && !p.fainted);
        this.io.to(player.socketId).emit('switch:request', {
          slotId: slot.slotId,
          party: availableParty,
          reason: 'faint',
        });
      }
    });

    room.onNpcActionRequired((slots) => {
      const adminSockets = [...this.io.sockets.sockets.values()].filter((s) => s.data['isAdmin'] === true);
      for (const adminSocket of adminSockets) {
        adminSocket.emit('npc:action-request', { battleId: initialState.battleId, slots });
      }
    });

    room.onPlayerActionRequired((requests) => {
      for (const { slotId, request } of requests) {
        const player = this.lobby.getBySlotId(initialState.battleId, slotId);
        if (!player) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        socket?.emit('action:request', request);
      }
    });

    return room;
  }
}
