import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAdminHandlers } from '../handlers/adminHandlers.js';
import { AppDatabase } from '../../db/Database.js';
import type { PokemonSet } from '@poke-fighter/shared';

const set: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, ability: 'blaze', nature: 'timid',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
};

let db: AppDatabase;
let handler: (payload: unknown) => Promise<void>;
const socket = { data: {}, emit: vi.fn(), join: vi.fn(), leave: vi.fn(), on: vi.fn() };
const startBattle = vi.fn();
const health = { isInBattle: vi.fn((_profileId: string) => false), publish: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  health.isInBattle.mockReturnValue(false);
  socket.on.mockImplementation((_event: string, h: any) => { handler = h; });
  db = new AppDatabase(':memory:');
  db.players.save({
    profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01',
    defaultTeam: { templateId: 't', name: 'T', createdAt: '2026-01-01', pokemon: [{ ...set, pokemonId: 'a' }] },
  });
  registerAdminHandlers(socket as any, {} as any, () => undefined, startBattle, db, {} as any, vi.fn(), health);
});
afterEach(() => { db.close(); });

const faint = () => db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition: { currentHp: 0, maxHp: 153, ppUsed: {} } }]);
const start = () => handler({ type: 'start-battle', data: { battleId: 'x', label: 'x', teams: [
  { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, profileId: 'p1', party: [] }] },
  { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [set] }] },
] } });

describe('admin health actions', () => {
  it('heals and publishes', async () => {
    faint();
    await handler({ type: 'registry:heal-player', data: { profileId: 'p1', pokemonId: 'a' } });
    expect(db.conditions.getForProfile('p1').size).toBe(0);
    expect(health.publish).toHaveBeenCalledWith('p1');
  });

  it('refuses healing during a battle with registry:error', async () => {
    faint();
    health.isInBattle.mockReturnValue(true);
    await handler({ type: 'registry:heal-player', data: { profileId: 'p1' } });
    expect(db.conditions.getForProfile('p1').size).toBe(1);
    expect(socket.emit).toHaveBeenCalledWith('registry:error', expect.objectContaining({ type: 'registry:heal-player' }));
    expect(socket.emit).not.toHaveBeenCalledWith('admin:error', expect.anything());
  });

  it('answers a health request', async () => {
    await handler({ type: 'registry:player-health', data: { profileId: 'p1' } });
    expect(socket.emit).toHaveBeenCalledWith('player:health', expect.objectContaining({ profileId: 'p1', inBattle: false }));
  });

  it('starts a battle and reports success', async () => {
    await start();
    expect(startBattle).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('admin:start-result', { battleId: 'x', ok: true });
  });

  it('reports why a battle cannot start', async () => {
    faint();
    await start();
    expect(startBattle).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('admin:start-result', expect.objectContaining({ ok: false, message: expect.stringContaining('no usable') }));
  });
});
