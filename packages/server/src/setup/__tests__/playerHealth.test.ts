import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../../db/Database.js';
import { buildPlayerHealth, healPlayer, saveBattleConditions, getOwnerProfileIds } from '../playerHealth.js';
import { prepareBattleTeams, type StartTeams } from '../battleStart.js';
import { BattleConfigurator } from '../BattleConfigurator.js';
import type { PokemonSet } from '@poke-fighter/shared';

const set: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, ability: 'blaze', nature: 'timid',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
};
const fainted = { currentHp: 0, maxHp: 153, ppUsed: {} };

let db: AppDatabase;
beforeEach(() => {
  db = new AppDatabase(':memory:');
  db.players.save({
    profileId: 'p1', displayName: 'Ash', createdAt: '2026-01-01',
    defaultTeam: { templateId: 't', name: 'T', createdAt: '2026-01-01', pokemon: [{ ...set, pokemonId: 'a' }] },
    bank: [{ ...set, pokemonId: 'b' }],
  });
});
afterEach(() => { db.close(); });

const teams = (second: { isNpc: boolean; profileId?: string } = { isNpc: true }): StartTeams => [
  { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, profileId: 'p1', party: [] }] },
  { slots: [{ slotId: 'b1', displayName: 'Other', party: [set], ...second }] },
];

describe('buildPlayerHealth and healPlayer', () => {
  it('reports team and bank with saved condition applied', () => {
    db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition: fainted }]);
    const health = buildPlayerHealth(db, 'p1', false);
    expect(health.pokemon.map((p) => [p.pokemonId, p.currentHp])).toEqual([['a', 0], ['b', 153]]);
  });

  it('heals one Pokémon or all of them', () => {
    db.conditions.saveMany(['a', 'b'].map((pokemonId) => ({ profileId: 'p1', pokemonId, condition: fainted })));
    expect(healPlayer(db, 'p1', 'a', false)).toEqual({ ok: true });
    expect([...db.conditions.getForProfile('p1').keys()]).toEqual(['b']);
    expect(healPlayer(db, 'p1', undefined, false)).toEqual({ ok: true });
    expect(db.conditions.getForProfile('p1').size).toBe(0);
  });

  it('refuses during a battle and for unknown targets', () => {
    db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition: fainted }]);
    expect(healPlayer(db, 'p1', 'a', true).ok).toBe(false);
    expect(healPlayer(db, 'p1', 'zzz', false).ok).toBe(false);
    expect(healPlayer(db, 'nobody', undefined, false).ok).toBe(false);
    expect(db.conditions.getForProfile('p1').size).toBe(1);
  });
});

describe('prepareBattleTeams', () => {
  it('loads the saved team instead of the party sent by the client', () => {
    const result = prepareBattleTeams(db, teams(), () => false);
    expect(result.ok && result.teams[0].slots[0]!.party.map((p) => p.pokemonId)).toEqual(['a']);
  });

  it('refuses a fully fainted team', () => {
    db.conditions.saveMany([{ profileId: 'p1', pokemonId: 'a', condition: fainted }]);
    expect(prepareBattleTeams(db, teams(), () => false)).toMatchObject({ ok: false, message: expect.stringContaining('no usable') });
  });

  it('refuses a player already in a battle', () => {
    expect(prepareBattleTeams(db, teams(), () => true)).toMatchObject({ ok: false, message: expect.stringContaining('already in a battle') });
  });

  it('refuses a player in two slots', () => {
    expect(prepareBattleTeams(db, teams({ isNpc: false, profileId: 'p1' }), () => false))
      .toMatchObject({ ok: false, message: expect.stringContaining('more than one slot') });
  });

  it('refuses a deleted player', () => {
    db.players.delete('p1');
    expect(prepareBattleTeams(db, teams(), () => false).ok).toBe(false);
  });
});

describe('saveBattleConditions', () => {
  it('saves tracked player Pokémon only', () => {
    const prepared = prepareBattleTeams(db, teams(), () => false);
    if (!prepared.ok) { throw new Error(prepared.message); }
    const state = new BattleConfigurator().build({ battleId: 'x', label: 'x', teams: prepared.teams });
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 12;

    saveBattleConditions(db, state);

    expect(getOwnerProfileIds(state)).toEqual(['p1']);
    expect(db.conditions.getForProfile('p1').get('a')?.currentHp).toBe(12);
    expect(db.conditions.getForProfile('p1').size).toBe(1);
  });
});
