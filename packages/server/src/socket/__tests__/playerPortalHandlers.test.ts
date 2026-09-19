import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerPlayerPortalHandlers } from '../handlers/playerPortalHandlers.js';
import { AppDatabase } from '../../db/Database.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

function makeSocket() {
  const handlers: Record<string, (p: unknown) => void | Promise<void>> = {};
  return {
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    on(event: string, handler: (p: unknown) => void | Promise<void>) { handlers[event] = handler; },
    async trigger(event: string, payload: unknown) { await handlers[event]?.(payload); },
  };
}

const makeSet = (overrides: Partial<PokemonSet> = {}): PokemonSet => ({
  speciesId: 1,
  nickname: 'Bulbasaur',
  level: 5,
  nature: 'hardy',
  moves: ['tackle', '', '', ''],
  ability: 'Overgrow',
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  ...overrides,
});

const makePlayer = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  profileId: 'p1',
  displayName: 'Ash',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('registerPlayerPortalHandlers – player:portal-auth', () => {
  let db: AppDatabase;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeSocket();
    registerPlayerPortalHandlers(socket as any, db);
  });

  afterEach(() => { db.close(); });

  it('sets portalProfileId and emits player:portal-data when key matches', async () => {
    db.players.save(makePlayer({ playerKey: 'secret-key' }));
    await socket.trigger('player:portal-auth', { playerKey: 'secret-key' });
    expect(socket.data['portalProfileId']).toBe('p1');
    expect(socket.emit).toHaveBeenCalledWith('player:portal-data', expect.objectContaining({
      profile: expect.objectContaining({ profileId: 'p1' }),
    }));
  });

  it('emits player:portal-error when no player has the given key', async () => {
    await socket.trigger('player:portal-auth', { playerKey: 'wrong-key' });
    expect(socket.data['portalProfileId']).toBeUndefined();
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('does not set portalProfileId on failed auth', async () => {
    db.players.save(makePlayer({ playerKey: 'correct' }));
    await socket.trigger('player:portal-auth', { playerKey: 'incorrect' });
    expect(socket.data['portalProfileId']).toBeUndefined();
  });

  it('replaces existing portalProfileId when re-authenticating with a different key', async () => {
    db.players.save(makePlayer({ profileId: 'p1', playerKey: 'key-a' }));
    db.players.save(makePlayer({ profileId: 'p2', playerKey: 'key-b' }));
    await socket.trigger('player:portal-auth', { playerKey: 'key-a' });
    expect(socket.data['portalProfileId']).toBe('p1');
    await socket.trigger('player:portal-auth', { playerKey: 'key-b' });
    expect(socket.data['portalProfileId']).toBe('p2');
  });
});

describe('registerPlayerPortalHandlers – player:portal-save', () => {
  let db: AppDatabase;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeSocket();
    registerPlayerPortalHandlers(socket as any, db);
  });

  afterEach(() => { db.close(); });

  it('emits player:portal-error when socket is not authenticated', async () => {
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('emits player:portal-error when profileId does not match authenticated portal', async () => {
    socket.data['portalProfileId'] = 'p2';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('saves and emits player:portal-data on valid save with no pokemon changes', async () => {
    const player = makePlayer({ defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [] } });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-data', expect.objectContaining({
      profile: expect.objectContaining({ profileId: 'p1' }),
    }));
  });

  it('allows changing heldItem and nickname on a pokemon when item is in inventory', async () => {
    const original = makeSet({ nickname: 'Old' });
    const player = makePlayer({
      defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [original] },
      inventory: { leftovers: 1 },
    });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    const updated = makeSet({ nickname: 'New', heldItem: 'leftovers' });
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [updated], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-data', expect.objectContaining({
      profile: expect.objectContaining({ profileId: 'p1' }),
    }));
    expect(socket.emit).not.toHaveBeenCalledWith('player:portal-error', expect.anything());
  });

  it('emits player:portal-error when moves are changed', async () => {
    const original = makeSet({ moves: ['tackle', '', '', ''] });
    const player = makePlayer({ defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [original] } });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    const modified = makeSet({ moves: ['scratch', '', '', ''] });
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [modified], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('emits player:portal-error when species is changed', async () => {
    const original = makeSet({ speciesId: 1 });
    const player = makePlayer({ defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [original] } });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    const modified = makeSet({ speciesId: 4 });
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [modified], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('emits player:portal-error when a new pokemon is added that was not in the existing pool', async () => {
    const player = makePlayer({ defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [] } });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [makeSet()], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('allows moving a pokemon from bank to team', async () => {
    const poke = makeSet();
    const player = makePlayer({ bank: [poke] });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [poke], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-data', expect.objectContaining({
      profile: expect.objectContaining({ profileId: 'p1' }),
    }));
    expect(socket.emit).not.toHaveBeenCalledWith('player:portal-error', expect.anything());
  });

  it('persists the updated team to the database on save', async () => {
    const original = makeSet({ nickname: 'Old' });
    const player = makePlayer({ defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [original] } });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    const updated = makeSet({ nickname: 'New' });
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [updated], bank: [] });
    const savedPlayer = db.players.list().find((p) => p.profileId === 'p1');
    expect(savedPlayer?.defaultTeam?.pokemon[0]?.nickname).toBe('New');
  });
});

describe('registerPlayerPortalHandlers – player:portal-items-query', () => {
  let db: AppDatabase;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeSocket();
    registerPlayerPortalHandlers(socket as any, db);
  });

  afterEach(() => { db.close(); });

  it('emits player:portal-items with an array of items', async () => {
    await socket.trigger('player:portal-items-query', {});
    expect(socket.emit).toHaveBeenCalledWith('player:portal-items', expect.objectContaining({
      results: expect.any(Array),
    }));
  });

  it('returns only equippable items', async () => {
    await socket.trigger('player:portal-items-query', {});
    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: string[]) => event === 'player:portal-items');
    const payload = call?.[1] as { results: { equippable: boolean }[] };
    expect(payload.results.every((i) => i.equippable)).toBe(true);
  });

  it('filters by speciesName when provided', async () => {
    await socket.trigger('player:portal-items-query', { speciesName: 'charizard' });
    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: string[]) => event === 'player:portal-items');
    const payload = call?.[1] as { results: { speciesRestriction?: string }[] };
    const speciesRestricted = payload.results.filter((i) => i.speciesRestriction !== undefined);
    expect(speciesRestricted.every((i) => i.speciesRestriction === 'charizard')).toBe(true);
  });
});

describe('registerPlayerPortalHandlers – player:portal-save leasing validation', () => {
  let db: AppDatabase;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeSocket();
    registerPlayerPortalHandlers(socket as any, db);
  });

  afterEach(() => { db.close(); });

  it('rejects save when a held item appears more times than the player owns', async () => {
    const poke1 = makeSet({ nickname: 'A', heldItem: 'leftovers' });
    const poke2 = makeSet({ nickname: 'B', speciesId: 4, heldItem: 'leftovers' });
    const player = makePlayer({
      defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [poke1, poke2] },
      inventory: { leftovers: 1 },
    });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [poke1, poke2], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('allows save when held item count equals inventory quantity', async () => {
    const poke = makeSet({ heldItem: 'leftovers' });
    const player = makePlayer({
      defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [poke] },
      inventory: { leftovers: 1 },
    });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [poke], bank: [] });
    expect(socket.emit).not.toHaveBeenCalledWith('player:portal-error', expect.anything());
    expect(socket.emit).toHaveBeenCalledWith('player:portal-data', expect.anything());
  });

  it('counts held items across team and bank combined', async () => {
    const poke1 = makeSet({ nickname: 'A', heldItem: 'focus-sash' });
    const poke2 = makeSet({ nickname: 'B', speciesId: 4, heldItem: 'focus-sash' });
    const player = makePlayer({
      defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [poke1] },
      bank: [poke2],
      inventory: { 'focus-sash': 1 },
    });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [poke1], bank: [poke2] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('rejects save when a pokemon holds an item not in inventory', async () => {
    const poke = makeSet({ heldItem: 'leftovers' });
    const player = makePlayer({
      defaultTeam: { templateId: 't1', name: 'Team', createdAt: '2026-01-01', pokemon: [poke] },
      inventory: {},
    });
    db.players.save(player);
    socket.data['portalProfileId'] = 'p1';
    await socket.trigger('player:portal-save', { profileId: 'p1', team: [poke], bank: [] });
    expect(socket.emit).toHaveBeenCalledWith('player:portal-error', expect.objectContaining({
      message: expect.any(String),
    }));
  });
});
