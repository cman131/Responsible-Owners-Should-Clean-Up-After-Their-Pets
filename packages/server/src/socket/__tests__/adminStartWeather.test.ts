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

beforeEach(() => {
  vi.clearAllMocks();
  socket.on.mockImplementation((_event: string, h: any) => { handler = h; });
  db = new AppDatabase(':memory:');
  registerAdminHandlers(socket as any, {} as any, () => undefined, startBattle, db, {} as any, vi.fn());
});
afterEach(() => { db.close(); });

const start = (extra: Record<string, unknown>) => handler({ type: 'start-battle', data: { battleId: 'x', label: 'x', teams: [
  { slots: [{ slotId: 'a1', displayName: 'Red', isNpc: true, party: [set] }] },
  { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [set] }] },
], ...extra } });

describe('start-battle with weather', () => {
  it('starts in the chosen weather and saves an opening log entry', async () => {
    await start({ weather: 'sand' });
    expect(startBattle).toHaveBeenCalledWith(expect.objectContaining({
      field: expect.objectContaining({ weather: { type: 'sand', turnsRemaining: 0, fromAbility: false, indefinite: true } }),
    }));
    expect(db.battles.getEventLog('x')).toEqual([
      { turnNumber: 0, events: [{ type: 'weather-started', data: { weather: 'sand' } }] },
    ]);
  });

  it('saves no opening entry without weather', async () => {
    await start({});
    expect(startBattle).toHaveBeenCalled();
    expect(db.battles.get('x')!.field.weather).toBeUndefined();
    expect(db.battles.getEventLog('x')).toEqual([]);
  });

  it.each(['harsh-sun', 'hail', '', null])('rejects invalid weather %j', async (weather) => {
    await start({ weather });
    expect(startBattle).not.toHaveBeenCalled();
    expect(db.battles.get('x')).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('admin:start-result', { battleId: 'x', ok: false, message: 'Unknown starting weather.' });
  });
});
