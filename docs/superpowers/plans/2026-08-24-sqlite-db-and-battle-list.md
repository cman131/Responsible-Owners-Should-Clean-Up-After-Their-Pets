# SQLite Database Layer + Admin Battle List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the file-based `RegistryStore` with a unified SQLite `AppDatabase`, persist battle history and active state, and add a Battles panel to the admin UI.

**Architecture:** A single `AppDatabase` class (wrapping `better-sqlite3`) owns all four tables: players, npcs, teams, battles. `SocketServer` constructs `AppDatabase`, wires battle persistence into its room lifecycle hooks, and passes `db` to admin handlers. The admin UI gains a Battles tile on the Hub and a new `BattlesPanel` that lists active and past battles with a WATCH action.

**Tech Stack:** `better-sqlite3` (synchronous SQLite), Vitest (tests), React (client components), Socket.io (events), TypeScript (strict + exactOptionalPropertyTypes).

---

## File Map

| Action | Path |
|--------|------|
| NEW | `packages/server/src/db/Database.ts` |
| NEW | `packages/server/src/db/__tests__/Database.test.ts` |
| NEW | `packages/client/src/admin/BattlesPanel.tsx` |
| DELETE | `packages/server/src/registry/RegistryStore.ts` |
| DELETE | `packages/server/src/registry/__tests__/RegistryStore.test.ts` |
| MODIFY | `packages/shared/src/types/events.ts` |
| MODIFY | `packages/server/src/socket/SocketServer.ts` |
| MODIFY | `packages/server/src/socket/handlers/adminHandlers.ts` |
| MODIFY | `packages/client/src/admin/AdminRouter.tsx` |
| MODIFY | `packages/client/src/admin/HubPanel.tsx` |
| MODIFY | `packages/client/src/admin/ControlPanel.tsx` |

---

## Task 1: Install better-sqlite3

**Files:**
- Modify: `packages/server/package.json` (via pnpm)

- [ ] **Step 1: Install the package and its types**

```bash
pnpm --filter @poke-fighter/server add better-sqlite3
pnpm --filter @poke-fighter/server add -D @types/better-sqlite3
```

Expected: both packages appear in `packages/server/package.json` dependencies.

> Note: `better-sqlite3` is a native addon compiled from C++. If the install fails with a build error, you may need `windows-build-tools` or Visual Studio Build Tools installed. On most modern Windows setups with Node this works out of the box.

- [ ] **Step 2: Verify import resolves**

Create a throwaway file `packages/server/src/db/_check.ts`:
```ts
import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.close();
```

Run:
```bash
pnpm --filter @poke-fighter/server exec tsx src/db/_check.ts
```

Expected: no output, exit 0. Then delete `_check.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "chore(server): add better-sqlite3 dependency"
```

---

## Task 2: Add BattleSummary type and new events to shared

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add `BattleSummary` interface and new event types**

In `packages/shared/src/types/events.ts`, make the following changes:

Add `BattleSummary` export after the `LobbyErrorPayload` interface (before the event map section):

```ts
export interface BattleSummary {
  battleId: string;
  label: string;
  status: 'active' | 'ended';
  winningTeamId: string | null;
  startedAt: number;
  endedAt: number | null;
  turnNumber: number;
  teams: Array<{
    slots: Array<{ displayName: string; isNpc: boolean }>;
  }>;
}
```

Add `'battles:list'` and `'battles:connect'` to `AdminActionPayload.type`:

```ts
export interface AdminActionPayload {
  type:
    | 'npc-action'
    | 'pause'
    | 'unpause'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
    | 'lobby:list'
    | 'battles:list'
    | 'battles:connect'
    | 'registry:list'
    | 'registry:save-player'
    | 'registry:delete-player'
    | 'registry:save-npc'
    | 'registry:delete-npc'
    | 'registry:save-team'
    | 'registry:delete-team'
    | 'start-battle'
    | 'data:query';
  data: Record<string, unknown>;
}
```

Add `'battles:data'` to `ServerToClientEvents` (after the `'lobby:players'` line):

```ts
'battles:data': (payload: { battles: BattleSummary[] }) => void;
```

- [ ] **Step 2: Build shared to update dist**

```bash
cd packages/shared && pnpm build
```

Expected: no TypeScript errors, `dist/` updated.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts packages/shared/dist
git commit -m "feat(shared): add BattleSummary type and battle socket events"
```

---

## Task 3: Implement AppDatabase (TDD)

**Files:**
- Create: `packages/server/src/db/Database.ts`
- Create: `packages/server/src/db/__tests__/Database.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/db/__tests__/Database.test.ts`:

```ts
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
  turnTimerSeconds: 60,
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server exec vitest run src/db/__tests__/Database.test.ts
```

Expected: all tests fail with "Cannot find module '../Database.js'".

- [ ] **Step 3: Implement AppDatabase**

Create `packages/server/src/db/Database.ts`:

```ts
import Database from 'better-sqlite3';
import type { PlayerProfile, NpcProfile, TeamTemplate, BattleState, BattleSummary } from '@poke-fighter/shared';

class PlayersStore {
  constructor(private readonly db: InstanceType<typeof Database>) {}

  list(): PlayerProfile[] {
    const rows = this.db.prepare('SELECT * FROM players').all() as Array<{
      profileId: string; displayName: string; createdAt: string;
      defaultTeam: string | null; bank: string | null;
    }>;
    return rows.map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName,
      createdAt: r.createdAt,
      ...(r.defaultTeam !== null ? { defaultTeam: JSON.parse(r.defaultTeam) as TeamTemplate } : {}),
      ...(r.bank !== null ? { bank: JSON.parse(r.bank) as import('@poke-fighter/shared').PokemonSet[] } : {}),
    }));
  }

  save(profile: PlayerProfile): void {
    this.db.prepare(`
      INSERT INTO players (profileId, displayName, createdAt, defaultTeam, bank)
      VALUES (@profileId, @displayName, @createdAt, @defaultTeam, @bank)
      ON CONFLICT(profileId) DO UPDATE SET
        displayName = excluded.displayName,
        defaultTeam = excluded.defaultTeam,
        bank        = excluded.bank
    `).run({
      profileId: profile.profileId,
      displayName: profile.displayName,
      createdAt: profile.createdAt,
      defaultTeam: profile.defaultTeam !== undefined ? JSON.stringify(profile.defaultTeam) : null,
      bank: profile.bank !== undefined ? JSON.stringify(profile.bank) : null,
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
      pokemon: JSON.parse(r.pokemon) as import('@poke-fighter/shared').PokemonSet[],
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

  markEnded(battleId: string, winningTeamId: string): void {
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
    this.players = new PlayersStore(this.conn);
    this.npcs = new NpcsStore(this.conn);
    this.teams = new TeamsStore(this.conn);
    this.battles = new BattlesStore(this.conn);
  }

  close(): void {
    this.conn.close();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @poke-fighter/server exec vitest run src/db/__tests__/Database.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/
git commit -m "feat(server): implement AppDatabase with SQLite via better-sqlite3"
```

---

## Task 4: Replace RegistryStore with AppDatabase

**Files:**
- Modify: `packages/server/src/socket/SocketServer.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Delete: `packages/server/src/registry/RegistryStore.ts`
- Delete: `packages/server/src/registry/__tests__/RegistryStore.test.ts`

- [ ] **Step 1: Update adminHandlers.ts**

Replace the entire file `packages/server/src/socket/handlers/adminHandlers.ts` with:

```ts
import type { Socket, Server } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move,
} from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { LobbyManager } from '../LobbyManager.js';
import type { AppDatabase } from '../../db/Database.js';

export function pokemonMatchesQuery(s: PokemonSpecies, query: string): boolean {
  const q = query.toLowerCase();
  return s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || String(s.id).includes(q);
}

export function moveMatchesQuery(m: Move, query: string): boolean {
  const q = query.toLowerCase();
  return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
}

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom,
  db: AppDatabase,
  lobby: LobbyManager
): void {
  socket.on('admin:action', async (payload: AdminActionPayload) => {
    switch (payload.type) {
      case 'npc-action': {
        const { battleId, slotId, action } = payload.data as { battleId: string; slotId: string; action: MoveAction | SwitchAction };
        const room = getRoom(battleId);
        room?.submitAction(slotId, action);
        break;
      }
      case 'pause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.pause();
        const state = getRoom(battleId)?.getState();
        if (state) io.to(`battle:${battleId}`).emit('state:sync', state);
        break;
      }
      case 'unpause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.unpause();
        break;
      }
      case 'start-battle': {
        const { battleId, label, turnTimerSeconds, teams } = payload.data as {
          battleId: string; label: string; turnTimerSeconds: number;
          teams: [{ slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }, { slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }];
        };
        const { BattleConfigurator } = await import('../../setup/BattleConfigurator.js');
        const configurator = new BattleConfigurator();
        const state = configurator.build({ battleId, label, turnTimerSeconds, teams });
        db.battles.insert(state);
        startBattle(state);
        break;
      }
      case 'battles:list': {
        socket.emit('battles:data', { battles: db.battles.list() });
        break;
      }
      case 'battles:connect': {
        const { battleId } = payload.data as { battleId: string };
        const state = db.battles.get(battleId);
        if (state) socket.emit('state:sync', state);
        break;
      }
      case 'data:query': {
        try {
          const { resource } = payload.data as { resource: 'pokemon' | 'moves' };
          const { DataLoader } = await import('../../data/loader.js');
          const data = new DataLoader();
          let results: unknown[];
          switch (resource) {
            case 'pokemon': {
              const { query } = payload.data as { query?: string };
              results = data.getAllSpecies().filter((s) => !query || pokemonMatchesQuery(s, query)).slice(0, 30);
              break;
            }
            case 'moves': {
              const { speciesId, query: moveQuery } = payload.data as { speciesId?: number; query?: string };
              if (speciesId !== undefined) {
                const species = data.getSpecies(speciesId);
                results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
              } else if (moveQuery) {
                results = data.getAllMoves().filter((m) => moveMatchesQuery(m, moveQuery)).slice(0, 30);
              } else {
                results = [];
              }
              break;
            }
            default:
              results = [];
          }
          socket.emit('data:results', { resource, results });
        } catch (err) {
          console.error('[data:query] handler error:', err);
        }
        break;
      }
      case 'force-faint': {
        const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
        if (typeof battleId === 'string' && typeof slotId === 'string') {
          getRoom(battleId)?.forceFaint(slotId);
        }
        break;
      }
      case 'forfeit': {
        const { battleId, teamId } = payload.data as { battleId: string; teamId: string };
        if (typeof battleId === 'string' && typeof teamId === 'string') {
          getRoom(battleId)?.forfeit(teamId);
        }
        break;
      }
      case 'lobby:list': {
        const players = lobby.getWaitingPlayers().map((p) => p.displayName);
        socket.emit('lobby:players', players);
        break;
      }
      case 'force-switch':
        break;
      case 'registry:list': {
        const { resource } = payload.data as { resource: 'players' | 'npcs' | 'teams' };
        const data = resource === 'players' ? db.players.list()
          : resource === 'npcs' ? db.npcs.list()
          : db.teams.list();
        socket.emit('registry:data', { resource, data });
        break;
      }
      case 'registry:save-player': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').PlayerProfile };
        db.players.save(profile);
        socket.emit('registry:data', { resource: 'players', data: db.players.list() });
        break;
      }
      case 'registry:delete-player': {
        const { profileId } = payload.data as { profileId: string };
        db.players.delete(profileId);
        socket.emit('registry:data', { resource: 'players', data: db.players.list() });
        break;
      }
      case 'registry:save-npc': {
        const { profile } = payload.data as { profile: import('@poke-fighter/shared').NpcProfile };
        db.npcs.save(profile);
        socket.emit('registry:data', { resource: 'npcs', data: db.npcs.list() });
        break;
      }
      case 'registry:delete-npc': {
        const { profileId } = payload.data as { profileId: string };
        db.npcs.delete(profileId);
        socket.emit('registry:data', { resource: 'npcs', data: db.npcs.list() });
        break;
      }
      case 'registry:save-team': {
        const { template } = payload.data as { template: import('@poke-fighter/shared').TeamTemplate };
        db.teams.save(template);
        socket.emit('registry:data', { resource: 'teams', data: db.teams.list() });
        break;
      }
      case 'registry:delete-team': {
        const { templateId } = payload.data as { templateId: string };
        db.teams.delete(templateId);
        socket.emit('registry:data', { resource: 'teams', data: db.teams.list() });
        break;
      }
    }
  });
}
```

- [ ] **Step 2: Update SocketServer.ts**

Replace the entire file `packages/server/src/socket/SocketServer.ts` with:

```ts
import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, BattleState, SlotState } from '@poke-fighter/shared';
import { LobbyManager } from './LobbyManager.js';
import { BattleRoom } from './BattleRoom.js';
import { registerLobbyHandlers } from './handlers/lobbyHandlers.js';
import { registerBattleHandlers } from './handlers/battleHandlers.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { AppDatabase } from '../db/Database.js';

interface SocketServerOptions { adminToken: string }

export class SocketServer {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly lobby = new LobbyManager();
  private readonly rooms = new Map<string, BattleRoom>();
  private readonly db: AppDatabase;

  constructor(httpServer: HttpServer, { adminToken }: SocketServerOptions) {
    this.io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    this.db = new AppDatabase(join(process.cwd(), 'data/poke-fighter.db'));

    this.io.use((socket, next) => {
      const token = socket.handshake.auth['token'] as string | undefined;
      if (token && token === adminToken) {
        socket.data['isAdmin'] = true;
      }
      next();
    });

    this.io.on('connection', (socket) => {
      console.log(`Connected: ${socket.id} (admin=${socket.data['isAdmin'] ?? false})`);

      const notifyAdminsOfLobby = () => {
        const players = this.lobby.getWaitingPlayers().map((p) => p.displayName);
        for (const s of this.io.sockets.sockets.values()) {
          if (s.data['isAdmin']) s.emit('lobby:players', players);
        }
      };
      registerLobbyHandlers(socket, this.lobby, (id) => this.rooms.get(id), notifyAdminsOfLobby);
      registerBattleHandlers(socket, this.lobby, (id) => this.rooms.get(id));
      if (socket.data['isAdmin']) {
        registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this), this.db, this.lobby);
        socket.emit('admin:authenticated');
      } else {
        const providedToken = socket.handshake.auth['token'] as string | undefined;
        if (providedToken) {
          socket.emit('admin:error', { message: 'Invalid admin token' });
        }
        socket.on('admin:action', () => {
          socket.emit('admin:error', { message: 'Unauthorized' });
        });
      }

      socket.on('disconnect', () => {
        const player = this.lobby.getBySocketId(socket.id);
        if (player) {
          console.log(`Disconnected: ${player.displayName}`);
          this.lobby.markDisconnected(socket.id);
        }
      });
    });
  }

  private notifyAdminsOfBattles(): void {
    const summaries = this.db.battles.list();
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data['isAdmin']) s.emit('battles:data', { battles: summaries });
    }
  }

  startBattle(initialState: BattleState): BattleRoom {
    const room = new BattleRoom({ initialState: structuredClone(initialState), timerSeconds: initialState.turnTimerSeconds });
    this.rooms.set(initialState.battleId, room);

    for (const team of initialState.teams) {
      for (const slot of team.slots) {
        if (slot.isNpc || slot.isSpectator) continue;
        const player = this.lobby.getByName(slot.displayName);
        if (player) {
          player.battleSlotId = slot.slotId;
          player.battleId = initialState.battleId;
        }
      }
    }

    for (const team of initialState.teams) {
      for (const slot of team.slots) {
        if (slot.isSpectator) continue;
        const player = this.lobby.getBySlotId(slot.slotId);
        if (!player) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        socket?.join(`battle:${initialState.battleId}`);
      }
    }

    this.io.to(`battle:${initialState.battleId}`).emit('battle:start', { state: initialState });
    this.notifyAdminsOfBattles();

    room.onTurnResolved((events, newState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
        turnNumber: newState.turnNumber,
        events,
        state: newState,
      });
      this.db.battles.updateState(initialState.battleId, newState);
      this.notifyAdminsOfBattles();
    });

    room.onExpAward((awards) => {
      this.io.to(`battle:${initialState.battleId}`).emit('exp:award', { awards });
    });

    room.onLevelUp((result, newStats) => {
      this.io.to(`battle:${initialState.battleId}`).emit('level:up', {
        instanceId: result.instanceId,
        newLevel: result.newLevel,
        newStats,
      });
    });

    room.onBattleEnd((winningTeamId, finalState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
      this.db.battles.markEnded(initialState.battleId, winningTeamId);
      this.rooms.delete(initialState.battleId);
      this.notifyAdminsOfBattles();
    });

    room.onSwitchRequest((slots: SlotState[]) => {
      for (const slot of slots) {
        const player = this.lobby.getBySlotId(slot.slotId);
        if (!player) continue;
        const availableParty = slot.party.filter((p, i) => i !== slot.activePokemonIndex && !p.fainted);
        this.io.to(player.socketId).emit('switch:request', {
          slotId: slot.slotId,
          party: availableParty,
          reason: 'faint',
        });
      }
    });

    room.onNpcActionRequired((slots) => {
      const adminSockets = [...this.io.sockets.sockets.values()].filter((s) => s.data['isAdmin'] === true);
      for (const adminSocket of adminSockets) {
        adminSocket.emit('npc:action-request', { battleId: initialState.battleId, slots });
      }
    });

    return room;
  }
}
```

- [ ] **Step 3: Delete RegistryStore and its test file**

```bash
rm packages/server/src/registry/RegistryStore.ts
rm packages/server/src/registry/__tests__/RegistryStore.test.ts
```

If the `__tests__` directory is now empty, remove it too:
```bash
rmdir packages/server/src/registry/__tests__ 2>/dev/null || true
rmdir packages/server/src/registry 2>/dev/null || true
```

- [ ] **Step 4: Run all server tests to confirm nothing regressed**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass (including `Database.test.ts`). The deleted `RegistryStore.test.ts` no longer runs.

- [ ] **Step 5: TypeScript check**

```bash
cd packages/shared && pnpm build && cd ../.. && pnpm --filter @poke-fighter/server exec tsc --noEmit
```

Expected: only pre-existing errors (`exp.test.ts` and `BattleConfigurator.ts` `nickname` issues) — no new errors from the registry/db swap.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/SocketServer.ts packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/db/
git rm packages/server/src/registry/RegistryStore.ts packages/server/src/registry/__tests__/RegistryStore.test.ts
git commit -m "feat(server): replace RegistryStore with AppDatabase, add battle persistence"
```

---

## Task 5: Add onBack prop to ControlPanel

**Files:**
- Modify: `packages/client/src/admin/ControlPanel.tsx`

The `ControlPanel` currently renders with no back button and no `onBack` prop. Admin navigation now needs to return to `BattlesPanel`.

- [ ] **Step 1: Add `onBack` to ControlPanel**

In `packages/client/src/admin/ControlPanel.tsx`, update the `Props` interface and both the inner and outer component:

```tsx
interface Props { battleId: string; onBack: () => void }

function ControlPanelInner({ battleId, onBack }: Props) {
  // ... existing state and effects unchanged ...

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', gap: 16, padding: 16 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>← BATTLES</button>
          <div style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW — {battleId}</div>
        </div>
        <BattleCanvas
          state={state}
          mySlotId="__admin__"
          targetingMoveIndex={null}
          legalTargets={[]}
          onTargetSelected={() => {}}
          onCancelTargeting={() => {}}
        />
        <TurnLog messages={turnLog} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={togglePause} style={{ ...btnStyle, background: paused ? '#27ae60' : '#e67e22' }}>
            {paused ? 'UNPAUSE' : 'PAUSE'}
          </button>
          <button onClick={() => handleForfeit('team-a')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM B</button>
        </div>
      </div>
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <NpcActionPanel battleId={battleId} npcRequests={npcRequests} />
      </div>
    </div>
  );
}

export function ControlPanel({ battleId, onBack }: Props) {
  return (
    <BattleProvider mySlotId="__admin__">
      <ControlPanelInner battleId={battleId} onBack={onBack} />
    </BattleProvider>
  );
}
```

- [ ] **Step 2: TypeScript check on client**

```bash
pnpm --filter @poke-fighter/client exec tsc --noEmit
```

Expected: errors about `onBack` missing in `AdminRouter` (which we'll fix in Task 7) — that's fine for now.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/admin/ControlPanel.tsx
git commit -m "feat(admin): add onBack prop to ControlPanel for battles navigation"
```

---

## Task 6: Build BattlesPanel component

**Files:**
- Create: `packages/client/src/admin/BattlesPanel.tsx`

- [ ] **Step 1: Create BattlesPanel.tsx**

Create `packages/client/src/admin/BattlesPanel.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { BattleSummary } from '@poke-fighter/shared';

interface Props {
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function BattlesPanel({ onBack, onWatch }: Props) {
  const [battles, setBattles] = useState<BattleSummary[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'battles:list', data: {} } as any);

    const onData = (payload: { battles: BattleSummary[] }) => setBattles(payload.battles);
    socket.on('battles:data' as any, onData);
    return () => { socket.off('battles:data' as any, onData); };
  }, []);

  const active = battles.filter((b) => b.status === 'active');
  const past = battles.filter((b) => b.status === 'ended');

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← HUB</button>
          <h1 style={{ color: '#3498db', letterSpacing: 4, fontSize: 22 }}>BATTLES</h1>
          <div style={{ width: 60 }} />
        </div>

        {battles.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', marginTop: 64 }}>
            No battles yet. Start one from Battle Setup.
          </p>
        )}

        {active.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={sectionLabel}>Active — {active.length}</div>
            {active.map((b) => <ActiveRow key={b.battleId} battle={b} onWatch={onWatch} />)}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <div style={sectionLabel}>Past — {past.length}</div>
            {past.map((b) => <PastRow key={b.battleId} battle={b} />)}
          </section>
        )}
      </div>
    </div>
  );
}

function participantSummary(teams: BattleSummary['teams']): string {
  return teams.map((t) => t.slots.map((s) => s.displayName).join(' & ')).join(' vs ');
}

function winnerLabel(battle: BattleSummary): string {
  if (!battle.winningTeamId) return '—';
  const teamIndex = battle.winningTeamId === 'team-a' ? 0 : 1;
  const team = battle.teams[teamIndex];
  return team ? team.slots.map((s) => s.displayName).join(' & ') : battle.winningTeamId;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActiveRow({ battle, onWatch }: { battle: BattleSummary; onWatch: (id: string) => void }) {
  return (
    <div style={{ background: '#0d1a12', border: '1px solid #27ae60', borderRadius: 4, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{battle.label}</div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>{participantSummary(battle.teams)}</div>
        <div style={{ color: '#27ae60', fontSize: 11, marginTop: 3 }}>● Turn {battle.turnNumber}</div>
      </div>
      <button onClick={() => onWatch(battle.battleId)} style={watchBtn}>WATCH</button>
    </div>
  );
}

function PastRow({ battle }: { battle: BattleSummary }) {
  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: '10px 16px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#ccc', fontWeight: 'bold', fontSize: 13 }}>{battle.label}</div>
        <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{participantSummary(battle.teams)}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: '#f0c040', fontSize: 12 }}>Winner: {winnerLabel(battle)}</div>
        <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
          {battle.startedAt ? formatDate(battle.startedAt) : ''} · {battle.turnNumber} turns
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const watchBtn: React.CSSProperties = { background: '#27ae60', color: '#000', border: 'none', padding: '6px 16px', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
const sectionLabel: React.CSSProperties = { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 };
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/admin/BattlesPanel.tsx
git commit -m "feat(admin): add BattlesPanel with active and past battle lists"
```

---

## Task 7: Update AdminRouter and HubPanel

**Files:**
- Modify: `packages/client/src/admin/AdminRouter.tsx`
- Modify: `packages/client/src/admin/HubPanel.tsx`

- [ ] **Step 1: Rewrite AdminRouter.tsx**

Replace the entire file `packages/client/src/admin/AdminRouter.tsx`:

```tsx
import { useState } from 'react';
import { getSocket } from '../socket.js';
import { HubPanel } from './HubPanel.js';
import { SetupPanel } from './SetupPanel.js';
import { RegistryPanel } from './RegistryPanel.js';
import { ControlPanel } from './ControlPanel.js';
import { BattlesPanel } from './BattlesPanel.js';

type Mode = 'setup' | 'registry' | 'battles' | null;

export function AdminRouter() {
  const [mode, setMode] = useState<Mode>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  function handleWatch(battleId: string) {
    getSocket().emit('admin:action', { type: 'battles:connect', data: { battleId } } as any);
    setActiveBattle(battleId);
  }

  if (activeBattle) {
    return <ControlPanel battleId={activeBattle} onBack={() => setActiveBattle(null)} />;
  }
  if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} />;
  if (mode === 'registry') return <RegistryPanel onBack={() => setMode(null)} />;
  if (mode === 'battles') return <BattlesPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
  return (
    <HubPanel
      onSetup={() => setMode('setup')}
      onRegistry={() => setMode('registry')}
      onBattles={() => setMode('battles')}
    />
  );
}
```

Note: the `battle:start` auto-jump listener is removed. Battles now appear in the `BattlesPanel` list via the server push on battle start.

- [ ] **Step 2: Update HubPanel.tsx**

Replace the entire file `packages/client/src/admin/HubPanel.tsx`:

```tsx
interface HubPanelProps {
  onSetup: () => void;
  onBattles: () => void;
  onRegistry: () => void;
}

export function HubPanel({ onSetup, onBattles, onRegistry }: HubPanelProps) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <h1 style={{ fontSize: 32, letterSpacing: 6, color: '#e74c3c' }}>ADMIN</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        <button onClick={onSetup} style={tile('#e74c3c')}>
          <div style={{ fontSize: 32 }}>⚔</div>
          <div style={{ color: '#e74c3c', letterSpacing: 2, fontSize: 13 }}>BATTLE SETUP</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Start a new battle</div>
        </button>
        <button onClick={onBattles} style={tile('#3498db')}>
          <div style={{ fontSize: 32 }}>📋</div>
          <div style={{ color: '#3498db', letterSpacing: 2, fontSize: 13 }}>BATTLES</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Active & history</div>
        </button>
        <button onClick={onRegistry} style={tile('#27ae60')}>
          <div style={{ fontSize: 32 }}>👤</div>
          <div style={{ color: '#27ae60', letterSpacing: 2, fontSize: 13 }}>REGISTRY</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Manage NPCs & Players</div>
        </button>
      </div>
    </div>
  );
}

function tile(accent: string): React.CSSProperties {
  return {
    background: '#111', border: `2px solid ${accent}`, borderRadius: 8,
    padding: '32px 40px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', width: 180,
  };
}
```

- [ ] **Step 3: TypeScript check on client**

```bash
pnpm --filter @poke-fighter/client exec tsc --noEmit
```

Expected: only pre-existing errors (`PokemonSlotEditor.tsx` type narrowing) — no new errors.

- [ ] **Step 4: Update AdminShell tests if broken**

If `packages/client/src/admin/__tests__/AdminShell.test.tsx` mocks `HubPanel` and passes it props, update the mock or test to include `onBattles`. Run:

```bash
pnpm --filter @poke-fighter/client test
```

Fix any test failures by adding `onBattles={vi.fn()}` to test renders of `HubPanel`.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/AdminRouter.tsx packages/client/src/admin/HubPanel.tsx
git commit -m "feat(admin): add Battles hub tile and navigate to BattlesPanel with WATCH support"
```

---

## Task 8: Final verification

- [ ] **Step 1: Build shared**

```bash
cd packages/shared && pnpm build
```

Expected: no errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all tests pass across all packages.

- [ ] **Step 3: TypeScript check all packages**

```bash
pnpm typecheck
```

Expected: only the two pre-existing errors (`exp.test.ts` nickname, `BattleConfigurator.ts` nickname) — nothing new.

- [ ] **Step 4: Start dev server and manually verify**

```bash
pnpm dev
```

Open the admin panel and verify:
1. Hub shows three tiles: BATTLE SETUP, BATTLES, REGISTRY
2. Clicking BATTLES opens BattlesPanel with "No battles yet" message
3. Start a battle via BATTLE SETUP — admin stays on hub (no auto-jump)
4. Navigate to BATTLES — new battle appears in Active list with WATCH button
5. Click WATCH — ControlPanel opens with battle state and a ← BATTLES back button
6. Back button returns to BattlesPanel
7. After battle ends — it moves from Active to Past section with winner displayed

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: SQLite database layer and admin battle list complete"
```
