# Plan 20 — Type, Item & Ability Manipulation Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement moves that change a Pokemon's type, swap or remove held items, or manipulate abilities. These are mechanically self-contained but require type lists and item/ability state to be mutable during battle.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/manipulationMoves.test.ts`.

---

## Part A — Type Manipulation

---

### Task 1: Soak

**Files:** `registrations.ts`, `effectFactories.ts`

Soak: change the target's type to pure Water. Applies regardless of the target's current type. Store the override as a `typeOverride: PokemonType[]` field on `PartyMember` (or as a volatile `{ name: 'type-override', types: ['Water'] }`).

- [ ] **Step 1:** Decide storage: add `typeOverride?: PokemonType[]` to `PartyMember` (simplest — survives type queries without volatile lookup). Alternatively, use a `volatile` with a `types` payload.
- [ ] **Step 2:** In all places where the engine reads a Pokemon's types (type effectiveness check, STAB calculation), check `member.typeOverride` first.
- [ ] **Step 3:** Register `soak` as a `custom()` handler that sets `target.typeOverride = ['Water']`.
- [ ] **Step 4:** Write test — Fire-type Pokemon hit by Soak; subsequent Water-type move is neutral (1×) instead of 0.5×.
- [ ] **Step 5:** Run tests.

---

### Task 2: Reflect Type

**Files:** `registrations.ts`, `effectFactories.ts`

Reflect Type: copy the target's current types to the user. Uses the same `typeOverride` mechanism from Task 1.

- [ ] **Step 1:** Register `reflecttype` as `custom()`: `user.typeOverride = [...resolveEffectiveTypes(target)]`.
- [ ] **Step 2:** Write test — Normal-type uses Reflect Type on a Fire/Water target; subsequent moves get Fire STAB.
- [ ] **Step 3:** Run tests.

---

### Task 3: Trick-or-Treat & Forest's Curse (Add Type)

**Files:** `registrations.ts`, `effectFactories.ts`

These add a third type to the target rather than replacing. The type system needs to support 3 types for this. Store as `typeOverride: ['existing1', 'existing2', 'Ghost']`.

- [ ] **Step 1:** Implement `addTypeToTarget(type: PokemonType)` helper: gets target's current types (including any override), appends the new type (dedup), sets `typeOverride`.
- [ ] **Step 2:** Register `trickortreat` (adds Ghost) and `forestscurse` (adds Grass).
- [ ] **Step 3:** Write test — Normal/Flying target gets Ghost added; Ghost-type move is now 1× instead of 0×.

---

### Task 4: Electrify

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleEngine.ts`

Electrify: the target's move this turn becomes Electric-type. Apply volatile `{ name: 'electrify' }`. In `BattleEngine.executeMove`, if the attacker has `electrify` volatile, override `effectiveMoveType = 'Electric'` before damage calculation. Clear the volatile after use.

- [ ] **Step 1:** Register `electrify` as `applyVolatileTarget('electrify')`.
- [ ] **Step 2:** Add the override in the move type resolution block of `BattleEngine`.
- [ ] **Step 3:** Write test — Normal-type Tackle used by Electrify target becomes Electric-type.
- [ ] **Step 4:** Run tests.

---

### Task 5: Camouflage, Conversion, Conversion 2

These change the user's own type. Use the same `typeOverride` mechanism.

- **Camouflage:** change user's type to match terrain/field (Normal if no terrain, Electric in Electric Terrain, etc.).
- **Conversion:** change user's type to match the type of the user's first move.
- **Conversion 2:** change user's type to a type that resists the target's last used move.

- [ ] **Step 1:** Implement Camouflage. Map terrain → type: `electric→Electric`, `grassy→Grass`, `misty→Fairy`, `psychic→Psychic`, `none→Normal`.
- [ ] **Step 2:** Implement Conversion. Look up type of `user.moves[0].moveData.type`.
- [ ] **Step 3:** Implement Conversion 2. For each type that resists the target's `lastMoveId` type, pick one and apply. Fail if user already has all resisting types.
- [ ] **Step 4:** Register all three.
- [ ] **Step 5:** Write tests.

---

## Part B — Item Manipulation

---

### Task 6: Trick & Switcheroo (Item Swap)

**Files:** `registrations.ts`, `effectFactories.ts`

Swap held items between user and target. Fail if either has no item, or if the item is a Z-Crystal, Mega Stone, or similar locked item (skip these checks for now — implement as unconditional swap).

- [ ] **Step 1:** Write test — user with Life Orb, target with Leftovers; after Trick, user has Leftovers and target has Life Orb.
- [ ] **Step 2:** Implement `itemSwap()` factory: swap `user.heldItem` and `target.heldItem`. Re-evaluate item hooks for both (or just rely on hooks being read lazily — they should be fine since hooks are looked up from `heldItem` at move time).
- [ ] **Step 3:** Register `trick` and `switcheroo`.
- [ ] **Step 4:** Run tests.

---

### Task 7: Bestow (Give Item to Target)

**Files:** `registrations.ts`, `effectFactories.ts`

Bestow: give user's held item to target. Fail if user has no item, or if target already holds an item.

- [ ] **Step 1:** Register as `custom()`. Check conditions. Transfer `user.heldItem` to `target.heldItem`. Clear `user.heldItem`.
- [ ] **Step 2:** Write test and run.

---

### Task 8: Knock Off (Damage + Remove Item)

Knock Off is a physical damage move (base power 65) that also removes the target's held item. It already deals damage via the standard damage path. The item removal is a secondary effect.

- [ ] **Step 1:** Add `knockoff` to the `secondaries` handling path in `effects.ts` (or in `applySecondaries` in `BattleEngine`): after damage, if target has a held item, remove it and emit `item-consumed` or `item-lost` event. Knock Off also doubles power against targets holding an item — handle in Plan 13 (`dynamicPower.ts`).
- [ ] **Step 2:** Write test — Knock Off removes target's item; target without item takes normal damage.
- [ ] **Step 3:** Add `knockoff` effectId to dynamic power in Plan 13 (double power if target holds item) — coordinate or add TODO.

---

### Task 9: Recycle

**Files:** `registrations.ts`, `effectFactories.ts`

Recycle: restore the user's most recently consumed item. Requires tracking `lastConsumedItem` on `PartyMember`. When any item is consumed (berries, Focus Sash, etc.), save its id to `member.lastConsumedItem`. Recycle restores it. Fail if `lastConsumedItem` is undefined or user already holds an item.

- [ ] **Step 1:** Add `lastConsumedItem?: string` to `PartyMember`.
- [ ] **Step 2:** In all item-consumption paths (berry trigger in `onAfterDamageTaken`, Focus Sash, Fling from Plan 14), set `member.lastConsumedItem = member.heldItem` before clearing the item.
- [ ] **Step 3:** Register `recycle` as `custom()`.
- [ ] **Step 4:** Write test — berry consumed; Recycle restores it.

---

## Part C — Ability Manipulation

---

### Task 10: Gastro Acid (Suppress Ability)

**Files:** `registrations.ts`, `effectFactories.ts`

Gastro Acid: suppress the target's ability for the remainder of the battle (until switch-out). Apply volatile `{ name: 'gastro-acid' }`. In ability hook lookups, check for this volatile and return no-op hooks. (The existing `effectiveAbilityId` function already has handling for ability suppression via `tracedAbilityId` — see if there's already a suppression flag.)

- [ ] **Step 1:** Add a suppression check to `effectiveAbilityId` (or `getAbilityHooks` lookup): if Pokemon has `gastro-acid` volatile, return `'none'` ability (empty hooks).
- [ ] **Step 2:** Register `gastroacid` as `applyVolatileTarget('gastro-acid')`.
- [ ] **Step 3:** Write test — Pokemon with Intimidate suppressed by Gastro Acid does not lower the opponent's Atk on switch-in.

---

### Task 11: Skill Swap

**Files:** `registrations.ts`, `effectFactories.ts`

Skill Swap: user and target exchange abilities. Store as `user.ability = target.ability` and vice versa.

- [ ] **Step 1:** Register `skillswap` as `custom()` that swaps `user.ability` and `target.ability`.
- [ ] **Step 2:** Write test — Pokemon with Intimidate swaps ability with opponent; Intimidate no longer fires for original holder.

---

### Task 12: Role Play

**Files:** `registrations.ts`, `effectFactories.ts`

Role Play: user copies the target's ability. Fails if the target has Multitype, Stance Change, or similar fixed abilities (skip for now — implement as unconditional copy).

- [ ] **Step 1:** Register `roleplay` as `custom()`: `user.ability = target.ability`.
- [ ] **Step 2:** Write test.

---

### Task 13: Entrainment, Simple Beam, Worry Seed, Doodle

**Files:** `registrations.ts`, `effectFactories.ts`

- **Entrainment:** copy user's ability to target: `target.ability = user.ability`.
- **Simple Beam:** set target's ability to `simple` (Simple doubles all stat changes).
- **Worry Seed:** set target's ability to `insomnia` (Insomnia prevents sleep).
- **Doodle:** (doubles only — skip for 1v1 scope, register as `move-failed { reason: 'not-implemented' }`).

- [ ] **Step 1:** Register the three 1v1-relevant moves.
- [ ] **Step 2:** Ensure Simple ability is handled in the stat-change path: if `member.ability === 'simple'`, multiply all stage deltas by 2 when applying.
- [ ] **Step 3:** Write tests.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`.
