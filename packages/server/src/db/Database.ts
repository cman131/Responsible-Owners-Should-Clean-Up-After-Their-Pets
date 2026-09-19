import Database from 'better-sqlite3';
import type { PlayerProfile, NpcProfile, TeamTemplate, BattleState, BattleSummary, PokemonSet, TurnResolveEvent } from '@poke-fighter/shared';

class PlayersStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  list(): PlayerProfile[] {
    const rows = this.db.prepare('SELECT * FROM players').all() as Array<{
      profileId: string; displayName: string; createdAt: string;
      defaultTeam: string | null; bank: string | null; inventory: string | null;
      playerKey: string | null;
    }>;
    return rows.map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName,
      createdAt: r.createdAt,
      ...(r.playerKey !== null ? { playerKey: r.playerKey } : {}),
      ...(r.defaultTeam !== null ? { defaultTeam: JSON.parse(r.defaultTeam) as TeamTemplate } : {}),
      ...(r.bank !== null ? { bank: JSON.parse(r.bank) as PokemonSet[] } : {}),
      ...(r.inventory !== null ? { inventory: JSON.parse(r.inventory) as Record<string, number> } : {}),
    }));
  }

  save(profile: PlayerProfile): void {
    this.db.prepare(`
      INSERT INTO players (profileId, displayName, createdAt, defaultTeam, bank, inventory, playerKey)
      VALUES (@profileId, @displayName, @createdAt, @defaultTeam, @bank, @inventory, @playerKey)
      ON CONFLICT(profileId) DO UPDATE SET
        displayName = excluded.displayName,
        defaultTeam = excluded.defaultTeam,
        bank        = excluded.bank,
        inventory   = excluded.inventory,
        playerKey   = excluded.playerKey
    `).run({
      profileId: profile.profileId,
      displayName: profile.displayName,
      createdAt: profile.createdAt,
      defaultTeam: profile.defaultTeam !== undefined ? JSON.stringify(profile.defaultTeam) : null,
      bank: profile.bank !== undefined ? JSON.stringify(profile.bank) : null,
      inventory: profile.inventory !== undefined ? JSON.stringify(profile.inventory) : null,
      playerKey: profile.playerKey ?? null,
    });
  }

  delete(profileId: string): void {
    this.db.prepare('DELETE FROM players WHERE profileId = ?').run(profileId);
  }
}

class NpcsStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  list(): NpcProfile[] {
    const rows = this.db.prepare('SELECT * FROM npcs').all() as Array<{
      profileId: string; name: string; createdAt: string; team: string;
    }>;
    return rows.map((r) => ({
      profileId: r.profileId,
      name: r.name,
      createdAt: r.createdAt,
      team: JSON.parse(r.team) as TeamTemplate,
    }));
  }

  save(profile: NpcProfile): void {
    this.db.prepare(`
      INSERT INTO npcs (profileId, name, createdAt, team)
      VALUES (@profileId, @name, @createdAt, @team)
      ON CONFLICT(profileId) DO UPDATE SET
        name = excluded.name,
        team = excluded.team
    `).run({
      profileId: profile.profileId,
      name: profile.name,
      createdAt: profile.createdAt,
      team: JSON.stringify(profile.team),
    });
  }

  delete(profileId: string): void {
    this.db.prepare('DELETE FROM npcs WHERE profileId = ?').run(profileId);
  }
}

class TeamsStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  list(): TeamTemplate[] {
    const rows = this.db.prepare('SELECT * FROM teams').all() as Array<{
      templateId: string; name: string; createdAt: string; pokemon: string;
    }>;
    return rows.map((r) => ({
      templateId: r.templateId,
      name: r.name,
      createdAt: r.createdAt,
      pokemon: JSON.parse(r.pokemon) as PokemonSet[],
    }));
  }

  save(template: TeamTemplate): void {
    this.db.prepare(`
      INSERT INTO teams (templateId, name, createdAt, pokemon)
      VALUES (@templateId, @name, @createdAt, @pokemon)
      ON CONFLICT(templateId) DO UPDATE SET
        name    = excluded.name,
        pokemon = excluded.pokemon
    `).run({
      templateId: template.templateId,
      name: template.name,
      createdAt: template.createdAt,
      pokemon: JSON.stringify(template.pokemon),
    });
  }

  delete(templateId: string): void {
    this.db.prepare('DELETE FROM teams WHERE templateId = ?').run(templateId);
  }
}

class BattlesStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  insert(state: BattleState): void {
    const teamsSummary = state.teams.map((team) => ({
      teamId: team.teamId,
      slots: team.slots.map((s) => ({ displayName: s.displayName, isNpc: s.isNpc })),
    }));
    this.db.prepare(`
      INSERT INTO battles
        (battleId, label, status, winningTeamId, startedAt, endedAt, turnNumber, teamsSummary, initialState, currentState)
      VALUES
        (@battleId, @label, 'active', NULL, @startedAt, NULL, @turnNumber, @teamsSummary, @initialState, @currentState)
    `).run({
      battleId: state.battleId,
      label: state.label,
      startedAt: Date.now(),
      turnNumber: state.turnNumber,
      teamsSummary: JSON.stringify(teamsSummary),
      initialState: JSON.stringify(state),
      currentState: JSON.stringify(state),
    });
  }

  updateState(battleId: string, state: BattleState): void {
    this.db.prepare(`
      UPDATE battles SET currentState = @currentState, turnNumber = @turnNumber WHERE battleId = @battleId
    `).run({ battleId, currentState: JSON.stringify(state), turnNumber: state.turnNumber });
  }

  markEnded(battleId: string, winningTeamId: string | null): void {
    this.db.prepare(`
      UPDATE battles SET status = 'ended', winningTeamId = @winningTeamId, endedAt = @endedAt WHERE battleId = @battleId
    `).run({ battleId, winningTeamId, endedAt: Date.now() });
  }

  list(): BattleSummary[] {
    const rows = this.db.prepare(`
      SELECT battleId, label, status, winningTeamId, startedAt, endedAt, turnNumber, teamsSummary
      FROM battles ORDER BY startedAt DESC
    `).all() as Array<{
      battleId: string; label: string; status: 'active' | 'ended';
      winningTeamId: string | null; startedAt: number; endedAt: number | null;
      turnNumber: number; teamsSummary: string;
    }>;
    return rows.map((r) => ({
      battleId: r.battleId,
      label: r.label,
      status: r.status,
      winningTeamId: r.winningTeamId,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      turnNumber: r.turnNumber,
      teams: JSON.parse(r.teamsSummary) as BattleSummary['teams'],
    }));
  }

  get(battleId: string): BattleState | null {
    const row = this.db.prepare('SELECT currentState FROM battles WHERE battleId = ?').get(battleId) as
      { currentState: string } | undefined;
    return row ? JSON.parse(row.currentState) as BattleState : null;
  }

  getEventLog(battleId: string): Array<{ turnNumber: number; events: TurnResolveEvent[] }> {
    const row = this.db.prepare('SELECT eventLog FROM battles WHERE battleId = ?').get(battleId) as
      { eventLog: string } | undefined;
    if (!row) return [];
    return JSON.parse(row.eventLog) as Array<{ turnNumber: number; events: TurnResolveEvent[] }>;
  }

  appendTurnEvents(battleId: string, turn: { turnNumber: number; events: TurnResolveEvent[] }): void {
    const current = this.getEventLog(battleId);
    current.push(turn);
    this.db.prepare('UPDATE battles SET eventLog = @eventLog WHERE battleId = @battleId')
      .run({ battleId, eventLog: JSON.stringify(current) });
  }
}

export class AppDatabase {
  private readonly conn: InstanceType<typeof Database>;
  readonly players: PlayersStore;
  readonly npcs: NpcsStore;
  readonly teams: TeamsStore;
  readonly battles: BattlesStore;

  constructor(dbPath: string) {
    this.conn = new Database(dbPath);
    this.conn.pragma('journal_mode = WAL');
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS players (
        profileId    TEXT PRIMARY KEY,
        displayName  TEXT NOT NULL,
        createdAt    TEXT NOT NULL,
        defaultTeam  TEXT,
        bank         TEXT
      );
      CREATE TABLE IF NOT EXISTS npcs (
        profileId  TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        createdAt  TEXT NOT NULL,
        team       TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS teams (
        templateId  TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        createdAt   TEXT NOT NULL,
        pokemon     TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS battles (
        battleId       TEXT PRIMARY KEY,
        label          TEXT NOT NULL,
        status         TEXT NOT NULL CHECK(status IN ('active', 'ended')),
        winningTeamId  TEXT,
        startedAt      INTEGER NOT NULL,
        endedAt        INTEGER,
        turnNumber     INTEGER NOT NULL DEFAULT 0,
        teamsSummary   TEXT NOT NULL,
        initialState   TEXT NOT NULL,
        currentState   TEXT NOT NULL
      );
    `);
    try {
      this.conn.exec(`ALTER TABLE battles ADD COLUMN eventLog TEXT NOT NULL DEFAULT '[]'`);
    } catch {
      // column already exists — safe to ignore
    }
    try {
      this.conn.exec(`ALTER TABLE players ADD COLUMN inventory TEXT`);
    } catch {
      // column already exists — safe to ignore
    }
    try {
      this.conn.exec(`ALTER TABLE players ADD COLUMN playerKey TEXT`);
    } catch {
      // column already exists — safe to ignore
    }
    this.players = new PlayersStore(this.conn);
    this.npcs = new NpcsStore(this.conn);
    this.teams = new TeamsStore(this.conn);
    this.battles = new BattlesStore(this.conn);
  }

  close(): void {
    this.conn.close();
  }
}
