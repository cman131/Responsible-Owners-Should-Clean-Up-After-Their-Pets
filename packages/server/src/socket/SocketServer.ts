import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, BattleState, SlotState, BattleJoinOption } from '@poke-fighter/shared';
import { LobbyManager } from './LobbyManager.js';
import { BattleRoom } from './BattleRoom.js';
import { registerLobbyHandlers } from './handlers/lobbyHandlers.js';
import { registerBattleHandlers } from './handlers/battleHandlers.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { AppDatabase } from '../db/Database.js';

interface SocketServerOptions { adminToken: string }

export class SocketServer {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly lobby = new LobbyManager();
  private readonly rooms = new Map<string, BattleRoom>();
  private readonly db: AppDatabase;

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
      );
      registerBattleHandlers(socket, this.lobby, (id) => this.rooms.get(id));

      if (socket.data['isAdmin']) {
        registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this), this.db, this.lobby);
        socket.emit('admin:authenticated');
      } else {
        const providedToken = socket.handshake.auth['token'] as string | undefined;
        if (providedToken) {
          socket.emit('admin:error', { message: 'Invalid admin token' });
        }
        socket.on('admin:action', () => {
          socket.emit('admin:error', { message: 'Unauthorized' });
        });
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
      const available = state.teams
        .flatMap((t) => t.slots)
        .filter((s) => !s.isNpc && !s.isSpectator && !this.lobby.getBySlotId(s.slotId));
      if (available.length > 0) {
        options.push({
          battleId,
          label: state.label,
          slots: available.map((s) => ({ slotId: s.slotId, displayName: s.displayName })),
        });
      }
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
        joined: !!this.lobby.getBySlotId(s.slotId),
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

  startBattle(initialState: BattleState): BattleRoom {
    const room = new BattleRoom({ initialState: structuredClone(initialState) });
    this.rooms.set(initialState.battleId, room);

    for (const team of initialState.teams) {
      for (const slot of team.slots) {
        if (slot.isNpc || slot.isSpectator) continue;
        const player = this.lobby.getByName(slot.displayName);
        if (player) {
          player.battleSlotId = slot.slotId;
          player.battleId = initialState.battleId;
        }
      }
    }

    for (const team of initialState.teams) {
      for (const slot of team.slots) {
        if (slot.isSpectator) continue;
        const player = this.lobby.getBySlotId(slot.slotId);
        if (!player) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        socket?.join(`battle:${initialState.battleId}`);
      }
    }

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

    room.onBattleEnd((winningTeamId, finalState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
      this.db.battles.markEnded(initialState.battleId, winningTeamId);
      this.rooms.delete(initialState.battleId);
      this.notifyAdminsOfBattles();
      this.notifyPlayersOfBattles();
    });

    room.onSwitchRequest((slots: SlotState[]) => {
      for (const slot of slots) {
        const player = this.lobby.getBySlotId(slot.slotId);
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
        const player = this.lobby.getBySlotId(slotId);
        if (!player) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        socket?.emit('action:request', request);
      }
    });

    return room;
  }
}
