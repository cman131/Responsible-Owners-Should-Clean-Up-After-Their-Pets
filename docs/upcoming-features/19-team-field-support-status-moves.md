# Plan 19 — Team Field Support Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register handlers for status moves that establish team-wide or field-wide protective conditions — Tailwind, Safeguard, Mist, Lucky Chant, Magic Coat, and Snatch.

**Already registered (skip):** `reflect`, `lightscreen`, `auroraveil`, `stealthrock`, `stickyweb`, `spikes`, `toxicspikes`, `defog`, `courtchange`.

**Architecture:** Tailwind, Safeguard, Mist, and Lucky Chant are side conditions. The existing `setSideCondition` factory should cover them if the `SideConditions` type is extended to include these new fields. Magic Coat is a reactive volatile that bounces the next incoming status move back. Snatch steals the next self-targeting status move used by the opponent.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/teamSupport.test.ts`.

---

### Task 1: Extend SideConditions Type

**Files:**
- `packages/shared/src/types/battle.ts` — add fields to `SideConditions`
- Any initializer that constructs a blank `SideConditions` object

- [ ] **Step 1:** Add to `SideConditions`:
  ```typescript
  tailwind: number;    // turns remaining (0 = inactive)
  safeguard: number;   // turns remaining
  mist: number;        // turns remaining
  luckychant: number;  // turns remaining
  ```
- [ ] **Step 2:** Update all places that initialize `SideConditions` to include the new fields defaulting to `0`.
- [ ] **Step 3:** Run `npm test` — no type errors.

---

### Task 2: Tailwind

**Files:** `registrations.ts`, `BattleEngine.ts`

Tailwind doubles the Speed of all Pokemon on the user's side for 4 turns (including the turn it's used, i.e., 3 more turns after it's set).

- [ ] **Step 1:** Register `tailwind` using `setSideCondition('tailwind', 4, 'ally', { failIfActive: true })` — or if the factory doesn't support turn countdown, use a `custom()` handler that sets `sideConditions[userIdx].tailwind = 4`.
- [ ] **Step 2:** In `BattleEngine.ts`, in the speed calculation used for turn order (wherever base speed is read before applying stat stages), add: if `sideConditions[teamIdx].tailwind > 0`, multiply speed by 2.
- [ ] **Step 3:** In `EffectEngine.runEndOfTurn`, decrement `tailwind` counter and emit `side-condition-ended` when it reaches 0.
- [ ] **Step 4:** Write test — Pokemon on Tailwind side acts before opponent despite equal base speed.
- [ ] **Step 5:** Run tests.

---

### Task 3: Safeguard

**Files:** `registrations.ts`, `BattleEngine.ts`, `effects.ts`

Safeguard protects the user's side from status conditions (burn, paralysis, poison, sleep, freeze) for 5 turns. Does not prevent self-inflicted status (Rest, Flame Orb).

- [ ] **Step 1:** Register `safeguard` as `custom()` or `setSideCondition('safeguard', 5, 'ally', { failIfActive: true })`.
- [ ] **Step 2:** In `applyStatus` (in `effects.ts`) or in `BattleEngine`'s status-application path, check `sideConditions[teamIdx].safeguard > 0`. If active, block external status application (return null without applying). Status from the move's own user (self-inflicted) should still apply.
- [ ] **Step 3:** Decrement `safeguard` in EOT sweep.
- [ ] **Step 4:** Write test — opponent cannot apply burn to a Pokemon behind Safeguard; Rest (self-inflicted sleep) still works.
- [ ] **Step 5:** Run tests.

---

### Task 4: Mist

**Files:** `registrations.ts`, `BattleEngine.ts`, `effects.ts`

Mist prevents stat reductions on the user's side from opponent moves for 5 turns. Does not prevent self-inflicted drops (Close Combat, Shell Smash).

- [ ] **Step 1:** Register `mist` as a side condition setter (5 turns, ally side, fail if active).
- [ ] **Step 2:** In `applyStatBoost` (in `effects.ts`) or wherever opponent-stat-drops are applied, check `sideConditions[targetTeamIdx].mist > 0`. If active and the drop originates from an opponent's move, return a `move-failed` or skip the drop.
- [ ] **Step 3:** Decrement `mist` in EOT sweep.
- [ ] **Step 4:** Write test — Leer fails to drop Defense behind Mist; Close Combat still drops own Defense.
- [ ] **Step 5:** Run tests.

---

### Task 5: Lucky Chant

**Files:** `registrations.ts`, `BattleEngine.ts`

Lucky Chant prevents critical hits against the user's side for 5 turns.

- [ ] **Step 1:** Register `luckychant` as a side condition setter.
- [ ] **Step 2:** In the crit calculation in `BattleEngine.executeMove` (around where `isCritical` is computed), if `sideConditions[defenderTeamIndex].luckychant > 0`, force `isCritical = false`.
- [ ] **Step 3:** Decrement `luckychant` in EOT sweep.
- [ ] **Step 4:** Write test — move with guaranteed crit (from Focus Energy) still does not crit against a Lucky Chant-protected Pokemon.
- [ ] **Step 5:** Run tests.

---

### Task 6: Magic Coat

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleEngine.ts`

Magic Coat: applies a `magic-coat` volatile to the user for the turn. When a status move that targets the opponent is used against the Magic Coat user, the move is bounced back to the attacker. Affected move types: moves that apply status, confusion, volatile status, or stat drops targeting an opponent (most "powder" and non-damaging targeting moves).

Moves bounced by Magic Coat include: Thunder Wave, Toxic, Will-O-Wisp, Spore, Hypnosis, Leech Seed, Confuse Ray, all stat-drop moves, entry hazard setters, Taunt, etc.

- [ ] **Step 1:** Define `MAGIC_COAT_BOUNCED_EFFECTS = new Set([...])` — list of effectIds that Magic Coat reflects. Use the set of effectIds that target non-self and are status moves.
- [ ] **Step 2:** In `BattleEngine.executeMove` (status move path), before calling the handler: check if any target has `magic-coat` volatile AND `move.effectId` is in `MAGIC_COAT_BOUNCED_EFFECTS`. If so, swap attacker and target in the handler context (bounce the move). Clear the `magic-coat` volatile.
- [ ] **Step 3:** Register `magiccoat` as `applyVolatileSelf('magic-coat')`.
- [ ] **Step 4:** Write test — Toxic aimed at Magic Coat user is applied to the original attacker instead.
- [ ] **Step 5:** Run `npm test`.

---

### Task 7: Snatch

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleEngine.ts`

Snatch: applies a `snatch` volatile to the user. When the opponent uses a self-targeting beneficial status move (heals, stat boosts, etc.) this turn, Snatch steals it — the effect applies to the Snatch user instead.

Affected moves: self-targeting heals (Recover, Roost, Slack Off, etc.), self-targeting stat boosts (Swords Dance, Dragon Dance, etc.), Substitute, etc.

Implementation: when a status move is used whose target is `self` and the opposing Pokemon has a `snatch` volatile, redirect the handler to apply to the Snatch user instead. Clear the volatile.

- [ ] **Step 1:** Define `SNATCH_STEALABLE_EFFECTS = new Set([...])` — effectIds of self-targeting moves that Snatch can steal.
- [ ] **Step 2:** In `BattleEngine.executeMove` (status move path), after target resolution: check if the opponent has `snatch` volatile and the move is in `SNATCH_STEALABLE_EFFECTS`. If so, redirect the handler context to the Snatch user as target.
- [ ] **Step 3:** Register `snatch` as `applyVolatileSelf('snatch')`.
- [ ] **Step 4:** Write test — Snatch user steals Swords Dance from the opponent; Snatch user's Atk goes +2, opponent's stays the same.
- [ ] **Step 5:** Run `npm test` and `npm run typecheck`.

---

### Task 8: Defog Fix (Terrain Clear)

Defog already removes terrain — verify the implementation in `registrations.ts` clears `ctx.battle.field.terrain`. Check also that it doesn't clear Tailwind/Safeguard/Mist (it should not — it only clears hazards and screens on the foe's side and hazards on both sides).

- [ ] **Step 1:** Read the existing Defog custom handler.
- [ ] **Step 2:** If Tailwind/Safeguard/Mist are added as side conditions in Task 1, confirm Defog does not clear them (it shouldn't per the game mechanics).
- [ ] **Step 3:** Write a regression test confirming Tailwind survives Defog.
