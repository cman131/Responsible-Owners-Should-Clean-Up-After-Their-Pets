# Plan 17 — Opponent Manipulation Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register handlers for status moves that inflict conditions on, reduce stats of, or trap the opponent. Most use existing factories (`statModTarget`, `applyVolatileTarget`). A few need new volatiles or custom logic (Curse, Attract, Nightmare, Topsy-Turvy, Spite, Minimize's double-damage interaction).

**Already registered (skip):** `leer`, `growl`, `screech`, `charm`, `faketears`, `flash`, `sandattack`, `confuseray`, `supersonic`, `sweetkiss`, `leechseed`, `foresight`, `odorsleuth`, `miracleeye`, `taunt`, `torment`, `embargo`, `healblock`, `disable`.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. Test file: `npx vitest run src/engine/__tests__/opponentManipulation.test.ts`.

---

### Task 1: Simple Stat Drop Registrations

**File:** `packages/server/src/engine/registrations.ts`

These use the existing `statModTarget` factory:

- [ ] **Step 1:** Write tests confirming each move drops the correct stat.
- [ ] **Step 2:** Register:
  ```typescript
  r.register('tickle',       multiStatModTarget({ atk: -1, def: -1 }));
  r.register('scaryface',    statModTarget('spe', -2));
  r.register('tearfullook',  multiStatModTarget({ atk: -1, spa: -1 }));
  r.register('nobleroar',    multiStatModTarget({ atk: -1, spa: -1 }));
  r.register('featherdance', statModTarget('atk', -2));
  r.register('captivate',    statModTarget('spa', -2)); // should fail vs same gender; skip gender check
  r.register('babydolleyes', statModTarget('atk', -1)); // priority already in move data
  r.register('eerieimpulse', statModTarget('spa', -2));
  r.register('stringshot',   statModTarget('spe', -2));
  r.register('cottonspore',  statModTarget('spe', -2));
  r.register('smokescreen',  statModTarget('accuracy', -1));
  r.register('kinesis',      statModTarget('accuracy', -1));
  r.register('sweetscent',   statModTarget('evasion', -2));
  r.register('confide',      statModTarget('spa', -1));
  r.register('playnice',     statModTarget('atk', -1));
  r.register('spicyextract', multiStatModTarget({ spa: 2, def: -2 })); // boosts target spa, drops def
  r.register('venomdrench',  null); // conditional; see Task 4
  ```
  Note: `multiStatModTarget` may not exist yet — create it in `effectFactories.ts` mirroring `multiStatModSelf` but targeting the opponent.
- [ ] **Step 3:** Run `npm test`.

---

### Task 2: Attract & Infatuation

**Files:** `registrations.ts`, `effectFactories.ts`, possibly `EffectEngine.ts`

Attract: apply `infatuation` volatile to target. Each turn the infatuated Pokemon has a 50% chance to fail to move (checked in pre-move). For our scope, skip gender check (any Pokemon can be attracted).

- [ ] **Step 1:** Add `infatuation` to the pre-move check in `EffectEngine.runPreMove`: if active pokemon has `infatuation` volatile, roll `rng() < 0.5`; if true, emit `move-blocked { reason: 'infatuation' }` and return early.
- [ ] **Step 2:** Add infatuation EOT/expiry (Attract lasts until the pokemon switches out — handle via switch-out volatile clearing).
- [ ] **Step 3:** Register `attract` as `applyVolatileTarget('infatuation')`.
- [ ] **Step 4:** Write test — attracted Pokemon fails to move 50% of the time with seeded RNG.
- [ ] **Step 5:** Run tests.

---

### Task 3: Nightmare

**Files:** `registrations.ts`, `effectFactories.ts`, `EffectEngine.ts`

Nightmare: applies `nightmare` volatile to target. Each end-of-turn while the target is asleep, it takes 25% max HP damage.

- [ ] **Step 1:** In `EffectEngine.runEndOfTurn`, add: for each active pokemon with `nightmare` volatile, if `member.status === 'slp'`, deal `Math.floor(member.maxHp / 4)` damage and emit `damage-dealt { source: 'nightmare' }`. If not asleep, remove the volatile (cured on wake).
- [ ] **Step 2:** Register `nightmare` as `applyVolatileTarget('nightmare')`.
- [ ] **Step 3:** Write test — sleeping Pokemon with Nightmare takes 25% HP at end of turn.
- [ ] **Step 4:** Run tests.

---

### Task 4: Venom Drench

**File:** `registrations.ts`, `effectFactories.ts`

Venom Drench: lower target's Atk, SpA, and Spe by 1 each, but only if the target is poisoned or badly poisoned. Fail if not poisoned.

- [ ] **Step 1:** Write test — fails if target has no status; applies -1/-1/-1 if poisoned.
- [ ] **Step 2:** Implement as `custom()` handler. Check `target.status === 'psn' || target.status === 'tox'`. If not, emit `move-failed`. If yes, apply stat changes.
- [ ] **Step 3:** Register `venomdrench`.

---

### Task 5: Curse (Ghost variant + Non-Ghost variant)

**Files:** `registrations.ts`, `effectFactories.ts`

Curse is type-dependent on the user:
- **Ghost type user:** pay 50% max HP, apply `curse` volatile to target. EOT: target takes 25% max HP damage. User does not gain stats.
- **Non-Ghost type user:** +1 Atk, +1 Def, -1 Spe (already works via `multiStatModSelf` if we can detect the type).

Use `ctx.battle` to look up attacker's types.

- [ ] **Step 1:** Write tests — Ghost user applies EOT damage volatile on target; Normal user gets stat changes.
- [ ] **Step 2:** Add `curse` EOT handler in `EffectEngine.runEndOfTurn`: deal 25% max HP to cursed pokemon each turn.
- [ ] **Step 3:** Implement `curse` handler and register.
- [ ] **Step 4:** Run tests.

---

### Task 6: Taunt Stat Drop Variants (Tar Shot)

**Files:** `registrations.ts`, `effectFactories.ts`

Tar Shot: -1 Spe, then apply volatile that makes Fire moves 2× effective against the target. The 2× modifier needs to interact with type effectiveness. Simplest approach: add a `tar-shot` volatile and check it in the type effectiveness path in `BattleEngine.ts`.

- [ ] **Step 1:** Register `tarshot` as a custom handler that applies -1 spe and `tar-shot` volatile.
- [ ] **Step 2:** In `BattleEngine.executeMove`, after type effectiveness is computed: if `target.volatileStatus.some(v => v.name === 'tar-shot') && effectiveMoveType === 'Fire'`, multiply `effectiveness` by 2.
- [ ] **Step 3:** Write test — Fire move against tar-shot target deals 2× expected damage.
- [ ] **Step 4:** Run tests.

---

### Task 7: Topsy-Turvy

**File:** `registrations.ts`, `effectFactories.ts`

Topsy-Turvy: invert all of target's stat stages. Fail if all stages are 0.

- [ ] **Step 1:** Write test — target with atk+2/def-1 becomes atk-2/def+1 after Topsy-Turvy.
- [ ] **Step 2:** Implement as `custom()`. For each stat in `statBoosts`, negate the value. Fail if all are 0.
- [ ] **Step 3:** Register `topsyturvy`.

---

### Task 8: Spite

**File:** `registrations.ts`, `effectFactories.ts`

Spite: reduce the PP of the target's last used move by 4. Fail if target has no `lastMoveId` or PP is already 0.

- [ ] **Step 1:** Write test — target used Flamethrower (10 PP); after Spite, Flamethrower PP is 6.
- [ ] **Step 2:** Implement as `custom()`. Find target's `lastMoveId`, locate the move slot, deduct PP (minimum 0). Emit a PP event if one exists, or `move-note`.
- [ ] **Step 3:** Register `spite`.

---

### Task 9: Mean Look / Block / Spider Web / Octolock / No Retreat (Trapping)

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleEngine.ts`

These moves prevent the target from switching. The volatile `trapped` should be checked in the action validation path (where valid actions are computed). Mean Look/Block/Spider Web apply the same `trapped` volatile; Octolock additionally lowers Def/SpD each turn; No Retreat applies `no-retreat` to the user (traps them too) and boosts all stats.

- [ ] **Step 1:** Verify that the `canSwitch` check in the action-request path reads from volatile status. If not, add a check for `trapped` volatile.
- [ ] **Step 2:** Register `meanlook`, `block`, `spiderweb` as `applyVolatileTarget('trapped')`.
- [ ] **Step 3:** Register `octolock` as a `custom()` that applies `trapped` and also drops Def/SpD at EOT.
- [ ] **Step 4:** Register `noretreat` as a `custom()` that applies `trapped` to self and boosts all stats +1.
- [ ] **Step 5:** Write tests — pokemon with `trapped` volatile cannot switch; Octolock drops stats each turn.
- [ ] **Step 6:** Run `npm test` and `npm run typecheck`.

---

### Task 10: Minimize & Double-Damage Interaction

**File:** `registrations.ts`, and `BattleEngine.ts`

Minimize: +2 evasion (registration is simple). Additionally, certain moves deal double damage to minimized targets (Stomp, Body Slam, Dragon Rush, Phantom Force, etc.).

- [ ] **Step 1:** Register `minimize` as `statModSelf('evasion', 2)`.
- [ ] **Step 2:** In `BattleEngine.executeMove`, add to the `effectiveBasePower` section: if `target.volatileStatus.some(v => v.name === 'minimize')` and `MINIMIZE_DOUBLES.has(move.id)`, double the effective base power. Define `MINIMIZE_DOUBLES = new Set(['stomp', 'steamroller', 'bodyslam', 'dragonrush', 'phantomforce', 'shadowforce', 'flyingpress'])`.
- [ ] **Step 3:** Register `doubleteam` as `statModSelf('evasion', 1)`.
- [ ] **Step 4:** Write test — Stomp deals double damage against minimized target.
- [ ] **Step 5:** Run tests.

---

### Task 11: Imprison

**Files:** `registrations.ts`, `effectFactories.ts`, `BattleEngine.ts`

Imprison: prevent the opponent from using any move that the user also knows. Apply `imprison` volatile to the user. In move validation (pre-move or action request), if opponent has `imprison` volatile on the other active Pokemon, block moves shared with the imprisoning Pokemon.

- [ ] **Step 1:** Write test — after Imprison, opponent cannot use a move that the imprisoning Pokemon knows.
- [ ] **Step 2:** Implement the move-lock check in `EffectEngine.runPreMove` or in the action-request valid-moves list.
- [ ] **Step 3:** Register `imprison` as `applyVolatileSelf('imprison')`.
- [ ] **Step 4:** Run `npm test`.
