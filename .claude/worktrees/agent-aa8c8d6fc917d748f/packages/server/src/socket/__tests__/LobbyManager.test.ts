import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager, computeSlotStatus } from '../LobbyManager.js';

describe('LobbyManager', () => {
  let lobby: LobbyManager;

  beforeEach(() => { lobby = new LobbyManager(); });

  it('registers a player and returns their record', () => {
    const result = lobby.registerPlayer('socket-1', 'Alice');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.player.displayName).toBe('Alice');
  });

  it('rejects duplicate display names', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    const result = lobby.registerPlayer('socket-2', 'Alice');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NAME_TAKEN');
  });

  it('rejects empty display names', () => {
    const result = lobby.registerPlayer('socket-1', '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_NAME');
  });

  it('rejects names longer than 20 characters', () => {
    const result = lobby.registerPlayer('socket-1', 'a'.repeat(21));
    expect(result.ok).toBe(false);
  });

  it('removes player on disconnect', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    lobby.removePlayer('socket-1');
    const result = lobby.registerPlayer('socket-2', 'Alice'); // should now succeed
    expect(result.ok).toBe(true);
  });

  it('allows reconnect within 2-minute window (new socketId takes over the name)', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    lobby.markDisconnected('socket-1');
    // Within the reconnect window, a new socket claiming the same name is treated as a reconnect
    const result = lobby.registerPlayer('socket-2', 'Alice');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.player.displayName).toBe('Alice');
      expect(result.player.socketId).toBe('socket-2');
    }
  });
});

describe('computeSlotStatus', () => {
  it('returns available when player is undefined', () => {
    expect(computeSlotStatus(undefined)).toBe('available');
  });

  it('returns reconnectable when player has disconnectedAt set', () => {
    const player = { socketId: 's1', displayName: 'Alice', disconnectedAt: Date.now() };
    expect(computeSlotStatus(player)).toBe('reconnectable');
  });

  it('returns occupied when player exists with no disconnectedAt', () => {
    const player = { socketId: 's1', displayName: 'Alice' };
    expect(computeSlotStatus(player)).toBe('occupied');
  });
});
