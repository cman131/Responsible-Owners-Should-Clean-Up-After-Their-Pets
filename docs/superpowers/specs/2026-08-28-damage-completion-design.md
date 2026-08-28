# Damage Calculation Completion — Design

**Date:** 2026-08-28
**Feature doc:** `docs/upcoming-features/02-damage-completion.md`
**Status:** Approved, ready for implementation planning

---

## Overview

Implements four missing mechanics in the damage pipeline:

1. **Accuracy / miss rolls** — moves can miss based on their accuracy and attacker/defender stage modifiers
2. **Critical hits** — Gen 6+ stage-based crit system with Focus Energy and high-crit-ratio move support
3. **Thaw on fire hit** — frozen Pokémon are cured before taking damage from Fire-type moves
4. **Weather damage modifier** — sun/rain boost or halve Fire/Water move power

---

## File Structure

| File | Change |
|------|--------|
| `data/scripts/seed.ts` | Add `critRatio` to move mapping (PS critRatio > 1 → our `1`) |
| `data/moves.json` | Regenerated — high-crit moves get `critRatio: 1` |
| `packages/shared/src/types/pokemon.ts` | Add `critRatio?: number` to `Move` interface |
| `packages/shared/src/types/events.ts` | Add `'miss'` and `'crit'` to `TurnResolveEvent.type` union |
| `packages/shared/src/schemas/move.schema.ts` | Add `critRatio: z.number().int().optional()` to `MoveSchema` |
| `packages/server/src/engine/accuracy.ts` | **New file** — pure functions for stage tables, hit chance, crit probability |
| `packages/server/src/engine/damage.ts` | Add `weather?: WeatherType` and `moveType: PokemonType` to `DamageInput`; apply sun/rain modifier |
| `packages/server/src/engine/BattleEngine.ts` | Wire accuracy roll, crit roll, thaw-on-fire-hit; add `rng` constructor option |
| `packages/server/src/engine/__tests__/accuracy.test.ts` | New — pure unit tests for `accuracy.ts` |
| `packages/server/src/engine/__tests__/damage.test.ts` | Extend — weather modifier cases |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Extend — accuracy/crit/thaw via injectable `rng` |

---

## Data Changes

### `data/scripts/seed.ts`

Add `critRatio` to the move mapping. `@pkmn/dex` uses `critRatio: 1` for normal, `critRatio: 2` for high-crit. We normalize: PS value > 1 → our `1`; otherwise omit.

```typescript
const allMoves = gen9.moves.all().map((m) => ({
  // ... existing fields ...
  critRatio: (m.critRatio ?? 1) > 1 ? 1 : undefined,
}));
```

After updating the seed script, regenerate `moves.json` by running the seed script. High-crit moves include (not exhaustive): Slash, Razor Leaf, Crabhammer, Stone Edge, Night Slash, Cross Poison, Leaf Blade, Psycho Cut, Shadow Claw, Aeroblast, Attack Order, Spacial Rend, Zippy Zap.

---

## Shared Type Changes

### `packages/shared/src/types/pokemon.ts`

Add to the `Move` interface:

```typescript
critRatio?: number;  // 1 = high crit ratio (+1 crit stage); absent/0 = normal
```

### `packages/shared/src/types/events.ts`

Add to the `TurnResolveEvent.type` string union:

```typescript
| 'miss'   // data: { attackerSlotId: string, moveId: string }
| 'crit'   // data: { slotId: string }  — slotId is the defender's slot
```

The existing `'status-cured'` type remains. The fire-thaw case adds `reason: 'fire-hit'` to `data`; existing callers (sleep cure, normal freeze thaw in `EffectEngine`) are unaffected since `data` is `Record<string, unknown>`.

---

## `accuracy.ts` — New Module

Location: `packages/server/src/engine/accuracy.ts`

Pure functions only — no imports from engine internals, no side effects. Fully unit-testable in isolation.

### Accuracy stage table

Gen 5+ accuracy stage multipliers (13 entries, index = stage + 6):

```typescript
const ACC_STAGE_MULTS = [1/3, 3/8, 3/7, 1/2, 2/3, 3/4, 1, 4/3, 3/2, 2, 5/2, 8/3, 3];
//   stage: -6    -5    -4    -3    -2    -1   0    +1   +2  +3   +4   +5  +6
```

### Exported functions

```typescript
// Returns the accuracy stage multiplier for a given stage [-6, +6].
export function accuracyStageMultiplier(stage: number): number

// Returns the evasion stage multiplier (reciprocal of accuracy table).
export function evasionStageMultiplier(stage: number): number

// Returns the effective hit chance as a number in [1, 100], or 'always'
// if moveAccuracy === true. Result is clamped to [1, 100].
export function computeHitChance(
  moveAccuracy: number | true,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
): number | 'always'

// Returns the crit probability for a given crit stage (Gen 6+ thresholds).
//   Stage 0  → 1/24
//   Stage 1  → 1/8
//   Stage 2  → 1/2
//   Stage 3+ → 1
export function critProbability(stage: number): number

// Computes the effective crit stage for a hit from the move's critRatio
// and the attacker's volatile status list.
//   move.critRatio > 0 → +1 stage
//   'focusenergy' volatile on attacker → +2 stages
export function computeCritStage(
  moveCritRatio: number | undefined,
  volatiles: { name: string }[],
): number
```

---

## `damage.ts` Changes

### New fields in `DamageInput`

```typescript
moveType?: PokemonType;   // needed for weather modifier lookup
weather?: WeatherType;    // read from battle.field.weather?.type by caller
```

### New step in `calcDamage` (after burn, before otherModifiers)

```typescript
// Weather modifier
if (weather && moveType) {
  if (weather === 'sun'  && moveType === 'Fire')  dmg = Math.floor(dmg * 1.5);
  if (weather === 'sun'  && moveType === 'Water') dmg = Math.floor(dmg * 0.5);
  if (weather === 'rain' && moveType === 'Water') dmg = Math.floor(dmg * 1.5);
  if (weather === 'rain' && moveType === 'Fire')  dmg = Math.floor(dmg * 0.5);
  // sand / snow / hail: no power change (residuals handled elsewhere)
}
```

Both fields are optional — all existing callers continue to work unchanged.

---

## `BattleEngine.ts` Changes

### Constructor

```typescript
constructor({ registry, rng }: { registry?: MoveEffectRegistry; rng?: () => number } = {}) {
  this.rng = rng ?? Math.random;
  this.registry = registry ?? buildDefaultRegistry();
}
```

The `rng` function is used for accuracy rolls and crit rolls inside `executeMove`. It is not threaded into `EffectEngine` (existing pre-move checks keep `Math.random()` — they are not part of this feature).

### `executeMove` additions (in order)

**After `move-used` event, before target loop — accuracy roll:**

Note: status moves return early before this point (existing `if (move.category === 'status')` branch), so the accuracy check only runs for damaging moves. OHKO move accuracy (`30 + attackerLevel − defenderLevel`) is out of scope — that is doc 03's responsibility.

```typescript
// Skip accuracy check for self-targeting moves
const skipAccuracyCheck = move.target === 'self' || move.target === 'allyTeam';
if (!skipAccuracyCheck) {
  // Spread moves ignore defender evasion (Gen 6+ rule)
  let defenderEvasion = 0;
  if (targetSlotIds.length === 1) {
    const tSlot = this.findSlot(s, targetSlotIds[0]!);
    const tMon = tSlot?.party[tSlot.activePokemonIndex];
    defenderEvasion = tMon?.statBoosts.evasion ?? 0;
  }
  const hitChance = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
  if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
    events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
    return { newState: s, events };
  }
}
```

**Inside target loop, before damage calc — thaw on fire hit:**

```typescript
const ALWAYS_THAW = new Set(['scald', 'steameruption', 'sparklingaria']);
if (target.status === 'frz' && (move.type === 'Fire' || ALWAYS_THAW.has(move.id))) {
  delete target.status;
  events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: 'frz', reason: 'fire-hit' } });
}
```

**Inside target loop, before `calcDamage` — crit roll and stat stage clamping:**

```typescript
const critStage = computeCritStage(move.critRatio, attacker.volatileStatus);
const isCritical = this.rng() < critProbability(critStage);

// On a crit: ignore negative attacker stages and positive defender stages (Gen 6+)
const atkBoost = isCritical ? Math.max(0, attacker.statBoosts[boostKey]) : attacker.statBoosts[boostKey];
const defBoost = isCritical ? Math.min(0, target.statBoosts[defBoostKey]) : target.statBoosts[defBoostKey];

// Pass to getEffectiveStat using the (possibly clamped) boost values
const atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);
const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
```

**Update `calcDamage` call:**

```typescript
const { damage } = calcDamage({
  level: attacker.level,
  attackStat: atkStat,
  defenseStat: defStat,
  basePower: move.basePower,
  typeEffectiveness: effectiveness,
  stab,
  isBurned: isPhysical && attacker.status === 'brn',
  randomFactor: randomDamageFactor(),
  isCritical,
  moveType: move.type,
  weather: s.field.weather?.type,
  otherModifiers,
});
```

**After `damage-dealt` event — crit event:**

```typescript
if (isCritical) {
  events.push({ type: 'crit', data: { slotId: targetSlotId } });
}
```

---

## Testing Strategy

### `accuracy.test.ts` — pure unit tests

- Stage table spot-checks: stage 0 → 1, stage −6 → 1/3, stage +6 → 3
- `computeHitChance`: 70% accuracy at neutral → 70; at accuracy −1 → clamped value; `true` → `'always'`
- `computeCritStage`: no critRatio + no volatiles → 0; critRatio 1 → 1; Focus Energy volatile → base + 2; both → 3
- `critProbability`: stage 0 → 1/24, stage 1 → 1/8, stage 2 → 1/2, stage 3 → 1, stage 4 → 1

### `damage.test.ts` — extend existing

- Water move (`moveType: 'Water'`) in rain → 1.5× vs baseline
- Fire move (`moveType: 'Fire'`) in rain → 0.5× vs baseline
- Fire move in sun → 1.5×; Water move in sun → 0.5×
- Sand/snow → no change (same as no weather)
- No `weather` field → no change (backwards compatibility)

### `BattleEngine.test.ts` — extend existing

All new cases use injectable `rng`:

- **Miss:** `rng` always returns 0.99 (above any hitChance) → `'miss'` event emitted, no `'damage-dealt'`
- **Hit:** `rng` always returns 0 → no miss, `'damage-dealt'` present
- **Auto-hit move:** move with `accuracy: true` (e.g. Swift) + `rng` returning 0.99 → no miss
- **Crit:** `rng` returns below crit threshold → `'crit'` event emitted after `'damage-dealt'`; damage is 1.5× baseline
- **No crit:** `rng` returns above crit threshold → no `'crit'` event
- **Thaw on fire hit:** target with `status: 'frz'` hit by Fire move → `'status-cured'` with `reason: 'fire-hit'` appears before `'damage-dealt'`; `target.status` is `undefined` after
- **No thaw on non-fire hit:** frozen target hit by Water move → no fire-thaw event (still frozen, blocked by `runPreMove`)

---

## Key Decisions

- **Injectable RNG** (`rng?: () => number` on `BattleEngine`) used only for accuracy and crit rolls in `executeMove`. `EffectEngine` retains `Math.random()` — not in scope for this feature.
- **Weather in `DamageInput`** — caller reads `state.field.weather?.type` and passes it. Both `weather` and `moveType` are optional so all existing `calcDamage` calls continue to compile.
- **`status-cured` reuse** — existing event type extended with `reason: 'fire-hit'` in `data` for the fire-thaw case. No new event type needed; no breaking change to existing cures.
- **Crit stat stage clamping** — handled in `executeMove` before calling `getEffectiveStat`, not inside `calcDamage`. Keeps `calcDamage` as a pure damage formula.
- **Spread move evasion** — evasion stages are ignored for spread moves (matching Gen 6+ behaviour). Single-target moves use the specific target's evasion stage.
