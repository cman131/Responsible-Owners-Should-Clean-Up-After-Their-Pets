import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RegistryStore } from '../RegistryStore.js';
import type { PlayerProfile } from '@poke-fighter/shared';

const TEST_DIR = join(process.cwd(), 'test-registry-tmp');

describe('RegistryStore', () => {
  let store: RegistryStore;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new RegistryStore(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('saves and retrieves a player profile', () => {
    const profile: PlayerProfile = {
      profileId: 'p1', displayName: 'Ash',
      createdAt: new Date().toISOString(),
    };
    store.savePlayer(profile);
    const retrieved = store.getPlayer('p1');
    expect(retrieved?.displayName).toBe('Ash');
  });

  it('persists data across store instances', () => {
    store.savePlayer({ profileId: 'p2', displayName: 'Misty', createdAt: new Date().toISOString() });
    const store2 = new RegistryStore(TEST_DIR);
    expect(store2.getPlayer('p2')?.displayName).toBe('Misty');
  });

  it('deletes a player profile', () => {
    store.savePlayer({ profileId: 'p3', displayName: 'Brock', createdAt: new Date().toISOString() });
    store.deletePlayer('p3');
    expect(store.getPlayer('p3')).toBeUndefined();
  });

  it('lists all players', () => {
    store.savePlayer({ profileId: 'a', displayName: 'A', createdAt: new Date().toISOString() });
    store.savePlayer({ profileId: 'b', displayName: 'B', createdAt: new Date().toISOString() });
    expect(store.listPlayers().length).toBe(2);
  });
});
