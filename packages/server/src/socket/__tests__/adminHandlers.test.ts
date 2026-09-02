import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pokemonMatchesQuery, moveMatchesQuery, itemMatchesQuery, registerAdminHandlers } from '../handlers/adminHandlers.js';
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
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby);
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
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0}], trickroom: 0, gravity: 0 },
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
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0}], trickroom: 0, gravity: 0 },
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
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby);
  });

  afterEach(() => { db.close(); });

  it('emits only implemented items for items resource', async () => {
    await socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items' } });

    expect(socket.emit).toHaveBeenCalledWith('data:results', expect.objectContaining({ resource: 'items' }));

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: [string]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.length).toBeGreaterThan(0);
    // Every result must be an implemented item (name-normalises to an IMPLEMENTED_ITEM_IDS key)
    for (const item of payload.results) {
      const normByName = item.name.toLowerCase().replace(/\s+/g, '-');
      expect(['leftovers', 'choice-band', 'choice-specs', 'choice-scarf', 'assault-vest',
        'life-orb', 'black-sludge', 'eviolite', 'scope-lens', 'razor-claw', 'light-clay',
        'big-root', 'rocky-helmet', 'sitrus-berry', 'lum-berry', 'salac-berry', 'petaya-berry',
        'liechi-berry', 'ganlon-berry', 'apicot-berry', 'focus-sash', 'air-balloon',
        'weakness-policy',
      ]).toContain(normByName);
    }
  });

  it('filters items by query string', async () => {
    await socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items', query: 'choice' } });

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: [string]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.every((i) => i.name.toLowerCase().includes('choice') || i.id.toLowerCase().includes('choice'))).toBe(true);
  });
});
