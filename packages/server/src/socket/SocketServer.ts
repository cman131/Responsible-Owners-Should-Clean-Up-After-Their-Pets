import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, BattleState, SlotState } from '@poke-fighter/shared';
import { LobbyManager } from './LobbyManager.js';
import { BattleRoom } from './BattleRoom.js';
import { registerLobbyHandlers } from './handlers/lobbyHandlers.js';
import { registerBattleHandlers } from './handlers/battleHandlers.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';

interface SocketServerOptions { adminToken: string }

export class SocketServer {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly lobby = new LobbyManager();
  private readonly rooms = new Map<string, BattleRoom>();

  constructor(httpServer: HttpServer, { adminToken }: SocketServerOptions) {
    this.io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth['token'] as string | undefined;
      if (token && token === adminToken) {
        socket.data['isAdmin'] = true;
      }
      next();
    });

    this.io.on('connection', (socket) => {
      console.log(`Connected: ${socket.id} (admin=${socket.data['isAdmin'] ?? false})`);

      registerLobbyHandlers(socket, this.lobby, (id) => this.rooms.get(id));
      registerBattleHandlers(socket, this.lobby, (id) => this.rooms.get(id));
      if (socket.data['isAdmin']) {
        registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this));
      }

      socket.on('disconnect', () => {
        const player = this.lobby.getBySocketId(socket.id);
        if (player) {
          console.log(`Disconnected: ${player.displayName}`);
          this.lobby.markDisconnected(socket.id);
        }
      });
    });
  }

  startBattle(initialState: BattleState): BattleRoom {
    const room = new BattleRoom({ initialState, timerSeconds: initialState.turnTimerSeconds });
    this.rooms.set(initialState.battleId, room);

    this.io.to(`battle:${initialState.battleId}`).emit('battle:start', { state: initialState });

    room.onTurnResolved((events, newState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
        turnNumber: newState.turnNumber,
        events,
        state: newState,
      });
    });

    room.onBattleEnd((winningTeamId, finalState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
      this.rooms.delete(initialState.battleId);
    });

    room.onSwitchRequest((slots: SlotState[]) => {
      for (const slot of slots) {
        const player = this.lobby.getByName(slot.displayName);
        if (!player) continue;
        const availableParty = slot.party.filter((p, i) => i !== slot.activePokemonIndex && !p.fainted);
        this.io.to(player.socketId).emit('switch:request', {
          slotId: slot.slotId,
          party: availableParty,
          reason: 'faint',
        });
      }
    });

    return room;
  }
}
