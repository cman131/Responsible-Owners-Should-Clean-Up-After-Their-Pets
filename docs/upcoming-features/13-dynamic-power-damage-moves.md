# Plan 13 — Dynamic Power: Conditional & Formula Damage Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix damage moves whose power depends on runtime conditions (status, HP ratio, speed, weight, stat stages, turn order, held item, consecutive-use counter). All currently deal incorrect damage because `move.basePower` is used raw instead of a computed value.

**Architecture:** Introduce `packages/server/src/engine/dynamicPower.ts` — a pure function `resolvePower(move, attacker, target, field): number` that dispatches on `move.effectId`. In `BattleEngine.ts`, after the existing Weather Ball special case (~line 417), call `resolvePower` to override `effectiveBasePower` when an effectId is registered. No change to the damage formula itself.

**Weight prerequisite:** Low Kick, Grass Knot, Heavy Slam, Heat Crash require the target's (and user's) weight in kg. Verify whether `this.data.getSpecies()` returns a `weight` field. If it doesn't, add `weight: number` to the species data shape and populate it from `data/pokemon.json` (Showdown's `weightkg` field). Do this as the first task.

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** Run from `packages/server/`: `npm test`. Individual file: `npx vitest run src/engine/__tests__/dynamicPower.test.ts`.

**Damage reference** (L50, Atk=100, Def=100, `Math.random()=0.5` → factor 0.93):
- Tackle BP40 neutral: **17 hp**
- Body Slam BP85 neutral: **36 hp**

---

### Task 1: Weight Data Prerequisite

**Files:**
- Check: `packages/server/src/engine/DataService.ts` (or wherever `getSpecies` is defined)
- Maybe modify: species type in `packages/shared/src/types/` or local type
- Maybe modify: `data/pokemon.json` population script

- [ ] **Step 1:** Inspect the return type of `this.data.getSpecies(speciesId)`. If it already has `weight` (or `weightkg`), note the field name and skip to Task 2.
- [ ] **Step 2 (if missing):** Add `weightkg: number` to the species type. Populate it from the `weightkg` field in Showdown's `data/pokemon.json` (already present). Verify with a quick node REPL check that a few Pokemon have sane values (Snorlax ~460 kg, Gastly ~0.1 kg).
- [ ] **Step 3:** Run `npm test` — all existing tests still pass.

---

### Task 2: Create `dynamicPower.ts` with Failing Tests

**Files:**
- Create: `packages/server/src/engine/dynamicPower.ts`
- Create: `packages/server/src/engine/__tests__/dynamicPower.test.ts`

- [ ] **Step 1: Write failing tests** for a representative sample of formulas:

```typescript
import { describe, it, expect } from 'vitest';
import { resolvePower } from '../dynamicPower.js';
// minimal stubs
const mon = (overrides = {}) => ({
  stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  currentHp: 100, maxHp: 100, status: undefined, heldItem: undefined,
  volatileStatus: [], level: 50,
  ...overrides,
});
const move = (id: string, basePower = 0) => ({ id, effectId: id, basePower, type: 'Normal', category: 'physical' });
const field = () => ({ weather: undefined, terrain: undefined, trickroom: 0, gravity: 0, sideConditions: [{}, {}] });

describe('resolvePower', () => {
  it('returns basePower for unregistered effectId', () => {
    expect(resolvePower(move('tackle', 40), mon(), mon(), field())).toBe(40);
  });
  it('facade: doubles when user has status', () => {
    expect(resolvePower(move('facade', 70), mon({ status: 'brn' }), mon(), field())).toBe(140);
    expect(resolvePower(move('facade', 70), mon(), mon(), field())).toBe(70);
  });
  it('hex: doubles when target has status', () => {
    expect(resolvePower(move('hex', 65), mon(), mon({ status: 'par' }), field())).toBe(130);
    expect(resolvePower(move('hex', 65), mon(), mon(), field())).toBe(65);
  });
  it('flail: 200 at ≤4% HP', () => {
    const low = mon({ currentHp: 2, maxHp: 100 });
    expect(resolvePower(move('flail', 0), low, mon(), field())).toBe(200);
  });
  it('gyroball: capped at 150', () => {
    const fast = mon({ stats: { spe: 200 } as any });
    const slow = mon({ stats: { spe: 10 } as any });
    expect(resolvePower(move('gyroball', 0), slow, fast, field())).toBe(150);
  });
  it('storedpower: 20 + 20 per stage', () => {
    const boosted = mon({ statBoosts: { atk: 2, def: 1, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } });
    expect(resolvePower(move('storedpower', 20), boosted, mon(), field())).toBe(80); // 20 + 3*20
  });
  it('acrobatics: doubled without item', () => {
    expect(resolvePower(move('acrobatics', 55), mon({ heldItem: undefined }), mon(), field())).toBe(110);
    expect(resolvePower(move('acrobatics', 55), mon({ heldItem: 'oran-berry' }), mon(), field())).toBe(55);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/engine/__tests__/dynamicPower.test.ts` — confirm tests fail (module not found or assertions fail).

---

### Task 3: Implement `dynamicPower.ts`

**File:** `packages/server/src/engine/dynamicPower.ts`

Implement `resolvePower(move, attacker, target, field): number`. Return `move.basePower` as default. Register each formula below:

**Status-conditional doublers (check conditions; if met return `move.basePower * 2`):**
- `facade`: double if `attacker.status` is any of `brn | par | psn | tox | slp | frz`
- `hex`: double if `target.status` is set
- `venoshock`: double if `target.status` is `psn` or `tox`
- `brine`: double if `target.currentHp / target.maxHp <= 0.5`
- `smellingsalts`: double if `target.status === 'par'`
- `wakeupslap`: double if `target.status === 'slp'`
- `retaliate`: double if field has a `lastFaintedTeam` flag matching the user's team (see note below on how to track this — may be out of scope; skip if tracking not available, document as TODO)

**Stat-stage-based:**
- `storedpower`: `20 + 20 * sumPositiveStages(attacker.statBoosts)`
- `punishment`: `Math.min(200, 60 + 20 * sumPositiveStages(target.statBoosts))`

**HP-ratio (user HP):**
```
flail / reversal:
  ratio = currentHp / maxHp
  if ratio > 0.50: 20
  if ratio > 0.35: 40
  if ratio > 0.20: 80
  if ratio > 0.10: 100
  if ratio > 0.04: 150
  else:            200
```

**HP-ratio (target HP):**
```
wringout / crushgrip / hardpress:
  Math.max(1, Math.floor(120 * target.currentHp / target.maxHp))
```

**Turn-order-based (may need flag on field/volatile; implement as TODO if state not available):**
- `payback`: double if attacker moved after target this turn
- `avalanche`: double if attacker took damage from target this turn
- `assurance`: double if target already took damage this turn

**Speed-based:**
- `gyroball`: `Math.min(150, Math.floor(25 * target.stats.spe / Math.max(1, attacker.stats.spe)))`
- `electroball`: look up the standard Gen 5 speed-ratio table (5 tiers → 40/60/80/120/150)

**Item-based:**
- `acrobatics`: double if `attacker.heldItem` is falsy

**Weight-based (use `getWeight(speciesId)` helper that reads from data):**
```
lowkick / grassknot:
  w = target weight in kg
  if w >= 200: 120
  if w >= 100: 100
  if w >= 50:   80
  if w >= 25:   60
  if w >= 10:   40
  else:         20

heavyslam / heatcrash:
  ratio = attacker weight / target weight
  if ratio >= 5:   120
  if ratio >= 4:   100
  if ratio >= 3:    80
  if ratio >= 2:    60
  else:             40
```

**Consecutive-use (needs volatile counter — skip if infrastructure not ready, document as TODO):**
- `echoedvoice`: 40 per consecutive turn it's used (needs `echoedVoiceCount` field on field state)
- `rollout` / `iceball`: doubles each hit in 5-turn sequence (needs volatile counter)

**Friendship-based (add `friendship: number` to `PartyMember` if missing, default 70):**
- `return`: `Math.max(1, Math.floor(attacker.friendship * 2 / 5))`
- `frustration`: `Math.max(1, Math.floor((255 - attacker.friendship) * 2 / 5))`

- [ ] **Step 1:** Implement the file.
- [ ] **Step 2:** Run the test file — all tests pass.
- [ ] **Step 3:** Run `npm test` — all existing tests still pass.

---

### Task 4: Wire into `BattleEngine.ts`

**File:** `packages/server/src/engine/BattleEngine.ts`

After the existing Weather Ball special case (~line 417):

```typescript
// Dynamic base power (effectId-based formula overrides)
const resolvedPower = resolvePower(move, attacker, target, s.field);
if (resolvedPower !== move.basePower) {
  effectiveBasePower = resolvedPower;
}
```

Wait — `target` isn't available at that point (it's above the per-target loop). For moves that depend on the target (hex, flail, wringout, gyroball, heavyslam), the resolution must happen inside the per-target loop, after `target` is resolved. For moves that depend only on the attacker (facade, acrobatics, return), it can stay outside.

Adjust the plan:
- Attacker-only formulas (facade, acrobatics, return, frustration, storedpower, payback, avalanche, retaliate, gyroball if only using attacker speed): resolve before the loop and store as `effectiveBasePower`
- Target-dependent formulas (hex, venoshock, brine, smellingsalts, wakeupslap, flail, reversal, wringout, crushgrip, hardpress, punishment, lowkick, grassknot, heavyslam, heatcrash): compute a `perTargetPower` inside the per-target loop, override `effectiveBasePower` locally for `calcDamage`

In `dynamicPower.ts`, expose two helpers if needed: `resolveAttackerPower` and `resolveTargetPower`, or flag moves as target-dependent and only call once target is known.

- [ ] **Step 1:** Implement the wiring in BattleEngine. Use separate calls before and inside the per-target loop.
- [ ] **Step 2:** Write an integration test in `__tests__/BattleEngine.test.ts` (or a new `__tests__/dynamicPower.integration.test.ts`) that:
  - Verifies Facade deals 140-BP equivalent damage when user is burned
  - Verifies Hex deals 130-BP equivalent damage when target is paralyzed
  - Verifies Gyro Ball caps at 150 BP when user is much slower than target
- [ ] **Step 3:** Run `npm test` — all tests pass.
- [ ] **Step 4:** Run `npm run typecheck`.
