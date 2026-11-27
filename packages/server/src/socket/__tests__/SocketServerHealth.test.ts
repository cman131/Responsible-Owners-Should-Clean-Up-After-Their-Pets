import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect } from 'socket.io-client';
import { SocketServer } from '../SocketServer.js';
import { BattleConfigurator } from '../../setup/BattleConfigurator.js';
import { prepareBattleTeams } from '../../setup/battleStart.js';
import type { PokemonSet } from '@poke-fighter/shared';

const set: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, ability: 'blaze', nature: 'timid',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
};

let dir: string;
let server: any;
let httpServer: ReturnType<typeof createServer>;

beforeEach(() => {
  // SocketServer opens its database under process.cwd()
  dir = mkdtempSync(join(tmpdir(), 'poke-server-'));
  mkdirSync(join(dir, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  httpServer = createServer();
  server = new SocketServer(httpServer, { adminToken: 'secret' });
  server.db.players.save({
    profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01',
    defaultTeam: { templateId: 't', name: 'T', createdAt: '2026-01-01', pokemon: [{ ...set, pokemonId: 'a' }] },
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
  server.db.close();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function startRoom() {
  const prepared = prepareBattleTeams(server.db, [
    { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, profileId: 'p1', party: [] }] },
    { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [set] }] },
  ], () => false);
  if (!prepared.ok) { throw new Error(prepared.message); }
  const state = new BattleConfigurator().build({ battleId: 'x', label: 'x', teams: prepared.teams });
  server.db.battles.insert(state);
  const room = server.startBattle(state);
  room.getState().teams[0]!.slots[0]!.party[0]!.currentHp = 42;
  return room;
}

const savedHp = () => server.db.conditions.getForProfile('p1').get('a')?.currentHp;

describe('SocketServer health lifecycle', () => {
  it('saves condition after a win', () => {
    startRoom().forceFaint('b1');
    expect(savedHp()).toBe(42);
    expect(server.isPlayerInBattle('p1')).toBe(false);
  });

  it('saves the pre-forfeit condition', () => {
    startRoom().forfeit('team-a');
    expect(savedHp()).toBe(42);
  });

  it('saves nothing when cancelled', () => {
    startRoom();
    expect(server.isPlayerInBattle('p1')).toBe(true);
    server.cancelBattle('x');
    expect(savedHp()).toBeUndefined();
    expect(server.isPlayerInBattle('p1')).toBe(false);
  });

  it('still ends the battle when saving fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(server.db.conditions, 'saveMany').mockImplementation(() => { throw new Error('disk full'); });
    startRoom().forfeit('team-a');
    expect(server.isPlayerInBattle('p1')).toBe(false);
    expect(server.db.battles.list()[0].status).toBe('ended');
  });

  it('ignores heal requests from non-admins', async () => {
    server.db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition: { currentHp: 0, maxHp: 153, ppUsed: {} } }]);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const client = connect(`http://localhost:${(httpServer.address() as AddressInfo).port}`);
    const reply = new Promise<{ message: string }>((resolve) => client.on('admin:error', resolve));

    client.emit('admin:action', { type: 'registry:heal-player', data: { profileId: 'p1' } });

    expect((await reply).message).toBe('Unauthorized');
    expect(savedHp()).toBe(0);
    client.disconnect();
  });
});
