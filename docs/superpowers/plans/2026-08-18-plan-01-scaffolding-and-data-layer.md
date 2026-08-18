# Plan 01: Monorepo Scaffolding + Pokémon Data Layer (F1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the pnpm monorepo, define all shared TypeScript types, and produce validated static JSON for all ~1025 Gen 9 Pokémon, moves, abilities, and items seeded from Pokémon Showdown's data.

**Architecture:** Three packages (`shared`, `server`, `client`) under a pnpm workspace root. `shared` holds all types and is imported by both `server` and `client`. Raw Gen 9 data is seeded from `@pkmn/dex` into flat JSON files under `data/` and validated by a build script before anything else can run.

**Tech Stack:** pnpm 8+, TypeScript 5+, `@pkmn/dex` (PS data access), `zod` (schema validation), `vitest` (testing)

---

## File Structure

```
poke-fighter/
├── package.json                          # workspace root — scripts only
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── data/
│   ├── pokemon.json                      # seeded — all species
│   ├── moves.json                        # seeded — all moves
│   ├── abilities.json                    # seeded — all abilities
│   ├── items.json                        # seeded — all held items
│   ├── typechart.json                    # seeded — Gen 9 type effectiveness
│   └── scripts/
│       ├── package.json
│       ├── tsconfig.json
│       ├── seed.ts                       # pulls from @pkmn/dex, writes JSON files
│       └── validate.ts                   # validates JSON against zod schemas
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts                  # re-exports everything
            ├── types/
            │   ├── pokemon.ts            # PokemonSpecies, Move, Ability, Item, Stats
            │   ├── battle.ts             # BattleState, SlotState, PartyMember, FieldState
            │   ├── registry.ts           # PlayerProfile, NpcProfile, TeamTemplate
            │   └── events.ts             # all Socket.io event payload types
            └── schemas/
                ├── pokemon.schema.ts     # zod schemas matching pokemon.ts types
                └── move.schema.ts        # zod schemas matching Move type
```

---

## Task 1: Workspace Root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "poke-fighter",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "seed": "pnpm --filter data-scripts seed",
    "validate": "pnpm --filter data-scripts validate",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'data/scripts'
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create .env.example**

```
ADMIN_TOKEN=change-me-before-use
PORT=3000
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.js.map
.env
```

- [ ] **Step 6: Install pnpm and verify workspace**

```bash
pnpm install
```

Expected: `Lockfile is up to date` (empty workspace, no errors)

- [ ] **Step 7: Commit**

```bash
git init
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example .gitignore
git commit -m "chore: initialize pnpm monorepo workspace"
```

---

## Task 2: Shared Package Scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@poke-fighter/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/index.ts (empty re-export barrel — fill as types are added)**

```typescript
export * from './types/pokemon.js';
export * from './types/battle.js';
export * from './types/registry.js';
export * from './types/events.js';
export * from './schemas/pokemon.schema.js';
export * from './schemas/move.schema.js';
```

- [ ] **Step 4: Install dependencies and build**

```bash
pnpm --filter @poke-fighter/shared install
pnpm --filter @poke-fighter/shared build
```

Expected: `dist/` folder created with no TypeScript errors (will error on missing files — create placeholder files for each export first)

---

## Task 3: Pokémon & Move Type Definitions

**Files:**
- Create: `packages/shared/src/types/pokemon.ts`

- [ ] **Step 1: Write the failing type test**

Create `packages/shared/src/types/__tests__/pokemon.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { PokemonSpecies, Move, Stats, MoveTarget, ExpGrowthCurve, PokemonType } from '../pokemon.js';

describe('PokemonSpecies type', () => {
  it('has all required fields', () => {
    expectTypeOf<PokemonSpecies>().toHaveProperty('id');
    expectTypeOf<PokemonSpecies>().toHaveProperty('name');
    expectTypeOf<PokemonSpecies>().toHaveProperty('types');
    expectTypeOf<PokemonSpecies>().toHaveProperty('baseStats');
    expectTypeOf<PokemonSpecies>().toHaveProperty('baseExpYield');
    expectTypeOf<PokemonSpecies>().toHaveProperty('expGrowth');
  });

  it('Move has correct target union', () => {
    const target: MoveTarget = 'normal';
    expectTypeOf(target).toMatchTypeOf<MoveTarget>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: FAIL — `Cannot find module '../pokemon.js'`

- [ ] **Step 3: Create packages/shared/src/types/pokemon.ts**

```typescript
export type PokemonType =
  | 'Normal' | 'Fire' | 'Water' | 'Electric' | 'Grass' | 'Ice'
  | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug'
  | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy' | '???';

export type ExpGrowthCurve =
  | 'Erratic' | 'Fast' | 'MediumFast' | 'MediumSlow' | 'Slow' | 'Fluctuating';

export type MoveTarget =
  | 'normal'          // single adjacent foe
  | 'self'            // user only
  | 'allAdjacentFoes' // all opponents (spread)
  | 'allAdjacent'     // all adjacent (hits allies too)
  | 'adjacentAlly'    // single ally
  | 'allySide'        // your side (e.g. Reflect)
  | 'foeSide'         // foe side (e.g. Stealth Rock)
  | 'all'             // whole field (e.g. Sunny Day)
  | 'randomNormal'    // targets random adjacent foe
  | 'scripted';       // contextual (Counter, Mirror Coat)

export type MoveCategory = 'physical' | 'special' | 'status';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PokemonSpecies {
  id: number;            // National Dex number
  name: string;          // internal PS name (e.g. 'charizard', 'charizardmegax')
  displayName: string;   // human-readable (e.g. 'Charizard', 'Charizard-Mega-X')
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: Stats;
  abilities: {
    0: string;
    1?: string;
    H?: string;  // Hidden ability
  };
  baseExpYield: number;
  expGrowth: ExpGrowthCurve;
  learnset: string[];     // move IDs this species can learn in Gen 9
  evolutionStage: 1 | 2 | 3;
}

export interface Move {
  id: string;           // internal PS id (e.g. 'flamethrower')
  name: string;         // display name (e.g. 'Flamethrower')
  type: PokemonType;
  category: MoveCategory;
  basePower: number;    // 0 for status moves
  accuracy: number | true;  // true = never misses
  pp: number;
  priority: number;     // default 0
  target: MoveTarget;
  makesContact: boolean;
  effectId?: string;    // identifier for special effect handling
}

export interface Ability {
  id: string;
  name: string;
  effectId: string;
}

export interface HeldItem {
  id: string;
  name: string;
  effectId: string;
  isBerry: boolean;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/pokemon.ts packages/shared/src/types/__tests__/pokemon.test.ts
git commit -m "feat(shared): add Pokemon and Move type definitions"
```

---

## Task 4: Battle State & Registry Types

**Files:**
- Create: `packages/shared/src/types/battle.ts`
- Create: `packages/shared/src/types/registry.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/types/__tests__/battle.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { BattleState, SlotState, PartyMember, StatBoosts } from '../battle.js';

describe('BattleState type', () => {
  it('has two teams', () => {
    expectTypeOf<BattleState>().toHaveProperty('teams');
    expectTypeOf<BattleState['teams']>().toEqualTypeOf<[import('../battle.js').TeamState, import('../battle.js').TeamState]>();
  });

  it('PartyMember has stat boosts', () => {
    expectTypeOf<PartyMember>().toHaveProperty('statBoosts');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: FAIL — `Cannot find module '../battle.js'`

- [ ] **Step 3: Create packages/shared/src/types/battle.ts**

```typescript
import type { PokemonType, Stats } from './pokemon.js';

export type BattlePhase = 'setup' | 'action' | 'resolution' | 'switch' | 'ended';

export type StatusCondition = 'brn' | 'par' | 'slp' | 'frz' | 'psn' | 'tox' | 'fnt';

export type WeatherType = 'sun' | 'rain' | 'sand' | 'snow';

export type TerrainType = 'electric' | 'grassy' | 'misty' | 'psychic';

export interface StatBoosts {
  atk: number;  // -6 to +6
  def: number;
  spa: number;
  spd: number;
  spe: number;
  accuracy: number;
  evasion: number;
}

export interface MoveSlot {
  moveId: string;
  currentPp: number;
  maxPp: number;
}

export interface PartyMember {
  instanceId: string;       // unique per battle (uuid)
  speciesId: number;
  nickname?: string;
  level: number;
  currentHp: number;
  maxHp: number;
  stats: Stats;             // calculated (base + EVs + IVs + nature)
  ability: string;          // ability id
  heldItem?: string;        // item id
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
  status?: StatusCondition;
  volatileStatus: string[]; // e.g. 'confusion', 'leechseed', 'encore'
  statBoosts: StatBoosts;
  teraType?: PokemonType;
  hasTerastallized: boolean;
  fainted: boolean;
  expTotal: number;
}

export interface SlotState {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  isSpectator: boolean;
  party: PartyMember[];
  activePokemonIndex: number;
}

export interface TeamState {
  teamId: string;
  slots: SlotState[];
}

export interface SideConditions {
  stealthRock: boolean;
  spikes: 0 | 1 | 2 | 3;
  toxicSpikes: 0 | 1 | 2;
  stickyWeb: boolean;
  reflect: number;     // turns remaining, 0 = not active
  lightScreen: number;
  auroraVeil: number;
}

export interface FieldState {
  weather?: { type: WeatherType; turnsRemaining: number; fromAbility: boolean };
  terrain?: { type: TerrainType; turnsRemaining: number };
  trickRoom: number;  // turns remaining
  gravity: number;    // turns remaining
  sideConditions: [SideConditions, SideConditions];
}

export interface BattleState {
  battleId: string;
  label: string;
  turnNumber: number;
  phase: BattlePhase;
  teams: [TeamState, TeamState];
  field: FieldState;
  winner?: 0 | 1;
  turnTimerSeconds: number;
}
```

- [ ] **Step 4: Create packages/shared/src/types/registry.ts**

```typescript
import type { PokemonType } from './pokemon.js';

export interface PokemonSet {
  speciesId: number;
  nickname?: string;
  level: number;
  ability: string;
  heldItem?: string;
  moves: [string, string, string, string]; // move ids
  teraType?: PokemonType;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  ivs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  nature: string;
}

export interface TeamTemplate {
  templateId: string;
  name: string;
  pokemon: PokemonSet[];  // 1–6
  createdAt: string;      // ISO date
}

export interface PlayerProfile {
  profileId: string;
  displayName: string;
  defaultTeam?: TeamTemplate;
  createdAt: string;
}

export interface NpcProfile {
  profileId: string;
  name: string;
  team: TeamTemplate;
  createdAt: string;
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/battle.ts packages/shared/src/types/registry.ts packages/shared/src/types/__tests__/battle.test.ts
git commit -m "feat(shared): add BattleState, SlotState, and Registry type definitions"
```

---

## Task 5: Socket.io Event Types

**Files:**
- Create: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Create packages/shared/src/types/events.ts**

```typescript
import type { BattleState, PartyMember } from './battle.js';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface PlayerJoinPayload {
  displayName: string;
}

export interface MoveAction {
  type: 'move';
  moveIndex: 0 | 1 | 2 | 3;
  targetSlotId?: string;  // required for single-target moves
  terastallize?: boolean;
}

export interface SwitchAction {
  type: 'switch';
  targetInstanceId: string;
}

export interface ActionSubmitPayload {
  slotId: string;
  action: MoveAction | SwitchAction;
}

export interface SwitchSubmitPayload {
  slotId: string;
  targetInstanceId: string;
}

export interface AdminActionPayload {
  type:
    | 'npc-action'     // submit move for NPC slot
    | 'pause'
    | 'unpause'
    | 'force-faint'    // force a pokemon to faint
    | 'forfeit'        // end battle, declare other team winner
    | 'force-switch';  // force a pokemon switch
  data: Record<string, unknown>;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface BattleStartPayload {
  state: BattleState;
}

export interface TurnStartPayload {
  turnNumber: number;
  state: BattleState;
}

export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{ index: 0 | 1 | 2 | 3; moveId: string; pp: number; disabled: boolean }>;
  legalTargets: string[];        // slotIds of valid target slots
  canSwitch: boolean;
  switchTargets: string[];       // instanceIds of switchable party members
  canTerastallize: boolean;
  timerSeconds: number;
}

export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-change'
    | 'terrain-change'
    | 'volatile-applied'
    | 'terastallize'
    | 'faint';
  data: Record<string, unknown>;
}

export interface TurnResolvePayload {
  turnNumber: number;
  events: TurnResolveEvent[];
  state: BattleState;  // full state snapshot after resolution
}

export interface SwitchRequestPayload {
  slotId: string;
  party: PartyMember[];
  reason: 'faint' | 'forced';
}

export interface ExpAwardPayload {
  awards: Array<{ instanceId: string; amount: number; newTotal: number }>;
}

export interface LevelUpPayload {
  instanceId: string;
  newLevel: number;
  newStats: import('./pokemon.js').Stats;
}

export interface BattleEndPayload {
  winningTeamId: string;
  state: BattleState;
}

export interface LobbyErrorPayload {
  code: 'NAME_TAKEN' | 'BATTLE_FULL' | 'INVALID_NAME';
  message: string;
}

// ── Event map (used to type Socket.io) ───────────────────────────────────────

export interface ServerToClientEvents {
  'battle:start': (payload: BattleStartPayload) => void;
  'turn:start': (payload: TurnStartPayload) => void;
  'action:request': (payload: ActionRequestPayload) => void;
  'turn:resolve': (payload: TurnResolvePayload) => void;
  'switch:request': (payload: SwitchRequestPayload) => void;
  'exp:award': (payload: ExpAwardPayload) => void;
  'level:up': (payload: LevelUpPayload) => void;
  'battle:end': (payload: BattleEndPayload) => void;
  'lobby:error': (payload: LobbyErrorPayload) => void;
  'state:sync': (state: BattleState) => void;
}

export interface ClientToServerEvents {
  'player:join': (payload: PlayerJoinPayload) => void;
  'action:submit': (payload: ActionSubmitPayload) => void;
  'switch:submit': (payload: SwitchSubmitPayload) => void;
  'admin:action': (payload: AdminActionPayload) => void;
}
```

- [ ] **Step 2: Typecheck the shared package**

```bash
pnpm --filter @poke-fighter/shared typecheck
```

Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add Socket.io event payload types"
```

---

## Task 6: Data Seeding Script

**Files:**
- Create: `data/scripts/package.json`
- Create: `data/scripts/tsconfig.json`
- Create: `data/scripts/seed.ts`

- [ ] **Step 1: Create data/scripts/package.json**

```json
{
  "name": "data-scripts",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "seed": "tsx seed.ts",
    "validate": "tsx validate.ts"
  },
  "dependencies": {
    "@pkmn/dex": "^0.9.0"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create data/scripts/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist"
  },
  "include": ["./*.ts"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
pnpm --filter data-scripts install
```

Expected: `@pkmn/dex` installed under `data/scripts/node_modules`

- [ ] **Step 4: Create data/scripts/seed.ts**

```typescript
import { Dex } from '@pkmn/dex';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..'); // writes to data/

const gen9 = Dex.forGen(9);

// ── Seed Pokémon species ──────────────────────────────────────────────────────
const allSpecies = gen9.species.all().map((s) => ({
  id: s.num,
  name: s.id,
  displayName: s.name,
  types: s.types,
  baseStats: s.baseStats,
  abilities: s.abilities,
  baseExpYield: s.baseExp,
  expGrowth: s.expGrowth,
  learnset: [], // filled by learnset pass below
  evolutionStage: s.evoStage ?? 1,
}));

// Fill learnsets — @pkmn/dex has async learnset lookup
const learnsets = await gen9.learnsets.all();
const learnsetMap = new Map(learnsets.map((l) => [l.species, Object.keys(l.learnset ?? {})]));

for (const species of allSpecies) {
  species.learnset = learnsetMap.get(species.name) ?? [];
}

writeFileSync(join(dataDir, 'pokemon.json'), JSON.stringify(allSpecies, null, 2));
console.log(`Seeded ${allSpecies.length} species`);

// ── Seed Moves ────────────────────────────────────────────────────────────────
const allMoves = gen9.moves.all().map((m) => ({
  id: m.id,
  name: m.name,
  type: m.type,
  category: m.category.toLowerCase() as 'physical' | 'special' | 'status',
  basePower: m.basePower,
  accuracy: m.accuracy,
  pp: m.pp,
  priority: m.priority,
  target: m.target,
  makesContact: m.flags?.contact === 1,
  effectId: m.id, // use move id as effect identifier
}));

writeFileSync(join(dataDir, 'moves.json'), JSON.stringify(allMoves, null, 2));
console.log(`Seeded ${allMoves.length} moves`);

// ── Seed Abilities ────────────────────────────────────────────────────────────
const allAbilities = gen9.abilities.all().map((a) => ({
  id: a.id,
  name: a.name,
  effectId: a.id,
}));

writeFileSync(join(dataDir, 'abilities.json'), JSON.stringify(allAbilities, null, 2));
console.log(`Seeded ${allAbilities.length} abilities`);

// ── Seed Held Items ───────────────────────────────────────────────────────────
const allItems = gen9.items.all().map((i) => ({
  id: i.id,
  name: i.name,
  effectId: i.id,
  isBerry: !!i.isBerry,
}));

writeFileSync(join(dataDir, 'items.json'), JSON.stringify(allItems, null, 2));
console.log(`Seeded ${allItems.length} items`);

// ── Seed Type Chart ───────────────────────────────────────────────────────────
// Gen 9 type chart as a 2D lookup: chart[attackingType][defendingType] = multiplier
const TYPES = [
  'Normal','Fire','Water','Electric','Grass','Ice',
  'Fighting','Poison','Ground','Flying','Psychic','Bug',
  'Rock','Ghost','Dragon','Dark','Steel','Fairy',
] as const;

type T = typeof TYPES[number];
const chart: Record<string, Record<string, number>> = {};

for (const atk of TYPES) {
  chart[atk] = {};
  for (const def of TYPES) {
    chart[atk]![def] = gen9.types.get(atk).damageTaken[def] === 0 ? 1
      : gen9.types.get(atk).damageTaken[def] === 1 ? 2
      : gen9.types.get(atk).damageTaken[def] === 2 ? 0.5
      : gen9.types.get(atk).damageTaken[def] === 3 ? 0
      : 1;
  }
}

writeFileSync(join(dataDir, 'typechart.json'), JSON.stringify(chart, null, 2));
console.log('Seeded type chart');

console.log('\n✓ All data seeded successfully');
```

- [ ] **Step 5: Run the seed script**

```bash
pnpm seed
```

Expected output:
```
Seeded 1025 species
Seeded NNN moves
Seeded NNN abilities
Seeded NNN items
Seeded type chart

✓ All data seeded successfully
```

Verify `data/pokemon.json`, `data/moves.json`, `data/abilities.json`, `data/items.json`, `data/typechart.json` all exist and are non-empty.

- [ ] **Step 6: Commit seeded data and seed script**

```bash
git add data/scripts/ data/pokemon.json data/moves.json data/abilities.json data/items.json data/typechart.json
git commit -m "feat(data): seed all Gen 9 Pokemon, moves, abilities, items from @pkmn/dex"
```

---

## Task 7: Zod Schemas & Validation Script

**Files:**
- Create: `packages/shared/src/schemas/pokemon.schema.ts`
- Create: `packages/shared/src/schemas/move.schema.ts`
- Create: `data/scripts/validate.ts`

- [ ] **Step 1: Create packages/shared/src/schemas/pokemon.schema.ts**

```typescript
import { z } from 'zod';

const StatsSchema = z.object({
  hp: z.number().int().min(1).max(255),
  atk: z.number().int().min(1).max(255),
  def: z.number().int().min(1).max(255),
  spa: z.number().int().min(1).max(255),
  spd: z.number().int().min(1).max(255),
  spe: z.number().int().min(1).max(255),
});

const PokemonTypeSchema = z.enum([
  'Normal','Fire','Water','Electric','Grass','Ice',
  'Fighting','Poison','Ground','Flying','Psychic','Bug',
  'Rock','Ghost','Dragon','Dark','Steel','Fairy','???',
]);

export const PokemonSpeciesSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1),
  types: z.union([
    z.tuple([PokemonTypeSchema]),
    z.tuple([PokemonTypeSchema, PokemonTypeSchema]),
  ]),
  baseStats: StatsSchema,
  abilities: z.object({
    0: z.string(),
    1: z.string().optional(),
    H: z.string().optional(),
  }),
  baseExpYield: z.number().int().min(0),
  expGrowth: z.enum(['Erratic','Fast','MediumFast','MediumSlow','Slow','Fluctuating']),
  learnset: z.array(z.string()),
  evolutionStage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type ValidatedPokemonSpecies = z.infer<typeof PokemonSpeciesSchema>;
```

- [ ] **Step 2: Create packages/shared/src/schemas/move.schema.ts**

```typescript
import { z } from 'zod';

export const MoveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum([
    'Normal','Fire','Water','Electric','Grass','Ice',
    'Fighting','Poison','Ground','Flying','Psychic','Bug',
    'Rock','Ghost','Dragon','Dark','Steel','Fairy','???',
  ]),
  category: z.enum(['physical', 'special', 'status']),
  basePower: z.number().int().min(0),
  accuracy: z.union([z.number().int().min(1).max(100), z.literal(true)]),
  pp: z.number().int().min(1).max(64),
  priority: z.number().int().min(-7).max(5),
  target: z.enum([
    'normal','self','allAdjacentFoes','allAdjacent',
    'adjacentAlly','allySide','foeSide','all','randomNormal','scripted',
  ]),
  makesContact: z.boolean(),
  effectId: z.string().optional(),
});
```

- [ ] **Step 3: Create data/scripts/validate.ts**

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PokemonSpeciesSchema } from '@poke-fighter/shared/schemas/pokemon.schema.js';
import { MoveSchema } from '@poke-fighter/shared/schemas/move.schema.js';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..');

function loadJson(file: string): unknown[] {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf-8')) as unknown[];
}

let errors = 0;

function validate<T>(
  label: string,
  schema: z.ZodType<T>,
  records: unknown[]
): void {
  for (const record of records) {
    const result = schema.safeParse(record);
    if (!result.success) {
      console.error(`[${label}] Invalid record:`, JSON.stringify(record, null, 2));
      console.error('Errors:', result.error.flatten());
      errors++;
    }
  }
  console.log(`[${label}] Validated ${records.length} records — ${errors === 0 ? 'OK' : errors + ' errors'}`);
}

validate('pokemon', PokemonSpeciesSchema, loadJson('pokemon.json'));
validate('moves', MoveSchema, loadJson('moves.json'));

if (errors > 0) {
  console.error(`\n✗ Validation failed with ${errors} errors`);
  process.exit(1);
}

console.log('\n✓ All data valid');
```

- [ ] **Step 4: Update data/scripts/package.json to reference shared**

Add workspace dependency so validate.ts can import from shared:

```json
{
  "dependencies": {
    "@pkmn/dex": "^0.9.0",
    "@poke-fighter/shared": "workspace:*"
  }
}
```

Then install:

```bash
pnpm install
```

- [ ] **Step 5: Run validation**

```bash
pnpm validate
```

Expected:
```
[pokemon] Validated 1025 records — OK
[moves] Validated NNN records — OK

✓ All data valid
```

If there are errors, fix the schema or the seed transform to match the actual @pkmn/dex output shape.

- [ ] **Step 6: Add a vitest test that runs validation**

Create `packages/shared/src/schemas/__tests__/data-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PokemonSpeciesSchema } from '../pokemon.schema.js';
import { MoveSchema } from '../move.schema.js';

const dataDir = join(process.cwd(), '../../data');

describe('Seeded data validates against schemas', () => {
  it('all pokemon.json entries are valid', () => {
    const data = JSON.parse(readFileSync(join(dataDir, 'pokemon.json'), 'utf-8')) as unknown[];
    expect(data.length).toBeGreaterThan(1000);
    for (const entry of data) {
      const result = PokemonSpeciesSchema.safeParse(entry);
      expect(result.success, `species ${JSON.stringify(entry)} failed: ${!result.success ? JSON.stringify(result.error.flatten()) : ''}`).toBe(true);
    }
  });

  it('all moves.json entries are valid', () => {
    const data = JSON.parse(readFileSync(join(dataDir, 'moves.json'), 'utf-8')) as unknown[];
    expect(data.length).toBeGreaterThan(700);
    for (const entry of data) {
      const result = MoveSchema.safeParse(entry);
      expect(result.success, `move ${JSON.stringify(entry)} failed`).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/ data/scripts/validate.ts
git commit -m "feat(shared): add zod schemas and data validation script"
```

---

## Task 8: Server Data Loader

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/data/loader.ts`
- Create: `packages/server/src/data/__tests__/loader.test.ts`

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@poke-fighter/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@poke-fighter/shared": "workspace:*",
    "socket.io": "^4.7.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Create packages/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing test**

Create `packages/server/src/data/__tests__/loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DataLoader } from '../loader.js';

describe('DataLoader', () => {
  it('loads all pokemon species', () => {
    const loader = new DataLoader();
    const species = loader.getSpecies(6); // Charizard
    expect(species).not.toBeNull();
    expect(species?.name).toBe('charizard');
    expect(species?.baseStats.hp).toBe(78);
    expect(species?.types).toContain('Fire');
  });

  it('returns null for unknown species id', () => {
    const loader = new DataLoader();
    expect(loader.getSpecies(9999)).toBeNull();
  });

  it('loads move by id', () => {
    const loader = new DataLoader();
    const move = loader.getMove('flamethrower');
    expect(move).not.toBeNull();
    expect(move?.basePower).toBe(90);
    expect(move?.type).toBe('Fire');
  });

  it('loads type chart — fire vs grass is 2x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Fire', 'Grass')).toBe(2);
  });

  it('loads type chart — fire vs water is 0.5x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Fire', 'Water')).toBe(0.5);
  });

  it('loads type chart — normal vs ghost is 0x', () => {
    const loader = new DataLoader();
    expect(loader.getTypeEffectiveness('Normal', 'Ghost')).toBe(0);
  });
});
```

- [ ] **Step 4: Run — verify it fails**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `Cannot find module '../loader.js'`

- [ ] **Step 5: Create packages/server/src/data/loader.ts**

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PokemonSpecies, Move, Ability, HeldItem, PokemonType } from '@poke-fighter/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../../data'); // packages/server/src/data/ → data/

export class DataLoader {
  private readonly species: Map<number, PokemonSpecies>;
  private readonly speciesByName: Map<string, PokemonSpecies>;
  private readonly moves: Map<string, Move>;
  private readonly abilities: Map<string, Ability>;
  private readonly items: Map<string, HeldItem>;
  private readonly typeChart: Record<string, Record<string, number>>;

  constructor() {
    const rawSpecies = this.load<PokemonSpecies[]>('pokemon.json');
    this.species = new Map(rawSpecies.map((s) => [s.id, s]));
    this.speciesByName = new Map(rawSpecies.map((s) => [s.name, s]));

    const rawMoves = this.load<Move[]>('moves.json');
    this.moves = new Map(rawMoves.map((m) => [m.id, m]));

    const rawAbilities = this.load<Ability[]>('abilities.json');
    this.abilities = new Map(rawAbilities.map((a) => [a.id, a]));

    const rawItems = this.load<HeldItem[]>('items.json');
    this.items = new Map(rawItems.map((i) => [i.id, i]));

    this.typeChart = this.load<Record<string, Record<string, number>>>('typechart.json');
  }

  private load<T>(filename: string): T {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8')) as T;
  }

  getSpecies(id: number): PokemonSpecies | null {
    return this.species.get(id) ?? null;
  }

  getSpeciesByName(name: string): PokemonSpecies | null {
    return this.speciesByName.get(name.toLowerCase()) ?? null;
  }

  getMove(id: string): Move | null {
    return this.moves.get(id) ?? null;
  }

  getAbility(id: string): Ability | null {
    return this.abilities.get(id) ?? null;
  }

  getItem(id: string): HeldItem | null {
    return this.items.get(id) ?? null;
  }

  getAllSpecies(): PokemonSpecies[] {
    return Array.from(this.species.values());
  }

  getTypeEffectiveness(attackingType: PokemonType, defendingType: PokemonType): number {
    return this.typeChart[attackingType]?.[defendingType] ?? 1;
  }

  getCombinedEffectiveness(attackingType: PokemonType, defendingTypes: PokemonType[]): number {
    return defendingTypes.reduce((acc, dt) => acc * this.getTypeEffectiveness(attackingType, dt), 1);
  }
}
```

- [ ] **Step 6: Install dependencies and run tests**

```bash
pnpm install && pnpm --filter @poke-fighter/server test
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/
git commit -m "feat(server): add DataLoader — typed access to seeded Gen 9 data"
```

---

**Plan 01 complete.** The monorepo is scaffolded, all shared types are defined, Gen 9 data is seeded and validated, and the server has a typed DataLoader. Every subsequent plan builds on this foundation.
