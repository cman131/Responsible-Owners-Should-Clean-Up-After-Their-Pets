import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pokemonMatchesQuery, moveMatchesQuery, itemMatchesQuery, filterItemsQuery, registerAdminHandlers } from '../handlers/adminHandlers.js';
import { IMPLEMENTED_ITEM_IDS } from '../../engine/items.js';
import type { PokemonSpecies, Move, HeldItem, BattleState } from '@poke-fighter/shared';
import { AppDatabase } from '../../db/Database.js';

const makeMove = (overrides: Partial<Move> = {}): Move => ({
  id: 'flamethrower',
  name: 'Flamethrower',
  type: 'Fire',
  category: 'special',
  basePower: 90,
  accuracy: 100,
  pp: 15,
  priority: 0,
  target: 'normal',
  makesContact: false,
  ...overrides,
});

const makeItem = (overrides: Partial<HeldItem> = {}): HeldItem => ({
  id: 'leftovers',
  name: 'Leftovers',
  effectId: 'leftovers',
  isBerry: false,
  equippable: true,
  ...overrides,
});

describe('moveMatchesQuery', () => {
  it('matches by move id (case-insensitive)', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'flame')).toBe(true);
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'FLAME')).toBe(true);
  });

  it('matches by move name', () => {
    expect(moveMatchesQuery(makeMove({ name: 'Flamethrower' }), 'thrower')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower', name: 'Flamethrower' }), 'tackle')).toBe(false);
  });
});

describe('filterItemsQuery', () => {
  const equippableItem = makeItem({ id: 'leftovers', name: 'Leftovers', equippable: true });
  const nonEquippableItem = makeItem({ id: 'potion', name: 'Potion', equippable: false });

  it('returns all items when equippableOnly is not set', () => {
    expect(filterItemsQuery([equippableItem, nonEquippableItem], {})).toHaveLength(2);
  });

  it('returns only items with equippable: true when equippableOnly is true', () => {
    const results = filterItemsQuery([equippableItem, nonEquippableItem], { equippableOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('leftovers');
  });

  it('filters by query on top of equippableOnly', () => {
    const band = makeItem({ id: 'choiceband', name: 'Choice Band', equippable: true });
    const results = filterItemsQuery([equippableItem, nonEquippableItem, band], { equippableOnly: true, query: 'choice' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('choiceband');
  });

  it('returns empty when equippableOnly is false equivalent (undefined)', () => {
    expect(filterItemsQuery([], {})).toHaveLength(0);
  });

  it('excludes species-restricted items when speciesName does not match', () => {
    const abomasite = makeItem({ id: 'abomasite', name: 'Abomasite', equippable: true, speciesRestriction: 'abomasnow' });
    const results = filterItemsQuery([equippableItem, abomasite], { speciesName: 'charizard' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('leftovers');
  });

  it('includes species-restricted items when speciesName matches', () => {
    const abomasite = makeItem({ id: 'abomasite', name: 'Abomasite', equippable: true, speciesRestriction: 'abomasnow' });
    const results = filterItemsQuery([equippableItem, abomasite], { speciesName: 'abomasnow' });
    expect(results).toHaveLength(2);
  });

  it('includes species-restricted items when no speciesName is given', () => {
    const abomasite = makeItem({ id: 'abomasite', name: 'Abomasite', equippable: true, speciesRestriction: 'abomasnow' });
    const results = filterItemsQuery([equippableItem, abomasite], {});
    expect(results).toHaveLength(2);
  });
});

describe('itemMatchesQuery', () => {
  it('matches by item id (case-insensitive)', () => {
    expect(itemMatchesQuery(makeItem({ id: 'leftovers' }), 'left')).toBe(true);
    expect(itemMatchesQuery(makeItem({ id: 'leftovers' }), 'LEFT')).toBe(true);
  });

  it('matches by item name', () => {
    expect(itemMatchesQuery(makeItem({ name: 'Choice Band' }), 'band')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(itemMatchesQuery(makeItem({ id: 'leftovers', name: 'Leftovers' }), 'sash')).toBe(false);
  });
});

const makeSpecies = (overrides: Partial<PokemonSpecies>): PokemonSpecies => ({
  id: 1,
  name: 'bulbasaur',
  displayName: 'Bulbasaur',
  types: ['Grass'],
  baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  abilities: { 0: 'Overgrow' },
  baseExpYield: 64,
  expGrowth: 'MediumSlow',
  learnset: [],
  evolutionStage: 1,
  weightkg: 6.9,
  ...overrides,
});

describe('pokemonMatchesQuery', () => {
  it('matches by internal name (case-insensitive)', () => {
    const charmander = makeSpecies({ name: 'charmander', displayName: 'Charmander' });
    expect(pokemonMatchesQuery(charmander, 'char')).toBe(true);
    expect(pokemonMatchesQuery(charmander, 'Char')).toBe(true);
  });

  it('matches by displayName with special characters', () => {
    const nidoranF = makeSpecies({ id: 29, name: 'nidoranf', displayName: 'Nidoran-F' });
    expect(pokemonMatchesQuery(nidoranF, 'nidoran-f')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'Nidoran-F')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'nidoran')).toBe(true);
  });

  it('matches by dex number', () => {
    expect(pokemonMatchesQuery(makeSpecies({ id: 6 }), '6')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(pokemonMatchesQuery(makeSpecies({ name: 'bulbasaur', displayName: 'Bulbasaur' }), 'xyz')).toBe(false);
  });
});

describe('registerAdminHandlers – battles:connect', () => {
  function makeAdminSocket(id = 'admin1') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, vi.fn());
  });

  afterEach(() => { db.close(); });

  it('joins the battle room socket channel', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.join).toHaveBeenCalledWith('battle:b1');
  });

  it('sets watchingBattleId on socket.data', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.data['watchingBattleId']).toBe('b1');
  });

  it('leaves previous battle room before joining new one', () => {
    socket.data['watchingBattleId'] = 'old-battle';
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'new-battle' } });
    expect(socket.leave).toHaveBeenCalledWith('battle:old-battle');
    expect(socket.join).toHaveBeenCalledWith('battle:new-battle');
  });

  it('does not call leave when no previous battle was watched', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.leave).not.toHaveBeenCalled();
  });

  it('emits battle:history with empty turns for a battle with no history', () => {
    const makeBattleState = (): BattleState => ({
      battleId: 'b1', label: 'Test', turnNumber: 0, phase: 'action' as const,
      teams: [
        { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
        { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'B', isNpc: true,  isSpectator: false, party: [], activePokemonIndex: 0 }] },
      ],
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0,tailwind:0,safeguard:0,mist:0,luckychant:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0,tailwind:0,safeguard:0,mist:0,luckychant:0}], trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0 },
    });
    db.battles.insert(makeBattleState());
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [] });
  });

  it('emits battle:history with accumulated turns', () => {
    const makeBattleState = (): BattleState => ({
      battleId: 'b1', label: 'Test', turnNumber: 0, phase: 'action' as const,
      teams: [
        { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
        { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'B', isNpc: true,  isSpectator: false, party: [], activePokemonIndex: 0 }] },
      ],
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0,tailwind:0,safeguard:0,mist:0,luckychant:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0,tailwind:0,safeguard:0,mist:0,luckychant:0}], trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0 },
    });
    db.battles.insert(makeBattleState());
    const turn = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
    db.battles.appendTurnEvents('b1', turn);
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [turn] });
  });
});

describe('registerAdminHandlers – data:query items', () => {
  function makeAdminSocket(id = 'admin-items') {
    const handlers: Record<string, (p: unknown) => void | Promise<void>> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void | Promise<void>) { handlers[event] = handler; },
      async trigger(event: string, payload: unknown) { await handlers[event]?.(payload); },
    };
  }

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, vi.fn());
  });

  afterEach(() => { db.close(); });

  it('emits only implemented items for items resource', async () => {
    await socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items' } });

    expect(socket.emit).toHaveBeenCalledWith('data:results', expect.objectContaining({ resource: 'items' }));

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: any[]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.length).toBeGreaterThan(0);
    // Every result must be an implemented item (name-normalises to an IMPLEMENTED_ITEM_IDS key)
    for (const item of payload.results) {
      const normByName = item.name.toLowerCase().replace(/\s+/g, '-');
      expect(IMPLEMENTED_ITEM_IDS.has(normByName)).toBe(true);
    }
  });

  it('filters items by query string', async () => {
    await socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items', query: 'choice' } });

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: any[]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.every((i) => i.name.toLowerCase().includes('choice') || i.id.toLowerCase().includes('choice'))).toBe(true);
  });
});

describe('registerAdminHandlers – cancel-battle', () => {
  function makeAdminSocket(id = 'admin1') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;
  const mockCancelRoom = vi.fn();

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    mockCancelRoom.mockClear();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, mockCancelRoom);
  });

  afterEach(() => { db.close(); });

  it('calls cancelRoom with the battleId', () => {
    socket.trigger('admin:action', { type: 'cancel-battle', data: { battleId: 'b1' } });
    expect(mockCancelRoom).toHaveBeenCalledWith('b1');
  });

  it('does not call cancelRoom when battleId is missing', () => {
    socket.trigger('admin:action', { type: 'cancel-battle', data: {} });
    expect(mockCancelRoom).not.toHaveBeenCalled();
  });
});

describe('registerAdminHandlers – registry:save-player item validation', () => {
  function makeAdminSocket(id = 'admin-save') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, vi.fn());
  });

  afterEach(() => { db.close(); });

  const makeMinimalSet = (heldItem?: string): import('@poke-fighter/shared').PokemonSet => ({
    speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy',
    moves: ['tackle', '', '', ''],
    ability: 'Overgrow',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    ...(heldItem ? { heldItem } : {}),
  });

  it('saves the profile when all held items are within inventory limits', () => {
    const profile: import('@poke-fighter/shared').PlayerProfile = {
      profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01T00:00:00Z',
      inventory: { 'leftovers': 1 },
      bank: [],
      defaultTeam: { templateId: 't1', name: "Ash's Team", createdAt: '2026-01-01T00:00:00Z', pokemon: [makeMinimalSet('leftovers')] },
    };
    socket.trigger('admin:action', { type: 'registry:save-player', data: { profile } });
    expect(socket.emit).toHaveBeenCalledWith('registry:data', expect.objectContaining({ resource: 'players' }));
  });

  it('emits registry:error when a held item count exceeds inventory', () => {
    const profile: import('@poke-fighter/shared').PlayerProfile = {
      profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01T00:00:00Z',
      inventory: { 'choice-band': 1 },
      bank: [makeMinimalSet('choice-band')],
      defaultTeam: { templateId: 't1', name: "Ash's Team", createdAt: '2026-01-01T00:00:00Z', pokemon: [makeMinimalSet('choice-band')] },
    };
    socket.trigger('admin:action', { type: 'registry:save-player', data: { profile } });
    expect(socket.emit).toHaveBeenCalledWith('registry:error', expect.objectContaining({
      type: 'registry:save-player',
      message: expect.stringContaining('choice-band'),
    }));
  });

  it('does not save to DB when item count exceeds inventory', () => {
    const profile: import('@poke-fighter/shared').PlayerProfile = {
      profileId: 'p2', displayName: 'Misty', createdAt: '2026-01-01T00:00:00Z',
      inventory: { 'choice-band': 1 },
      bank: [makeMinimalSet('choice-band'), makeMinimalSet('choice-band')],
    };
    socket.trigger('admin:action', { type: 'registry:save-player', data: { profile } });
    const saved = db.players.list();
    expect(saved.find((p) => p.profileId === 'p2')).toBeUndefined();
  });

  it('saves successfully when a pokemon with no held item is in team', () => {
    const profile: import('@poke-fighter/shared').PlayerProfile = {
      profileId: 'p3', displayName: 'Brock', createdAt: '2026-01-01T00:00:00Z',
      inventory: {},
      bank: [],
      defaultTeam: { templateId: 't1', name: "Brock's Team", createdAt: '2026-01-01T00:00:00Z', pokemon: [makeMinimalSet()] },
    };
    socket.trigger('admin:action', { type: 'registry:save-player', data: { profile } });
    expect(socket.emit).toHaveBeenCalledWith('registry:data', expect.objectContaining({ resource: 'players' }));
    expect(socket.emit).not.toHaveBeenCalledWith('registry:error', expect.anything());
  });
});

describe('registerAdminHandlers – submit-default-action', () => {
  function makeAdminSocket(id = 'admin-sda') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  it('calls submitDefaultAction on the room for the given slotId', () => {
    const mockRoom = { submitDefaultAction: vi.fn(() => ({ ok: true })) };
    const getRoom = vi.fn((_id: string) => mockRoom as any);

    const socket = makeAdminSocket();
    const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
    const db = new AppDatabase(':memory:');

    registerAdminHandlers(socket as any, mockIo, getRoom, vi.fn(), db, { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any, vi.fn());

    socket.trigger('admin:action', {
      type: 'submit-default-action',
      data: { battleId: 'b1', slotId: 'slot-a1' },
    });

    expect(getRoom).toHaveBeenCalledWith('b1');
    expect(mockRoom.submitDefaultAction).toHaveBeenCalledWith('slot-a1');

    db.close();
  });
});
