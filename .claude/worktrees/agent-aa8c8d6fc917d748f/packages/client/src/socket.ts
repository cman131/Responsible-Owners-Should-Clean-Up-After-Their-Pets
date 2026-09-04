import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@poke-fighter/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: {}, // populated by connectAsAdmin
    });
  }
  return socket;
}

export function connectAsAdmin(adminToken: string): void {
  const s = getSocket();
  if (s.connected) s.disconnect();
  s.auth = { token: adminToken };
  s.connect();
}

export function connectAsPlayer(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
