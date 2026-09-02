# Plan 16 — Stat Setup Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register handlers for all missing stat-boosting/setup status moves. Most are straightforward multi-stat registrations using the existing `statModSelf`, `multiStatModSelf`, or `statModTarget` factories. A few require custom handlers (Belly Drum, Clangorous Soul, Acupressure, Laser Focus, Stockpile/Swallow).

**Already registered (skip):** `swordsdance`, `nastyplot`, `agility`, `barrier`, `acidarmor`, `amnesia`, `irondefense`, `calmmind`, `bulkup`, `dragondance`, `quiverdance`, `shellsmash`, `coil`.

**Architecture:** Pure registry additions in `registrations.ts`. New `custom()` handlers for Belly Drum, Clangorous Soul, Acupressure, Laser Focus. Stockpile/Swallow requires a `stockpile` volatile counter (check if it exists from Plan 14's Spit Up implementation; coordinate if needed).

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/statSetup.test.ts`.

---

### Task 1: Simple Multi-Stat Self Boosts (Missing Registrations)

**File:** `packages/server/src/engine/registrations.ts`

These all use the existing factory `multiStatModSelf` or `statModSelf`:

- [ ] **Step 1:** Write tests confirming each move applies the correct stat changes.
- [ ] **Step 2:** Add registrations:
  ```typescript
  // +2 in a single stat
  r.register('rockpolish',   statModSelf('spe', 2));
  r.register('tailglow',     statModSelf('spa', 3));
  r.register('growth',       multiStatModSelf({ atk: 1, spa: 1 })); // sun variant in Task 7
  r.register('workup',       multiStatModSelf({ atk: 1, spa: 1 }));
  r.register('howl',         statModSelf('atk', 1));
  r.register('meditate',     statModSelf('atk', 1));
  r.register('sharpen',      statModSelf('atk', 1));
  r.register('harden',       statModSelf('def', 1));
  r.register('defensecurl',  statModSelf('def', 1));
  r.register('withdraw',     statModSelf('def', 1));
  r.register('cottonguard',  statModSelf('def', 3));
  r.register('cosmicpower',  multiStatModSelf({ def: 1, spd: 1 }));

  // Complex boosts
  r.register('shiftgear',    multiStatModSelf({ spe: 2, atk: 1 }));
  r.register('geomancy',     multiStatModSelf({ spa: 2, spd: 2, spe: 2 })); // 2-turn charge; see Task 6
  r.register('victorydance', multiStatModSelf({ atk: 1, def: 1, spe: 1 }));
  r.register('filletaway',   null); // needs HP cost; see Task 3
  r.register('takeheart',    null); // needs status cure; see Task 5
  ```
  (Skip filletaway and takeheart in this step.)
- [ ] **Step 3:** Run `npm test`.

---

### Task 2: Autotomize

**File:** `packages/server/src/engine/registrations.ts`

Autotomize: +2 Speed, reduce user's weight by 100 kg (minimum 0.1 kg). Weight reduction is tracked on a `PartyMember` field (coordinate with Plan 13 weight tracking; if `PartyMember` has `weightModifier: number`, add -100 here).

For now, if weight tracking is not yet implemented, register as `statModSelf('spe', 2)` and add a TODO comment for the weight reduction.

- [ ] **Step 1:** Register `autotomize` as `statModSelf('spe', 2)` with TODO for weight.
- [ ] **Step 2:** If `PartyMember.weight` exists: add a `custom()` handler that also decrements it.
- [ ] **Step 3:** Run tests.

---

### Task 3: Fillet Away (HP-Cost Boost)

**File:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

Fillet Away: costs 50% of user's current HP, boosts Atk/SpA/Spe by +2 each. Fails if user's HP would drop to 0 or less.

- [ ] **Step 1:** Write test — user at 100 HP uses Fillet Away; HP becomes 50, three stats each +2. Fails if HP ≤ 1.
- [ ] **Step 2:** Implement as `custom()` handler. Check `user.currentHp > 1`. Deduct `Math.floor(user.currentHp / 2)`. Apply stat changes. Emit `damage-dealt` (or `hp-cost`) + stat-change events.
- [ ] **Step 3:** Register `filletaway`.
- [ ] **Step 4:** Run tests.

---

### Task 4: Belly Drum

**File:** `registrations.ts`, `effectFactories.ts`

Belly Drum: costs 50% of max HP, sets Atk to +6. Fails if Atk is already +6 or HP ≤ 50%.

- [ ] **Step 1:** Write test — user at full HP uses Belly Drum; HP drops by 50% of max, `statBoosts.atk` becomes 6.
- [ ] **Step 2:** Implement as `custom()`. Fail conditions: `user.currentHp <= Math.floor(user.maxHp / 2)` OR `user.statBoosts.atk === 6`. Apply `user.currentHp -= Math.floor(user.maxHp / 2)`. Set `user.statBoosts.atk = 6` (cap, don't delta).
- [ ] **Step 3:** Register `bellydrum`.
- [ ] **Step 4:** Run tests.

---

### Task 5: Clangorous Soul

**File:** `registrations.ts`, `effectFactories.ts`

Clangorous Soul: costs 1/3 of max HP, boosts all five stats by +1. Fails if HP ≤ 1/3 of max.

- [ ] **Step 1:** Write test — user at 150 HP (maxHp=150) uses Clangorous Soul; HP drops by 50, all five stats +1.
- [ ] **Step 2:** Implement as `custom()`.
- [ ] **Step 3:** Register `clangoroussoul`.

---

### Task 6: Take Heart

**File:** `registrations.ts`, `effectFactories.ts`

Take Heart: +1 SpA, +1 SpD, cure user's status condition. Applies both even if no status.

- [ ] **Step 1:** Write test — with burned user: status cleared, spa+1, spd+1.
- [ ] **Step 2:** Implement and register `takeheart`.
- [ ] **Step 3:** Run tests.

---

### Task 7: Acupressure

**File:** `registrations.ts`, `effectFactories.ts`

Acupressure: raise a random stat that isn't already at +6 by 2 stages. Fails if all stats are at +6.

Stats to consider: atk, def, spa, spd, spe, accuracy, evasion.

- [ ] **Step 1:** Write test — with mocked RNG, the expected stat gets +2.
- [ ] **Step 2:** Implement as `custom()` using `ctx.rng`. Build list of eligible stats (not at +6), pick random one, apply +2.
- [ ] **Step 3:** Register `acupressure`.

---

### Task 8: Laser Focus

**File:** `registrations.ts`, `effectFactories.ts`

Laser Focus: user's next move is guaranteed to land a critical hit (for one turn). Track as volatile status `{ name: 'laser-focus' }`. In `BattleEngine`, when computing crit stage, if user has this volatile, force a crit. Clear the volatile after the move.

- [ ] **Step 1:** Add `laser-focus` volatile handling to `computeCritStage` in `BattleEngine.ts` (or the crit computation path): if `attacker.volatileStatus.some(v => v.name === 'laser-focus')`, set crit chance to 1.0.
- [ ] **Step 2:** Clear `laser-focus` volatile at start of the turn the attack is used.
- [ ] **Step 3:** Register `laserfocus` as `applyVolatileSelf('laser-focus')`.
- [ ] **Step 4:** Write test — attack after Laser Focus is always a critical hit.
- [ ] **Step 5:** Run tests.

---

### Task 9: Stockpile & Swallow

**Files:** `registrations.ts`, `effectFactories.ts`, `EffectEngine.ts`

**Stockpile:** accumulate up to 3 charges as volatile `{ name: 'stockpile', count: 1|2|3 }`. Each use also raises Def and SpD by +1. Fails at 3 charges.

**Swallow:** heal based on stockpile count (33% / 66% / 100% of max HP for counts 1/2/3). Remove stockpile volatile after use. Fails if no stockpile.

(Spit Up is a damage move handled in Plan 14 — coordinate to avoid duplicate stockpile volatile logic.)

- [ ] **Step 1:** Write test — Stockpile 3× accumulates to count 3 and raises Def+3 and SpD+3 total. Using Swallow at count 2 heals 66% and clears the volatile.
- [ ] **Step 2:** Register `stockpile` as a `custom()` handler that manages the volatile.
- [ ] **Step 3:** Register `swallow` as a `custom()` handler.
- [ ] **Step 4:** Run tests.

---

### Task 10: Geomancy (2-Turn Charge)

**File:** `registrations.ts`, `effectFactories.ts`

Geomancy charges on turn 1 (add `geomancy-charge` volatile, return), then on turn 2 boosts SpA/SpD/Spe by +2 and removes the volatile. Power Herb skips the charge. Check the existing charge-turn infrastructure in `BattleEngine` — if status moves don't use the secondaries `charge` system, implement the 2-turn logic directly in the handler using the volatile.

- [ ] **Step 1:** Write test — Geomancy on turn 1 adds volatile and returns; on turn 2 applies +2 to three stats.
- [ ] **Step 2:** Implement as `custom()` handler. Check for `geomancy-charge` volatile; if absent add it (turn 1). If present, remove it and apply stats (turn 2). Handle Power Herb: if user has Power Herb, skip the charge and consume the item.
- [ ] **Step 3:** Register `geomancy`.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`.

---

### Task 11: Defend Order, Heal Order, Attack Order

These are Vespiquen moves with standard effects — register quickly:

- `defendorder` → `multiStatModSelf({ def: 1, spd: 1 })` (same as Cosmic Power)
- `attackorder` → already a physical damage move with high crit ratio (already in move data; no handler needed)
- `healorder` → `healPercent(0.5)`

- [ ] Register and test. Run `npm test`.

---

### Task 12: Growth in Sun

**File:** `registrations.ts`

Update `growth` registration from Task 1 to be weather-sensitive: +2 to both Atk and SpA in Sun/Harsh Sun, +1 otherwise.

- [ ] **Step 1:** Write test — Growth in sun gives +2/+2, outside sun gives +1/+1.
- [ ] **Step 2:** Replace `multiStatModSelf` with `custom()` handler.
- [ ] **Step 3:** Run tests.
