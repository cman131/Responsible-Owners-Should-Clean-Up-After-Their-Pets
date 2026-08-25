import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../Database.js';
import type { PlayerProfile, NpcProfile, TeamTemplate, BattleState } from '@poke-fighter/shared';

const makePlayer = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  profileId: 'p1',
  displayName: 'Conor',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeNpc = (overrides: Partial<NpcProfile> = {}): NpcProfile => ({
  profileId: 'n1',
  name: 'Ash',
  createdAt: '2026-01-01T00:00:00.000Z',
  team: {
    templateId: 't1',
    name: 'Ash Team',
    pokemon: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  ...overrides,
});

const makeTeam = (overrides: Partial<TeamTemplate> = {}): TeamTemplate => ({
  templateId: 'tm1',
  name: 'Fire Team',
  pokemon: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeBattleState = (overrides: Partial<BattleState> = {}): BattleState => ({
  battleId: 'b1',
  label: 'Test Battle',
  turnNumber: 0,
  phase: 'action',
  teams: [
    { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Conor', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
    { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Ash', isNpc: true, isSpectator: false, party: [], activePokemonIndex: 0 }] },
  ],
  field: {
    sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ],
    trickroom: 0,
    gravity: 0,
  },
  ...overrides,
});

describe('AppDatabase.players', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('returns empty array when no players exist', () => {
    expect(db.players.list()).toEqual([]);
  });

  it('saves and lists a player', () => {
    const player = makePlayer();
    db.players.save(player);
    expect(db.players.list()).toEqual([player]);
  });

  it('upserts an existing player', () => {
    db.players.save(makePlayer({ displayName: 'Conor' }));
    db.players.save(makePlayer({ displayName: 'Conor Updated' }));
    expect(db.players.list()).toHaveLength(1);
    expect(db.players.list()[0]!.displayName).toBe('Conor Updated');
  });

  it('deletes a player', () => {
    db.players.save(makePlayer());
    db.players.delete('p1');
    expect(db.players.list()).toEqual([]);
  });

  it('round-trips optional defaultTeam and bank', () => {
    const team = makeTeam();
    const player = makePlayer({ defaultTeam: team, bank: [] });
    db.players.save(player);
    expect(db.players.list()[0]).toEqual(player);
  });
});

describe('AppDatabase.npcs', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('saves and lists an NPC', () => {
    const npc = makeNpc();
    db.npcs.save(npc);
    expect(db.npcs.list()).toEqual([npc]);
  });

  it('upserts an existing NPC', () => {
    db.npcs.save(makeNpc({ name: 'Ash' }));
    db.npcs.save(makeNpc({ name: 'Ash Updated' }));
    expect(db.npcs.list()).toHaveLength(1);
    expect(db.npcs.list()[0]!.name).toBe('Ash Updated');
  });

  it('deletes an NPC', () => {
    db.npcs.save(makeNpc());
    db.npcs.delete('n1');
    expect(db.npcs.list()).toEqual([]);
  });
});

describe('AppDatabase.teams', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('saves and lists a team template', () => {
    const team = makeTeam();
    db.teams.save(team);
    expect(db.teams.list()).toEqual([team]);
  });

  it('deletes a team template', () => {
    db.teams.save(makeTeam());
    db.teams.delete('tm1');
    expect(db.teams.list()).toEqual([]);
  });
});

describe('AppDatabase.battles', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('inserts a battle with status active', () => {
    db.battles.insert(makeBattleState());
    const summaries = db.battles.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.battleId).toBe('b1');
    expect(summaries[0]!.status).toBe('active');
    expect(summaries[0]!.winningTeamId).toBeNull();
    expect(summaries[0]!.endedAt).toBeNull();
  });

  it('list returns team slot summaries without full state', () => {
    db.battles.insert(makeBattleState());
    const summary = db.battles.list()[0]!;
    expect(summary.teams).toEqual([
      { slots: [{ displayName: 'Conor', isNpc: false }] },
      { slots: [{ displayName: 'Ash', isNpc: true }] },
    ]);
    expect(summary).not.toHaveProperty('currentState');
    expect(summary).not.toHaveProperty('initialState');
  });

  it('updateState updates currentState and turnNumber', () => {
    db.battles.insert(makeBattleState());
    db.battles.updateState('b1', makeBattleState({ turnNumber: 3 }));
    expect(db.battles.list()[0]!.turnNumber).toBe(3);
  });

  it('markEnded sets status ended with winningTeamId', () => {
    db.battles.insert(makeBattleState());
    db.battles.markEnded('b1', 'team-a');
    const summary = db.battles.list()[0]!;
    expect(summary.status).toBe('ended');
    expect(summary.winningTeamId).toBe('team-a');
    expect(summary.endedAt).toBeTypeOf('number');
  });

  it('get returns current BattleState', () => {
    const state = makeBattleState();
    db.battles.insert(state);
    const retrieved = db.battles.get('b1');
    expect(retrieved?.battleId).toBe('b1');
  });

  it('get returns null for unknown battleId', () => {
    expect(db.battles.get('nonexistent')).toBeNull();
  });
});
