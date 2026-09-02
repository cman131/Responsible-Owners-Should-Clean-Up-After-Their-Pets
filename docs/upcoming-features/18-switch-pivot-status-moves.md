# Plan 18 — Switch & Pivot Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four move-triggered switch variants — Baton Pass (voluntary switch that carries stat boosts and key volatiles), Shed Tail (substitute then switch), Parting Shot (stat drop then switch), Teleport (priority switch out) — plus the two forced-switch moves Roar and Whirlwind. Dragon Tail / Circle Throw (damage + force switch) are handled in Plan 14 and share the same force-switch infrastructure.

**Prerequisite:** This plan requires a `processForceSwitch` or equivalent path in `BattleEngine` / `BattleRoom` that can activate a switch mid-turn, prompt the player (or NPC) to choose a replacement, and resolve it before the next move. Inspect the existing faint-replacement flow in `BattleRoom`/`BattleEngine` — the goal is to reuse that infrastructure, not duplicate it.

**Architecture:** Voluntary switches (Baton Pass, Shed Tail, Parting Shot, Teleport) emit a new `pivot-switch` event (or reuse the existing one from U-turn/Volt Switch). Forced switches (Roar, Whirlwind, Dragon Tail) emit a `force-switch` event targeting the opponent. Both event types need to be handled in `BattleRoom` to prompt the appropriate player for a switch-in selection or auto-select randomly (for forced switches on NPCs or when no choice exists).

**Tech Stack:** TypeScript, Vitest — `packages/server` only (engine + socket). Integration test requires two players or NPC behavior.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/switchMoves.test.ts`.

---

### Task 1: Audit Existing Pivot Switch Infrastructure

Before writing any code, trace the existing U-turn / Volt Switch flow end to end.

- [ ] **Step 1:** In `BattleEngine.ts`, find the `pivot` secondary handler. Understand what event it emits and what flag it sets on the return value.
- [ ] **Step 2:** In `BattleRoom` (or equivalent socket handler), find where that event is caught and how the switch-in is prompted. Document the sequence: `pivot-switch` event → `action:request` to player → player submits switch → `BattleEngine.resolveSwitch`.
- [ ] **Step 3:** Write a brief summary in a comment at the top of `switchMoves.test.ts` describing the flow. This becomes the contract Baton Pass etc. will follow.

---

### Task 2: Volatile Carry-Over for Baton Pass

**Files:** `packages/shared/src/types/battle.ts`, `packages/server/src/engine/BattleEngine.ts`

When a Pokemon switches out normally, volatiles are cleared. Baton Pass must transfer certain volatiles to the incoming Pokemon. Define which volatiles carry over:

**Carry over:** `focusenergy`, `substitute` (carry the sub with remaining HP), `aqua-ring`, `ingrain`, `magnet-rise`, `power-trick`, `laser-focus`, any stat stage boosts (already on `statBoosts` object).

**Do not carry over:** `confusion`, `infatuation`, `encore`, `disable`, `taunt`, `torment`, `leech-seed`, `nightmare`, `curse`, `trapped`, `bide`, `yawn`, `perish-song`.

- [ ] **Step 1:** Add a `batonPassVolatiles: VolatileStatusEntry[]` field to the return value of `executeMove` for pivot moves (or add it to the event data), OR handle it entirely in `BattleRoom` by inspecting the outgoing Pokemon's volatile before clearing it.
- [ ] **Step 2:** Implement the carry-over: when the incoming Pokemon activates via Baton Pass, copy the carried volatiles and stat boosts from the outgoing Pokemon's snapshot.
- [ ] **Step 3:** Write a test — Pokemon with +2 Atk and Substitute uses Baton Pass; incoming Pokemon has +2 Atk and the Substitute.

---

### Task 3: Baton Pass Handler

**Files:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

- [ ] **Step 1:** Implement a `batonPass()` factory. It emits a `pivot-switch` event (same as U-turn) and flags that volatile/stat carry-over should apply.
- [ ] **Step 2:** Register `batonpass`.
- [ ] **Step 3:** Verify in integration that the carry-over from Task 2 fires correctly.

---

### Task 4: Shed Tail

**Files:** `registrations.ts`, `effectFactories.ts`

Shed Tail: create a Substitute (at 50% of user's HP cost), then trigger a pivot switch. The substitute is transferred to the incoming Pokemon automatically (not via Baton Pass carry-over — it's explicitly set up for the successor).

- [ ] **Step 1:** Write test — after Shed Tail, user has lost 50% HP, a Substitute is active, and a switch is triggered.
- [ ] **Step 2:** Implement: `user.currentHp -= Math.floor(user.maxHp / 2)`; apply `substitute` volatile with `hp = Math.floor(user.maxHp / 4)`; emit pivot-switch.
- [ ] **Step 3:** Register `shedtail`.

---

### Task 5: Parting Shot

**Files:** `registrations.ts`, `effectFactories.ts`

Parting Shot: apply -1 Atk and -1 SpA to the target, then trigger a pivot switch for the user. Fails if blocked by a Dark-type target (Dark-types are immune to Parting Shot in Gen 6+).

- [ ] **Step 1:** Write test — Parting Shot applies stat drops and triggers switch; fails if target is Dark-type.
- [ ] **Step 2:** Implement: check if any of target's types is Dark; if so emit `move-failed`. Otherwise apply stat drops and emit `pivot-switch`.
- [ ] **Step 3:** Register `partingshot`.

---

### Task 6: Teleport (Gen 8+ Priority Switch)

**Files:** `registrations.ts`, `effectFactories.ts`

Teleport: priority −6, switch user out. Has no effect in battle except as a switch pivot (Gen 8 mechanic). No stat effects.

- [ ] **Step 1:** Register `teleport` as a simple pivot-switch handler with no stat effects.
- [ ] **Step 2:** Write test — Teleport triggers a switch prompt.

---

### Task 7: Roar & Whirlwind (Forced Opponent Switch)

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleRoom` (socket handler)

Roar/Whirlwind: force the opponent to switch to a random non-fainted bench Pokemon. They fail if the opponent has no bench. They have negative priority and fail against Ingrain, Suction Cups ability, or if the target is the last Pokemon.

This differs from Dragon Tail (Plan 14) only in that they are status moves with no damage. They reuse the same `force-switch` event.

- [ ] **Step 1:** Implement `forceSwitch()` factory: verify target has a switchable bench member. Pick a random non-fainted, non-active party member. Emit `force-switch { targetSlotId, newPokemonIndex }`.
- [ ] **Step 2:** Handle `force-switch` in `BattleRoom`: activate the new Pokemon in the target's slot, clear old volatiles, apply switch-in effects (hazards, intimidate, etc.).
- [ ] **Step 3:** Fail conditions: emit `move-failed` if target has no eligible bench, or if target has `ingrain` volatile, or if target's ability is `suction-cups`.
- [ ] **Step 4:** Register `roar` and `whirlwind` using `forceSwitch()`.
- [ ] **Step 5:** Write tests — Roar forces a switch to a random bench; fails if only one Pokemon remains.
- [ ] **Step 6:** Run `npm test` and `npm run typecheck`.
