# rules.md - Coding Standards & Conventions

## Language & Framework Settings

- **Language**: TypeScript 5.4+
- **Strict mode**: Enabled (`strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`) — all new code must be null-safe. Optional properties must never be explicitly set to `undefined`. Indexed access results are always `T | undefined`.
- **Module format**: ES modules (`"type": "module"`), NodeNext resolution
- **Linting/formatting**: No enforced linter currently; follow existing code style

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `BattleEngine`, `SocketServer` |
| Interfaces / type aliases | PascalCase (no `I` prefix) | `BattleState`, `MoveContext` |
| Functions, methods | camelCase | `resolveTurn`, `getEffectiveStat` |
| Local variables, parameters | camelCase | `slotId`, `turnNumber` |
| Constants | SCREAMING_SNAKE_CASE | `PARALYSIS_SPEED_MOD` |
| Files | PascalCase for class files, camelCase for utility modules | `BattleEngine.ts`, `effects.ts` |

## Clean Code Principles

### Separation of Concerns

Keep these layers distinct:

- **Socket/transport layer** (`socket/`) — handles socket events, player/lobby state, routing to BattleRoom. No game logic.
- **BattleRoom** — stateful wrapper; collects actions, calls the engine, fires callbacks. No socket details, no game rule decisions.
- **BattleEngine** — pure function: `resolveTurn(state, actions) → {newState, events}`. Never mutates input. No I/O, no side effects.
- **EffectEngine / MoveEffectRegistry** — effect dispatch and per-move handlers. Called by BattleEngine, not independently.
- **DataLoader** — read-only data access from JSON files. Called by engine/room/setup; results treated as immutable.
- **Database** — persistence for profiles and battle history only. Never called from the engine layer.

### Pure Engine Invariant

`BattleEngine.resolveTurn` is pure. It receives a cloned state and returns a new one. Never introduce I/O, randomness sources other than the injected `rng`, or mutable shared state inside the engine or any module it calls.

### Move Effect Registration

New move effects belong in `registrations.ts` using factory functions from `effectFactories.ts`. Avoid putting complex logic directly in `registrations.ts` — extract a factory function if the handler is more than a few lines.

### Method Design

- Small, focused functions with clear names
- No boolean flag parameters that change behavior — split into two functions
- Keep parameter count low (≤4). Introduce a context/options object when more are needed.

### No God Classes

`BattleEngine.ts` is intentionally large (it is the rules engine). Do not use this as justification for making other files large. New handlers go in `effectFactories.ts` or dedicated effect modules, not into `BattleEngine.ts`.

## Code Style Rules

- **Braces**: Always use braces, even for single-line `if`/`else`
- **Line endings**: LF
- **Final newline**: Required
- **Trailing whitespace**: Trimmed
- **`this.` qualifier**: Required for class member access
- **Indentation**: 2 spaces
- **`.js` imports**: Required in all `import` statements (NodeNext resolution requires the extension at runtime)

## Async Patterns

- Prefer `async`/`await` over raw Promises
- The battle engine is synchronous — do not introduce `async` into `BattleEngine`, `EffectEngine`, or move effect handlers
- Socket handlers may be async where needed

## Data Identifiers

Pokémon, move, ability, and item IDs use lowercase internal names matching the Pokémon Showdown convention (e.g. `'flamethrower'`, `'iron-ball'`, `'blaze'`). Species names follow the same convention (e.g. `'charizard'`). Do not use display names as identifiers.

## Project Organization

- One class/module per file (where the file has a primary export)
- Namespace matches folder structure — imports use relative paths with `.js` extension
- Feature domains: `engine/`, `socket/`, `setup/`, `db/` (server); `battle/`, `pages/`, `admin/` (client)
- Tests live alongside source in `__tests__/` subdirectories

## Testing Standards

- **Framework**: Vitest (`vitest run`)
- **Mocking**: `vi.fn()`, `vi.spyOn()` from `vitest`
- **Assertions**: `expect()` from `vitest`
- Test naming: descriptive sentence style or `MethodName_Scenario_Expected`
- Tests for `BattleEngine` use `make1v1State()` and `makePokemon()` from `packages/server/src/engine/__tests__/fixtures.ts`
- Run a single test file: `pnpm --filter @poke-fighter/server exec vitest run src/engine/__tests__/BattleEngine.test.ts`
- Run tests matching a pattern: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "pattern"`

## What NOT to Do

- Do not mutate the `BattleState` input in `BattleEngine.resolveTurn` — always work on the state copy already passed in
- Do not add I/O or side effects inside the engine layer
- Do not put game logic in socket handlers — delegate to `BattleRoom` and `BattleEngine`
- Do not import from `dist/` directories — import from source
- Do not omit `.js` extension on relative imports (NodeNext module resolution requires it)
- Do not explicitly assign `undefined` to optional properties (`exactOptionalPropertyTypes` is enabled)
- Do not suppress TypeScript errors without a documented justification
- Do not add packages without checking for compatibility with the existing pnpm workspace
