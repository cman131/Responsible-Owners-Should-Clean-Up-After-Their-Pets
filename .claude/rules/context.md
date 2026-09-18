# context.md - Project Architecture & Domain Context

## What This Project Does

Poke Fighter is a real-time Pokémon battle simulator. Players connect via WebSocket, join a lobby, and are placed into battles configured by an admin. The server runs an authoritative battle engine; clients receive state snapshots and render the battle UI. NPC slots are controlled through the admin panel rather than automated AI.

## Core Domain Concepts

**BattleState** — the complete, serializable state of one battle at a point in time. Includes two `TeamState`s (each with `SlotState`s), a `FieldState` (weather, terrain, field effects), and the current phase. All game decisions are derived from this object.

**SlotState / PartyMember** — a slot is one player's position in a battle; a party member is one Pokémon in that slot's roster. `PartyMember` holds computed stats (not base stats), current HP, PP, volatile statuses, stat boosts, and every other per-Pokémon runtime value. `speciesName` is the Pokémon Showdown internal name (e.g. `'charizard'`), used for sprite URLs.

**TurnResolveEvent** — a discriminated union describing one thing that happened during turn resolution (damage dealt, status applied, faint, etc.). The client receives the full event list each turn and uses it to drive battle-log text and animations.

**MoveEffectRegistry** — a string→handler map keyed by move effect ID. `BattleEngine` looks up an effect ID from the move data and dispatches to the registered handler. Effect IDs are not move IDs — multiple moves can share an effect ID.

**BattleRoom** — not a socket.io room (though it uses one). It is the stateful wrapper around `BattleEngine` that buffers pending actions until all slots have submitted, then calls `resolveTurn`.

**LobbyManager** — tracks connected players who are not yet in a battle: their display name, socket ID, and (once in a battle) their slot assignment.

**DataLoader** — loads all static game data (species, moves, abilities, items, type chart) from `/data/*.json` at startup. The engine calls it to look up move data, ability hooks, item hooks, etc.

**PokemonSet** — the input format for building a party member: species ID, level, moves, ability, item, nature, IVs, EVs, tera type. `BattleConfigurator` converts a `PokemonSet[]` into live `PartyMember[]` with computed stats.

## Architecture Reference

The three packages and their dependency graph:

```
@poke-fighter/shared  ←  @poke-fighter/server
                      ←  @poke-fighter/client
```

`shared` must be built before `server` or `client`. It exports all shared types, Zod schemas, and the typed Socket.io event maps (`ServerToClientEvents`, `ClientToServerEvents`).

### Server data flow per turn

```
socket 'action:submit' → BattleRoom.submitAction()
  → all slots submitted → BattleEngine.resolveTurn(state, actions)
    → returns { newState, events }
  → BattleRoom fires onTurnResolved callback
    → SocketServer emits 'turn:resolve' to battle room
    → Database.battles.appendTurnEvents()
```

### Client state flow

`BattleContext` subscribes to Socket.io events and maintains:
- `battleState: BattleState` — current snapshot
- `pendingRequest: ActionRequestPayload | null` — what the local player needs to decide
- `playbackQueue: PlaybackEntry[]` — animation/log entries derived from turn events
- `battleLog: LogEntry[]` — human-readable history

## Authentication & Authorization

Two connection types:
- **Admin**: passes `{ token: ADMIN_TOKEN }` in socket handshake `auth`. Gets full admin event access (`admin:action`, `npc:action-request`). `ADMIN_TOKEN` is loaded from `.env`.
- **Player**: connects without a token. Gets battle events for their assigned slot only.

`ADMIN_TOKEN` is required for the server to start. If it is missing, admin features are disabled and a console error is emitted.

## Key Configuration Files

- `.env` — `PORT` (default 3000) and `ADMIN_TOKEN`. Copy from `.env.example`.
- `pnpm-workspace.yaml` — defines workspace packages: `packages/*` and `data/scripts`.
- `tsconfig.base.json` — shared compiler options (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `NodeNext` modules).
- `/data/*.json` — static game data loaded at runtime. `data/poke-fighter.db` is the SQLite database (created at startup if missing).

## Data Store

SQLite via `better-sqlite3`. File path: `data/poke-fighter.db` (relative to server process cwd). Three tables: `players` (player profiles + teams), `npcs` (NPC profiles + teams), `battles` (battle records + event log). The database is write-through: state is persisted after each turn and on battle end. It is never read during turn resolution — only by the admin panel and lobby reconnection logic.
