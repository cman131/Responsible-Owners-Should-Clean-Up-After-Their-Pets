import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@poke-fighter/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: {}, // populated by connectAsPlayer or connectAsAdmin
    });
  }
  return socket;
}

export function connectAsPlayer(displayName: string): void {
  const s = getSocket();
  s.auth = {};
  s.connect();
  s.emit('player:join', { displayName });
}

export function connectAsAdmin(adminToken: string): void {
  const s = getSocket();
  s.auth = { token: adminToken };
  s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
