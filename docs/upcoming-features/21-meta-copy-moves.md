# Plan 21 — Meta & Copy Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement moves that call other moves or copy opponent actions — Metronome, Copycat, Mirror Move, Sleep Talk, Assist, Me First, Instruct — plus Transform, Mimic, and Psych Up. These are the most architecturally complex moves because they require mid-turn move selection and execution recursion.

**Key design constraint:** The engine's move execution is not currently recursive. Implementing these moves requires a `executeSubMove(moveId, ctx)` helper that reuses `BattleEngine.executeMove` but guards against infinite recursion (Metronome → Metronome, Copycat → Copycat, etc.) and respects PP independently of the outer call.

**Architecture:** Create a `packages/server/src/engine/subMoveExecutor.ts` module with `executeSubMove(moveId, attacker, target, battle, rng): TurnResolveEvent[]`. This looks up the move from `data.getMoveById(moveId)`, builds a minimal context, calls the existing move resolution path, and returns events. The caller (e.g., Metronome handler) emits the sub-move's events as part of its own event stream.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/metaMoves.test.ts`.

---

### Task 1: Define the Exclusion Lists

Before implementing any moves, define which moves cannot be called by each meta-move. These are canonical Showdown rules.

- [ ] **Step 1:** Create `packages/server/src/engine/metaMoveExclusions.ts` with:

```typescript
// Moves that Metronome cannot call
export const METRONOME_EXCLUDED = new Set([
  'afteryou', 'assist', 'beakblast', 'belch', 'bestow', 'bounce', 'celebrate',
  'chatter', 'comeuppance', 'copycat', 'counter', 'covet', 'destinybond', 'detect',
  'dig', 'dive', 'dynamicpunch', 'endure', 'feint', 'fly', 'focuspunch',
  'followme', 'freezeshock', 'gigatonhammer', 'gravapple', 'holdback', 'holdhands',
  'iceburn', 'instruct', 'kingshield', 'lightthatburnsthesky', 'lovelysugar',
  'mefirst', 'metronome', 'mimic', 'mindblown', 'mirrorcoat', 'mirrormove',
  'naturepower', 'phantomforce', 'photongeyser', 'precipiceblades', 'protect',
  'quash', 'ragefist', 'ragepowder', 'relicsong', 'shadowforce', 'shellsmash',
  'shellsidearm', 'sketch', 'skydrop', 'sleeptalk', 'snatch', 'spikyshield',
  'spotlight', 'struggle', 'switcheroo', 'thief', 'thousandarrows', 'thousandwaves',
  'trick', 'trickroom', 'whirlwind',
]);

// Moves that Copycat cannot call
export const COPYCAT_EXCLUDED = new Set([
  'assist', 'bestow', 'chatter', 'circlethrow', 'comeuppance', 'copycat',
  'counter', 'covet', 'destinybond', 'detect', 'dragonrage', 'endure',
  'feint', 'focuspunch', 'followme', 'helpinghand', 'mefirst', 'metronome',
  'mimic', 'mirrorcoat', 'mirrormove', 'naturepower', 'protect', 'quash',
  'ragepowder', 'roar', 'shadowforce', 'sketch', 'sleeptalk', 'snatch',
  'spikyshield', 'struggle', 'switcheroo', 'thief', 'transform', 'trick',
  'whirlwind',
]);

// Moves that Sleep Talk cannot call
export const SLEEP_TALK_EXCLUDED = new Set([
  'assist', 'bide', 'bounce', 'copycat', 'dig', 'dive', 'fly',
  'freezeshock', 'iceburn', 'metronome', 'mimic', 'mirrormove',
  'phantomforce', 'shadowforce', 'sketch', 'skydrop', 'sleeptalk', 'snatch',
  'uproar',
]);
```

---

### Task 2: Build `executeSubMove`

**Files:**
- Create: `packages/server/src/engine/subMoveExecutor.ts`

This is the core infrastructure for all meta-moves.

```typescript
export function executeSubMove(
  moveId: string,
  ctx: MoveEffectContext,
  depth = 0,
): TurnResolveEvent[] {
  if (depth > 1) return []; // prevent infinite recursion
  const move = ctx.battle./* data service */.getMoveById(moveId);
  if (!move) return [];
  // Build a sub-context with the same attacker, targets, etc.
  // Call BattleEngine.resolveMove (or expose a lower-level method)
  // Return events
}
```

The exact interface depends on how `BattleEngine` is structured. Options:
- **Option A:** Extract a `resolveMove(move, attackerSlotId, targetSlotIds, state, rng): { events, newState }` method from `executeMove` and call it here.
- **Option B:** Instantiate a temporary `BattleEngine` with the current state, call `executeMove` with a synthetic action.

Option A is cleaner. The refactor needed: identify the portion of `BattleEngine.executeMove` that runs after pre-move checks (from the accuracy check onward) and extract it into `resolveMove`.

- [ ] **Step 1:** Extract `resolveMove` (or equivalent) from `BattleEngine.executeMove`. Verify all existing tests still pass.
- [ ] **Step 2:** Implement `executeSubMove` in `subMoveExecutor.ts`.
- [ ] **Step 3:** Write a test that directly calls `executeSubMove('tackle', ctx)` and confirms it returns damage events.

---

### Task 3: Metronome

**Files:** `registrations.ts`, `effectFactories.ts`

Metronome: pick a random move not in `METRONOME_EXCLUDED` from the full move list, then execute it.

- [ ] **Step 1:** Write a failing test — with seeded RNG, Metronome calls the expected move and its events appear in the output.
- [ ] **Step 2:** Implement `custom()` handler:
  1. Build a candidate list: all moveIds not in `METRONOME_EXCLUDED`
  2. Pick one using `ctx.rng`
  3. Call `executeSubMove(pickedMoveId, ctx)`
  4. Return the sub-move's events
- [ ] **Step 3:** Register `metronome`.
- [ ] **Step 4:** Run tests.

---

### Task 4: Copycat

**Files:** `registrations.ts`, `effectFactories.ts`

Copycat: use the last move used in the battle (field-level tracking, or the last move used by any Pokemon). Fail if no move has been used yet, or if the last move is in `COPYCAT_EXCLUDED`.

- [ ] **Step 1:** Add `lastUsedMoveId?: string` to `BattleState` or `FieldState`. Update it in `BattleEngine.executeMove` after every successful move.
- [ ] **Step 2:** Implement Copycat handler: read `battle.lastUsedMoveId`, check exclusion list, call `executeSubMove`.
- [ ] **Step 3:** Register `copycat`.
- [ ] **Step 4:** Write test — after opponent uses Surf, Copycat calls Surf.

---

### Task 5: Mirror Move

**Files:** `registrations.ts`, `effectFactories.ts`

Mirror Move: use the last move the **target** (opponent) used against the Mirror Move user. Fail if the target hasn't moved yet or used a move in `COPYCAT_EXCLUDED`.

- [ ] **Step 1:** `lastMoveId` is already tracked on `PartyMember`. Read `target.lastMoveId`.
- [ ] **Step 2:** Implement handler: check exclusion list, call `executeSubMove(target.lastMoveId, ctx)`.
- [ ] **Step 3:** Register `mirrormove`.
- [ ] **Step 4:** Write test.

---

### Task 6: Sleep Talk

**Files:** `registrations.ts`, `effectFactories.ts`, `EffectEngine.ts`

Sleep Talk: can only be used while asleep (fail otherwise). Picks a random move from the user's move set (excluding Sleep Talk itself and `SLEEP_TALK_EXCLUDED`) and executes it without spending PP.

- [ ] **Step 1:** In `EffectEngine.runPreMove`, Sleep Talk requires a pre-move exemption — it must be allowed even when the user is asleep. Add an exception: if the chosen move is `sleeptalk` and the user is asleep, do NOT emit `move-blocked`. (Currently sleep blocks all moves.)
- [ ] **Step 2:** Implement Sleep Talk handler:
  1. Fail if user is not asleep
  2. Collect user's move slots excluding `sleeptalk` and `SLEEP_TALK_EXCLUDED`
  3. Pick one at random using `ctx.rng`
  4. Call `executeSubMove` without decrementing PP of the chosen move
- [ ] **Step 3:** Register `sleeptalk`.
- [ ] **Step 4:** Write test — sleeping Pokemon uses Sleep Talk and executes a random move from its set.

---

### Task 7: Assist

**Files:** `registrations.ts`, `effectFactories.ts`

Assist: call a random move from a random party member (excluding the user). Uses the same exclusion list as Copycat.

- [ ] **Step 1:** Build candidate list: all moves known by non-active party members, excluding `COPYCAT_EXCLUDED`.
- [ ] **Step 2:** Implement handler: iterate all non-active party members in the user's team, collect eligible moveIds, pick one at random, call `executeSubMove`.
- [ ] **Step 3:** Register `assist`.
- [ ] **Step 4:** Write test.

---

### Task 8: Me First

**Files:** `registrations.ts`, `effectFactories.ts`

Me First: use the target's chosen move before the target uses it, with 1.5× power. Can only be used if the user moves before the target this turn (priority-based). Fails if the target is using a status move or if Me First can't determine the target's chosen move.

Implementation note: the target's chosen move is available as the pending action (from the turn's resolved action queue). This requires access to the upcoming action — check if `BattleEngine` has access to both actions when executing.

- [ ] **Step 1:** Determine if the pending opponent action is accessible in `executeMove`. If not, this move may need to be resolved at the BattleRoom level instead of the engine level. If not feasible in the current architecture, register as `move-failed { reason: 'not-implemented' }` and document the architectural gap.
- [ ] **Step 2:** If feasible: implement and register.

---

### Task 9: Instruct

**Files:** `registrations.ts`, `effectFactories.ts`

Instruct: cause the target to immediately use its last used move again. Fail if target has no `lastMoveId`, or the last move is excluded, or the target has 0 PP for that move.

- [ ] **Step 1:** Read `target.lastMoveId` and locate the move slot.
- [ ] **Step 2:** Check exclusions and PP > 0.
- [ ] **Step 3:** Call `executeSubMove(target.lastMoveId, ctx)` but with `target` as the attacker and `user` as the target.
- [ ] **Step 4:** Register `instruct`.
- [ ] **Step 5:** Write test.

---

### Task 10: Transform

**Files:** `registrations.ts`, `effectFactories.ts`

Transform: copy all of target's base stats, stat stages, types, ability, and moves (with 5 PP each). The user retains their HP.

- [ ] **Step 1:** Write test — after Transform, user has target's types, ability, and moves with 5 PP.
- [ ] **Step 2:** Implement as `custom()`:
  - Copy `target.stats`, `target.statBoosts`, `target.ability`, `target.moves` (with pp capped at 5)
  - Set `user.typeOverride = resolveEffectiveTypes(target)`
  - Do NOT copy HP or status
  - Mark user with `{ name: 'transformed', originalData: { ... } }` volatile if you need to restore on switch-out
- [ ] **Step 3:** Register `transform`.

---

### Task 11: Mimic & Sketch

**Files:** `registrations.ts`, `effectFactories.ts`

- **Mimic:** replace one of the user's move slots with the target's last used move (temporarily, until switch-out). PP = 5. Fail if no `lastMoveId` on target.
- **Sketch:** permanently replace the Sketch slot with the target's last move (overwrite the move data for this battle instance). No restriction on what can be Sketched.

- [ ] **Step 1:** Register `mimic` as `custom()` — find Mimic's slot in user's moves, replace it with the target's `lastMoveId` move, pp = 5.
- [ ] **Step 2:** Register `sketch` as `custom()` — same but permanent (no restoration on switch-out).
- [ ] **Step 3:** Write tests.

---

### Task 12: Psych Up

**Files:** `registrations.ts`, `effectFactories.ts`

Psych Up: copy all of the target's current stat stages to the user.

```typescript
user.statBoosts = { ...target.statBoosts };
```

- [ ] **Step 1:** Register as `custom()`.
- [ ] **Step 2:** Write test — target has atk+2/spd-1; after Psych Up, user has the same stat stages.
- [ ] **Step 3:** Run `npm test` and `npm run typecheck`.
