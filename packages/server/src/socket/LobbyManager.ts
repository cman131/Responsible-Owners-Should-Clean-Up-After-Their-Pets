import type { LobbyErrorPayload } from '@poke-fighter/shared';

export interface ConnectedPlayer {
  socketId: string;
  displayName: string;
  battleSlotId?: string;
  battleId?: string;
  disconnectedAt?: number; // unix ms
}

type RegisterResult =
  | { ok: true; player: ConnectedPlayer }
  | { ok: false; code: LobbyErrorPayload['code']; message: string };

const RECONNECT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export class LobbyManager {
  private readonly bySocketId = new Map<string, ConnectedPlayer>();
  private readonly byName = new Map<string, ConnectedPlayer>();

  registerPlayer(socketId: string, displayName: string): RegisterResult {
    const trimmed = displayName.trim();

    if (!trimmed || trimmed.length > 20) {
      return { ok: false, code: 'INVALID_NAME', message: 'Name must be 1–20 characters.' };
    }

    const existing = this.byName.get(trimmed.toLowerCase());
    if (existing) {
      // Allow reconnect only if it's the same socket AND within window
      if (existing.socketId === socketId && existing.disconnectedAt && Date.now() - existing.disconnectedAt < RECONNECT_WINDOW_MS) {
        // Reconnect — clear disconnectedAt
        delete existing.disconnectedAt;
        return { ok: true, player: existing };
      }
      return { ok: false, code: 'NAME_TAKEN', message: `"${trimmed}" is already taken.` };
    }

    const player: ConnectedPlayer = { socketId, displayName: trimmed };
    this.bySocketId.set(socketId, player);
    this.byName.set(trimmed.toLowerCase(), player);
    return { ok: true, player };
  }

  markDisconnected(socketId: string): void {
    const player = this.bySocketId.get(socketId);
    if (player) {
      player.disconnectedAt = Date.now();
      // Keep in byName so reconnect check works; remove after window expires
      setTimeout(() => {
        const current = this.byName.get(player.displayName.toLowerCase());
        if (current?.socketId === socketId) {
          this.bySocketId.delete(socketId);
          this.byName.delete(player.displayName.toLowerCase());
        }
      }, RECONNECT_WINDOW_MS);
    }
  }

  removePlayer(socketId: string): void {
    const player = this.bySocketId.get(socketId);
    if (player) {
      this.bySocketId.delete(socketId);
      this.byName.delete(player.displayName.toLowerCase());
    }
  }

  getBySocketId(socketId: string): ConnectedPlayer | undefined {
    return this.bySocketId.get(socketId);
  }

  getByName(name: string): ConnectedPlayer | undefined {
    return this.byName.get(name.toLowerCase());
  }

  getWaitingPlayers(): ConnectedPlayer[] {
    return Array.from(this.bySocketId.values()).filter((p) => !p.battleId && !p.disconnectedAt);
  }
}
