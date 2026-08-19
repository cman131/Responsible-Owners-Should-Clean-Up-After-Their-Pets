# Pokémon Search Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Pokémon search in the Player/NPC team builder so it returns results when the user types a name or dex number.

**Architecture:** Two independent fixes — a one-line Vite proxy port correction that restores the socket connection, and a server-side filter extension (with extracted helper) that adds `displayName` matching and a try/catch for silent failures.

**Tech Stack:** Vite (proxy config), Socket.IO (server), Vitest (tests), TypeScript

---

## File Map

| File | Change |
|------|--------|
| `packages/client/vite.config.ts` | Fix proxy target port: 3000 → 3099 |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Export `pokemonMatchesQuery` helper, add `displayName` to filter, wrap `data:query` in try/catch |
| `packages/server/src/socket/__tests__/adminHandlers.test.ts` | **Create** — unit tests for `pokemonMatchesQuery` |

---

## Task 1: Fix Vite proxy port

**Files:**
- Modify: `packages/client/vite.config.ts`

- [ ] **Step 1: Change proxy target port**

In `packages/client/vite.config.ts`, change line 8:

```ts
// Before
'/socket.io': { target: 'http://localhost:3000', ws: true },

// After
'/socket.io': { target: 'http://localhost:3099', ws: true },
```

- [ ] **Step 2: Verify the fix**

Start both server and client (`dev.ps1` or manually with `pnpm --filter @poke-fighter/server dev` and `pnpm --filter @poke-fighter/client dev`), open the admin panel, navigate to Registry → New Player, type "char" in the search box. A dropdown with Charmander/Charmeleon/Charizard should appear.

- [ ] **Step 3: Commit**

```bash
git add packages/client/vite.config.ts
git commit -m "fix(dev): update Vite proxy to match server port 3099"
```

---

## Task 2: Add displayName search (TDD)

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Create: `packages/server/src/socket/__tests__/adminHandlers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/socket/__tests__/adminHandlers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pokemonMatchesQuery } from '../handlers/adminHandlers.js';
import type { PokemonSpecies } from '@poke-fighter/shared';

const makeSpecies = (overrides: Partial<PokemonSpecies>): PokemonSpecies => ({
  id: 1,
  name: 'bulbasaur',
  displayName: 'Bulbasaur',
  types: ['Grass'],
  baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  abilities: { 0: 'Overgrow' },
  baseExpYield: 64,
  expGrowth: 'MediumSlow',
  learnset: [],
  evolutionStage: 1,
  ...overrides,
});

describe('pokemonMatchesQuery', () => {
  it('matches by internal name (case-insensitive)', () => {
    const charmander = makeSpecies({ name: 'charmander', displayName: 'Charmander' });
    expect(pokemonMatchesQuery(charmander, 'char')).toBe(true);
    expect(pokemonMatchesQuery(charmander, 'Char')).toBe(true);
  });

  it('matches by displayName with special characters', () => {
    const nidoranF = makeSpecies({ id: 29, name: 'nidoranf', displayName: 'Nidoran-F' });
    expect(pokemonMatchesQuery(nidoranF, 'nidoran-f')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'Nidoran-F')).toBe(true);
    expect(pokemonMatchesQuery(nidoranF, 'nidoran')).toBe(true);
  });

  it('matches by dex number', () => {
    expect(pokemonMatchesQuery(makeSpecies({ id: 6 }), '6')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(pokemonMatchesQuery(makeSpecies({ name: 'bulbasaur', displayName: 'Bulbasaur' }), 'xyz')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: 4 failures — `pokemonMatchesQuery` is not exported yet.

- [ ] **Step 3: Add PokemonSpecies import and export pokemonMatchesQuery helper**

In `packages/server/src/socket/handlers/adminHandlers.ts`, add `PokemonSpecies` to the shared import (line 2–6):

```ts
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies,
} from '@poke-fighter/shared';
```

Then add this exported helper immediately before `registerAdminHandlers` (i.e., before the `export function registerAdminHandlers` line):

```ts
export function pokemonMatchesQuery(s: PokemonSpecies, query: string): boolean {
  const q = query.toLowerCase();
  return s.name.includes(q) || s.displayName.toLowerCase().includes(q) || String(s.id).includes(query);
}
```

- [ ] **Step 4: Replace the inline filter in the pokemon case**

Find this block in `registerAdminHandlers` (inside the `data:query` case):

```ts
case 'pokemon':
  results = data.getAllSpecies().filter((s) =>
    !query || s.name.includes(query.toLowerCase()) || String(s.id).includes(query)
  ).slice(0, 30);
  break;
```

Replace with:

```ts
case 'pokemon':
  results = data.getAllSpecies().filter((s) => !query || pokemonMatchesQuery(s, query)).slice(0, 30);
  break;
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all 4 new tests pass, existing tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "feat(search): add displayName matching to pokemon search filter"
```

---

## Task 3: Add try/catch to data:query handler

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`

- [ ] **Step 1: Wrap the data:query block in try/catch**

Find the entire `case 'data:query': { ... }` block and wrap its body:

```ts
case 'data:query': {
  try {
    const { resource, query } = payload.data as { resource: 'pokemon' | 'moves'; query?: string };
    const { DataLoader } = await import('../../data/loader.js');
    const data = new DataLoader();
    let results: unknown[];
    switch (resource) {
      case 'pokemon':
        results = data.getAllSpecies().filter((s) => !query || pokemonMatchesQuery(s, query)).slice(0, 30);
        break;
      case 'moves': {
        const species = data.getSpecies(Number(query));
        results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
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
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/socket/handlers/adminHandlers.ts
git commit -m "fix(server): catch and log data:query handler errors instead of swallowing them"
```
