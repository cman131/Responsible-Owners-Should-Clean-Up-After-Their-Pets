# Plan 14 — Special Resolution Damage Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement damage moves whose resolution logic is fundamentally different from the standard damage formula — fixed/level-based damage, HP-setting moves, counter mechanics, stat-overriding moves, phasing, and party-dependent multi-hit. These cannot be handled by just changing `effectiveBasePower`.

**Architecture:** Each move type gets its own resolution path, inserted before the normal `calcDamage` call in the per-target loop of `BattleEngine.executeMove`. Moves that need incoming-damage tracking (Counter, Mirror Coat, Metal Burst) require a new `lastDamageTaken` field on `PartyMember` or `SlotState`, populated each time damage is dealt. Phasing moves (Dragon Tail, Circle Throw) reuse the existing force-switch infrastructure used by faint-replacement, or introduce a minimal `processForceSwitch` path.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** Run from `packages/server/`: `npm test`. Test file: `npx vitest run src/engine/__tests__/specialDamage.test.ts`.

**Damage reference** (L50, Atk=100, Def=100):
- Level 50 Seismic Toss hits: **50 hp**

---

### Task 1: Track Last Damage Taken (Counter / Mirror Coat / Metal Burst)

**Files:**
- Modify: `packages/shared/src/types/battle.ts` — add `lastDamageTaken?: { amount: number; category: 'physical' | 'special'; fromSlotId: string }` to `PartyMember`
- Modify: `packages/server/src/engine/BattleEngine.ts` — set `target.lastDamageTaken` whenever actual (non-substitute) damage lands

- [ ] **Step 1:** Add `lastDamageTaken` to `PartyMember`. Clear it to `undefined` at the start of each turn's `executeMove` for the active pokemon (or at start-of-turn sweep).
- [ ] **Step 2:** In the damage application block of `BattleEngine.executeMove` (after `cappedDamage` is computed, around line 724+), set:
  ```typescript
  target.lastDamageTaken = { amount: cappedDamage, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
  ```
- [ ] **Step 3:** Write a test: after a physical move deals damage, the target's `lastDamageTaken.amount` equals the damage dealt, `.category` is `'physical'`.
- [ ] **Step 4:** Run `npm test`.

---

### Task 2: Counter / Mirror Coat / Metal Burst

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

Resolution: Before the normal damage formula, check if `move.effectId` is one of these. If so, use `lastDamageTaken` on the user (the Counter user got hit, now retaliates):

```
counter:     if lastDamageTaken is physical → deal lastDamageTaken.amount * 2 to target
mirrorcoat:  if lastDamageTaken is special  → deal lastDamageTaken.amount * 2 to target
metalburst:  if lastDamageTaken exists      → deal Math.floor(lastDamageTaken.amount * 1.5) to target
comeuppance: same as metalburst
```

If the condition isn't met (no damage taken, or wrong category), emit `move-failed`.

- [ ] **Step 1:** Write failing tests in `specialDamage.test.ts`:
  - Counter after taking 30 physical damage → target takes 60
  - Counter with no prior damage → move-failed
  - Mirror Coat after taking 40 special → target takes 80
  - Mirror Coat after physical damage → move-failed
- [ ] **Step 2:** Implement in `BattleEngine.ts` — add a resolution branch before `calcDamage` inside the per-target loop that checks `COUNTER_MOVES = new Set(['counter', 'mirrorcoat', 'metalburst', 'comeuppance'])`.
- [ ] **Step 3:** Run tests — all pass.

---

### Task 3: Fixed & Level-Based Damage (Seismic Toss, Night Shade, Dragon Rage, Sonic Boom)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

```
seismictoss:  damage = attacker.level  (type immune — Normal type, Ghost immune)
nightshade:   damage = attacker.level  (Ghost type)
dragonrage:   damage = 40
sonicboom:    damage = 20
```

These bypass the damage formula entirely. They also bypass effectiveness (Dragon Rage and Sonic Boom always deal fixed damage regardless of type; Seismic Toss/Night Shade fail on immune types — effectiveness check still applies before this point, so that's already handled by the type effectiveness code).

- [ ] **Step 1:** Write tests — Seismic Toss at level 50 deals exactly 50 HP, Dragon Rage deals exactly 40 HP.
- [ ] **Step 2:** Add `FIXED_DAMAGE_MOVES` map: `{ seismictoss: (atk) => atk.level, nightshade: (atk) => atk.level, dragonrage: () => 40, sonicboom: () => 20 }` and resolve before `calcDamage`.
- [ ] **Step 3:** Run tests.

---

### Task 4: HP-Halving & HP-Setting Moves

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

```
superfang / naturesmadness / ruination:
  damage = Math.floor(target.currentHp / 2)   (minimum 1, fail if target HP = 1)

endeavor:
  if target.currentHp <= attacker.currentHp → move-failed
  damage = target.currentHp - attacker.currentHp

finalgambit:
  damage = attacker.currentHp
  after damage: attacker.currentHp = 0, attacker.fainted = true (emit faint event)
```

- [ ] **Step 1:** Write tests:
  - Super Fang on 100 HP target → 50 damage
  - Endeavor with attacker at 30 HP, target at 80 HP → 50 damage, target HP becomes 30
  - Endeavor with attacker HP ≥ target HP → move-failed
  - Final Gambit with attacker at 40 HP → target takes 40 HP, attacker faints
- [ ] **Step 2:** Implement in `BattleEngine.ts` — add a `HP_BASED_MOVES` check branch before `calcDamage`.
- [ ] **Step 3:** Run tests.

---

### Task 5: Stat-Override Damage (Foul Play, Body Press)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

In the damage formula section (~line 612), `rawAtkStat` is selected from `attacker.stats`. Override this for two moves:

```
foulplay:   rawAtkStat = target.stats.atk   (physical move using target's Atk stat)
bodypress:  rawAtkStat = attacker.stats.def (physical move using user's Def stat)
```

The boost is also swapped for Foul Play: use `target.statBoosts.atk` (not attacker's).

- [ ] **Step 1:** Write tests — Foul Play with attacker Atk=80, target Atk=150 should deal damage equivalent to a 95-BP physical move from a 150 Atk pokemon.
- [ ] **Step 2:** In BattleEngine, immediately after `rawAtkStat` is assigned, override it:
  ```typescript
  if (move.effectId === 'foulplay') { rawAtkStat = target.stats.atk; /* also swap boostKey source */ }
  if (move.effectId === 'bodypress') { rawAtkStat = attacker.stats.def; /* boostKey = 'def' */ }
  ```
- [ ] **Step 3:** Run `npm test`.

---

### Task 6: Beat Up

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

Beat Up hits once per healthy, non-statused party member. Each hit's power = `Math.floor(member.baseStats.atk / 10) + 5`. This requires access to base Atk (not calculated stat) — check if `getSpecies` returns base stats.

```
hits = attacker's party members that are not fainted and have no status condition
per hit: damage = calcDamage({ basePower: floor(memberBaseAtk / 10) + 5, level: attacker.level, attackStat: attacker.stats.atk (or 10?), ... })
```

Per Showdown/Gen 5+ mechanics: each hit uses the user's level, the target's defense, and the base attack of each party member divided by 10 + 5. The attack stat used is just `10` (a simplified formula) — verify against Bulbapedia.

- [ ] **Step 1:** Write test — Beat Up with 3 healthy party members hits 3 times.
- [ ] **Step 2:** Implement as a special resolution path. The multihit loop already exists; adapt it to iterate over party members instead of rolling hit count.
- [ ] **Step 3:** Run tests.

---

### Task 7: Dragon Tail / Circle Throw (Phasing)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Possibly modify: `packages/server/src/engine/EffectEngine.ts`

These moves deal normal damage (basePower 60) then force the target to switch to a random benched, non-fainted party member. They fail if:
- Target has no bench to switch to (only one Pokemon left)
- Target is trapped
- Target has used Ingrain

Resolution after damage:
1. Pick a random non-fainted, non-active party member from the target's party
2. Switch active index to that member (mirroring the faint-replacement logic)
3. Emit a `force-switch` event (or reuse `pokemon-switched-in` with a flag)
4. Dragon Tail/Circle Throw have negative priority and only trigger the switch if target is still alive after damage

- [ ] **Step 1:** Add a secondary kind `'force-switch'` to the secondaries schema (or handle inline in BattleEngine by checking `move.effectId`). Check how faint-replacement switching works and reuse that path.
- [ ] **Step 2:** Write test — Dragon Tail deals damage and the target's active Pokemon changes to a bench member.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`.

---

### Task 8: Magnitude

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

Magnitude picks one of 7 tiers with weighted probability, each with a display number and base power:

| Roll | Magnitude | BP |
|------|-----------|-----|
| 5%   | 4         | 10  |
| 10%  | 5         | 30  |
| 20%  | 6         | 50  |
| 30%  | 7         | 70  |
| 20%  | 8         | 90  |
| 10%  | 9         | 110 |
| 5%   | 10        | 150 |

- [ ] **Step 1:** Write test — with a seeded RNG, Magnitude resolves to the expected tier.
- [ ] **Step 2:** Implement before `calcDamage`: if `move.effectId === 'magnitude'`, roll tier and set `effectiveBasePower`. Emit an additional event `{ type: 'move-note', data: { note: 'Magnitude 7!' } }` or similar so the UI can display the tier.
- [ ] **Step 3:** Run tests.

---

### Task 9: Bide

**Files:**
- Modify: `packages/shared/src/types/battle.ts` — add `bideDamage?: number; bideCounter?: number` to `VolatileStatusEntry` or as fields on `PartyMember`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

Bide is a status move that:
1. Turn 1: user enters "biding" state, accumulates damage taken this turn
2. Turn 2: user continues accumulating, still locked
3. Turn 3: user releases — deals 2× accumulated damage to the last attacker

- [ ] **Step 1:** Add `bide` volatile with `{ name: 'bide', counter: 2, accumulated: 0 }`.
- [ ] **Step 2:** In the damage-taken path, if the hit target has an active `bide` volatile, increment `accumulated += damage`.
- [ ] **Step 3:** In `EffectEngine.runPreMove`, if the active pokemon has a `bide` volatile, decrement counter. On reaching 0, execute the release: deal `accumulated * 2` to the last attacker (use `lastDamageTaken.fromSlotId`). Clear the volatile.
- [ ] **Step 4:** Write test — pokemon using Bide accumulates 2 turns of damage and releases 2× on turn 3.
- [ ] **Step 5:** Run `npm test`.

---

### Task 10: Misc Remaining Moves

Quick implementations for remaining moves in this plan. Each is a short special case in BattleEngine:

**Psywave:** `damage = Math.max(1, Math.floor(attacker.level * (rng() * 1.5 + 0.5)))`

**Present:** Roll: 40% chance 40 BP, 30% chance 80 BP, 10% chance 120 BP, 20% chance heal target 25% max HP.

**Spit Up:** `damage = 100 * stockpileCount` (check for `stockpile` volatile; fail if none). Remove stockpile volatile after use.

**Fling:** Power and effect from a lookup table by item id. Item is consumed (remove `heldItem`). Fail if no held item. See Bulbapedia's Fling power list for the table (~20 entries cover most competitive items).

**Nature Gift:** Fail if no Berry. Power/type from berry lookup table. Berry consumed after use.

**Psywave, Trump Card** (low priority — implement as TODO stubs that emit `move-failed { reason: 'unimplemented' }` for now).

- [ ] **Step 1:** Implement Psywave test + implementation.
- [ ] **Step 2:** Implement Present test + implementation.
- [ ] **Step 3:** Implement Spit Up test + implementation.
- [ ] **Step 4:** Implement Fling (competitive subset: 10–130 BP items) test + implementation.
- [ ] **Step 5:** Run `npm test` and `npm run typecheck`.
