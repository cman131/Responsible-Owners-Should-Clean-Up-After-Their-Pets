import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import type { BattleJoinOption, PokemonSet } from '@poke-fighter/shared';
import { SocketServer } from '../SocketServer.js';
import { BattleConfigurator } from '../../setup/BattleConfigurator.js';

const set: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, ability: 'blaze', nature: 'timid',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
};

let dir: string;
let server: any;
let httpServer: ReturnType<typeof createServer>;
let clients: Socket[];

beforeEach(async () => {
  // SocketServer opens its database under process.cwd()
  dir = mkdtempSync(join(tmpdir(), 'poke-lobby-'));
  mkdirSync(join(dir, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  httpServer = createServer();
  server = new SocketServer(httpServer, { adminToken: 'secret' });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  clients = [];
});

afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
  server.db.close();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function start(battleId: string, playerName: string) {
  const state = new BattleConfigurator().build({
    battleId, label: battleId,
    teams: [
      { slots: [{ slotId: 'a1', displayName: playerName, isNpc: false, party: [set] }] },
      { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [set] }] },
    ],
  });
  server.db.battles.insert(state);
  return server.startBattle(state);
}

async function newClient(): Promise<Socket> {
  const client = connect(`http://localhost:${(httpServer.address() as AddressInfo).port}`, { forceNew: true });
  clients.push(client);
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  return client;
}

/** Resolves with 'joined' or the lobby error code. */
function join_(client: Socket, battleId: string): Promise<string> {
  return new Promise((resolve) => {
    client.off('state:sync').off('lobby:error');
    client.once('state:sync', () => resolve('joined'));
    client.once('lobby:error', (e: { code: string }) => resolve(e.code));
    client.emit('player:join', { battleId, slotId: 'a1' });
  });
}

function slotStatus(battleId: string): string {
  const options: BattleJoinOption[] = server.getBattleJoinOptions();
  return options.find((b) => b.battleId === battleId)!.slots[0]!.status;
}

describe('SocketServer lobby slots across battles', () => {
  it('leaves a new battle open for a player who stayed connected after the last one ended', async () => {
    const ash = await newClient();
    const first = start('one', 'Ash');
    expect(await join_(ash, 'one')).toBe('joined');
    first.forfeit('team-a');

    start('two', 'Ash');

    expect(slotStatus('two')).toBe('available');
    expect(await join_(ash, 'two')).toBe('joined');
  });

  it('lets the same player join from another connection after a battle ends', async () => {
    const oldTab = await newClient();
    const first = start('one', 'Ash');
    await join_(oldTab, 'one');
    first.forfeit('team-a');

    start('two', 'Ash');

    expect(await join_(await newClient(), 'two')).toBe('joined');
  });

  it('frees players when a battle is cancelled', async () => {
    const ash = await newClient();
    start('one', 'Ash');
    await join_(ash, 'one');
    server.cancelBattle('one');

    start('two', 'Ash');

    expect(slotStatus('two')).toBe('available');
    expect(await join_(ash, 'two')).toBe('joined');
  });

  it('sends the battle list again to a player whose battle ended', async () => {
    const ash = await newClient();
    const first = start('one', 'Ash');
    await join_(ash, 'one');
    const list = new Promise<{ battles: BattleJoinOption[] }>((resolve) => ash.once('lobby:battles', resolve));

    first.forfeit('team-a');

    expect((await list).battles).toEqual([]);
  });

  it('sends the battle list when a connected player asks for it', async () => {
    const ash = await newClient();
    start('one', 'Ash');
    // Let the pushes from connecting and starting arrive before asking
    await new Promise((resolve) => setTimeout(resolve, 100));
    const list = new Promise<{ battles: BattleJoinOption[] }>((resolve) => ash.once('lobby:battles', resolve));

    ash.emit('lobby:battles-request');

    expect((await list).battles.map((b) => b.battleId)).toEqual(['one']);
  });

  it('does not treat a slot as taken because another live battle uses the same slot ID', async () => {
    start('one', 'Ash');
    await join_(await newClient(), 'one');

    start('two', 'Misty');

    expect(slotStatus('two')).toBe('available');
    expect(await join_(await newClient(), 'two')).toBe('joined');
  });

  it('does not move a player out of a live battle when another battle lists their name', async () => {
    start('one', 'Ash');
    await join_(await newClient(), 'one');

    start('two', 'Ash');

    expect(slotStatus('one')).toBe('occupied');
    expect(slotStatus('two')).toBe('available');
  });
});
