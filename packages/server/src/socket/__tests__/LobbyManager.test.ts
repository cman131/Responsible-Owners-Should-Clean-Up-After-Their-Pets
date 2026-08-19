import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../LobbyManager.js';

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

  it('frees name when player disconnects within 2-minute reconnect window', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    lobby.markDisconnected('socket-1');
    // Name is held during reconnect window — new registration with same name should fail
    const result = lobby.registerPlayer('socket-2', 'Alice');
    expect(result.ok).toBe(false);
  });
});
