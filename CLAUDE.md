# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

- **Project**: Poke Fighter (`poke-fighter`)
- **Stack**: TypeScript / pnpm monorepo / React + Vite (client), Node.js + Socket.io (server)
- **Data**: SQLite (better-sqlite3)
- **Rules**: `.claude/rules/rules.md`
- **Domain context**: `.claude/rules/context.md`

## Commands

**Development** (opens Windows Terminal with two tabs):
```powershell
.\dev.ps1
```
Or run individually:
```powershell
pnpm --filter @poke-fighter/server dev   # tsx watch (hot reload)
pnpm --filter @poke-fighter/client dev   # Vite dev server
```

**Build** (shared must build first since server/client depend on it):
```powershell
pnpm --filter @poke-fighter/shared build
pnpm build          # builds all packages
```

**Test:**
```powershell
pnpm test                                          # all packages
pnpm --filter @poke-fighter/server test            # server only
pnpm --filter @poke-fighter/client test            # client only

# Run a single test file (from repo root):
pnpm --filter @poke-fighter/server exec vitest run src/engine/__tests__/BattleEngine.test.ts

# Run tests matching a name pattern:
pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "deals damage"
```

**Typecheck:**
```powershell
pnpm typecheck                                     # all packages
pnpm --filter @poke-fighter/server typecheck
```

**Data scripts:**
```powershell
pnpm seed       # populates data/pokemon.json, moves.json, etc.
pnpm validate   # validates data files against schemas
```

**Environment:** Copy `.env.example` to `.env` in the repo root and set `ADMIN_TOKEN`. The server reads it from `process.cwd()`.

## Architecture

### Package structure

```
packages/shared   — types, Zod schemas, typed Socket.io event maps
packages/server   — Node.js + Socket.io server + battle engine
packages/client   — React + Vite + Phaser frontend
data/             — static JSON data (pokemon, moves, abilities, items, typechart)
data/scripts/     — seed/validate scripts that populate the JSON files
```

`@poke-fighter/shared` is built to `dist/` and consumed as a workspace dependency by both server and client. Always rebuild it after changing types.

### Data flow

Static game data (Pokémon species, moves, abilities, items, type chart) lives in `/data/*.json`. The server's `DataLoader` (`packages/server/src/data/loader.ts`) reads these files at startup into in-memory Maps. The database (`better-sqlite3`, written to `data/poke-fighter.db`) stores player/NPC profiles, team templates, and battle history — it is not involved in battle resolution.

### Battle engine (server)

The engine is **pure**: `BattleEngine.resolveTurn(state, actions)` takes an immutable `BattleState` plus a map of slot → action and returns `{ newState, events }`. It never mutates the input.

Move effects are registered in `registrations.ts` via `MoveEffectRegistry` (a string→handler map keyed by move effect ID). `BattleEngine` dispatches to these handlers through `MoveEffectRegistry`. Common effect patterns (stat boosts, status, weather, terrain, hazards, pivots, etc.) are provided as factory functions in `effectFactories.ts` so registrations stay declarative.

`EffectEngine` handles pre-move checks (paralysis, confusion, sleep, freeze, bide, etc.) and end-of-turn processing (weather damage, burn/poison, volatile decrements). It is called by `BattleEngine`, not independently.

`BattleConfigurator` (`server/src/setup/`) converts a `PokemonSet[]` config into a full `BattleState` with computed stats, UUIDs, and PP.

### Socket/lobby layer (server)

`SocketServer` owns the Socket.io server, a `LobbyManager` (waiting players), and a `Map<battleId, BattleRoom>`.

`BattleRoom` is the stateful wrapper: it holds the current `BattleState`, collects actions from all slots, calls `BattleEngine.resolveTurn` once all actions are in, and fires callbacks (`onTurnResolved`, `onBattleEnd`, `onSwitchRequest`, etc.) that `SocketServer` uses to push events to connected sockets.

NPC slots have no connected player — when an NPC needs to act, `BattleRoom` fires `onNpcActionRequired`, and `SocketServer` forwards the request to all admin-authenticated sockets. The admin panel submits NPC actions back via `admin:action`.

Socket event types are defined in `@poke-fighter/shared` (`ServerToClientEvents` / `ClientToServerEvents`) and used to type Socket.io on both client and server.

### Client

`BattleContext` (`client/src/battle/BattleContext.tsx`) is the central React context for an active battle. It manages the socket subscription, `BattleState`, pending action requests, turn event playback queue, and battle log. Most battle UI reads from this context.

`BattleScene.tsx` wraps a Phaser scene for sprite animations; `overlays/` contains the React HUD overlaid on the canvas.

`client/src/socket.ts` exports a lazy singleton socket (`getSocket()`), plus `connectAsPlayer()` and `connectAsAdmin(adminToken)`.

The three routes are `/` (lobby), `/battle` (active battle), and `/admin` (admin panel for creating battles and controlling NPCs).

### TypeScript configuration

All packages extend `tsconfig.base.json` which enables `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`. Optional properties must never be assigned `undefined` explicitly; indexed access results are always `T | undefined`.

### Test fixtures

Engine tests use helpers from `packages/server/src/engine/__tests__/fixtures.ts`:
- `makePokemon(overrides?)` — returns a `PartyMember` with sensible defaults (Charizard, level 50, stats all 100)
- `make1v1State()` — returns a two-slot `BattleState` ready to pass to `BattleEngine.resolveTurn`

## Custom Commands

- `/test` — detect changed packages, run tests, analyze failures, flag coverage gaps
- `/review` — review code changes against project rules and patterns
- `/improve` — iterative review + fix loop on current changes
- `/tech-debt` — score and route tech debt in changed files
- `/bug-handoff` — build a structured bug investigation handoff document
- `/learn` — extract reusable patterns from the current session into a learned skill
- `/model-route` — recommend the cheapest viable model for a given task
