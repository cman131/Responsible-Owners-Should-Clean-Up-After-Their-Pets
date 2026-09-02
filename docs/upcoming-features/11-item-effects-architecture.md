# Item Effects Architecture — Design

**Date:** 2026-09-02  
**Status:** Reference / future work  
**Scope:** Documents the existing hook system in `items.ts`, identifies gaps, and specifies two new hooks needed for the next wave of items.

---

## Existing hook inventory

All hooks live on `ItemHooks` in `packages/server/src/engine/items.ts`. The engine reads them at the following call sites:

| Hook | Call site | Used by |
|------|-----------|---------|
| `onAttackerModifier` | `executeMove` — `otherModifiers` accumulation | Choice Band/Specs, Life Orb |
| `onDefenderModifier` | `executeMove` — `otherModifiers` accumulation | Assault Vest, Eviolite |
| `onDamageModifier` | `executeMove` — final damage multiplier | Life Orb (×1.3) |
| `onSpeedModifier` | Speed calculation before turn order | Choice Scarf |
| `onEndOfTurn` | `endOfTurn` sweep | Leftovers, Black Sludge |
| `onAfterDamageTaken` | Post-damage block in `executeMove` | Sitrus Berry, pinch-stat berries |
| `onAfterHit` | Post-hit block in `executeMove` | Rocky Helmet |
| `onStatusApplied` | `applyStatus` in `effects.ts` | Lum Berry |
| `critStageBonus` | `computeCritStage` in `accuracy.ts` | Scope Lens, Razor Claw |
| `screenExtension` | Screen-set effect factory in `effectFactories.ts` | Light Clay |
| `drainMultiplier` | Drain secondary handler in `effects.ts` | Big Root |

Inline in `BattleEngine` (not through the hook interface):
- Focus Sash — damage application block
- Air Balloon — move immunity check + pop on hit
- Weakness Policy — post-hit effectiveness check

---

## New hooks needed

### `onHealAfterAttack`

**Purpose:** Heal the attacker after dealing damage. Needed for Shell Bell.

```typescript
onHealAfterAttack?: (ctx: ItemAttackContext & { damageDealt: number }) => { hpDelta: number };
```

**Call site:** In the post-hit block of `executeMove`, after `totalDamage` is finalised, before Rocky Helmet:

```typescript
const healResult = getItemHooks(attacker.heldItem)
  .onHealAfterAttack?.({ holder: attacker, state: s, damageDealt: totalDamage, ...moveCtx });
if (healResult && healResult.hpDelta > 0) {
  const healed = Math.min(healResult.hpDelta, attacker.maxHp - attacker.currentHp);
  attacker.currentHp += healed;
  events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: healed, source: 'item' } });
}
```

**Implementation for Shell Bell:**
```typescript
'shell-bell': {
  onHealAfterAttack: ({ holder, damageDealt }) => ({
    hpDelta: damageDealt > 0 ? Math.floor(damageDealt / 8) : 0,
  }),
},
```

---

### `onAccuracyModifier`

**Purpose:** Modify the effective accuracy of a move. Needed for Wide Lens, Zoom Lens, Bright Powder.

```typescript
onAccuracyModifier?: (ctx: ItemContext & { move: Move; isFirst: boolean }) => number;
```

`isFirst` is true if the holder moves before its target this turn (needed for Zoom Lens, which only activates when the holder moves second).

**Call site:** In `accuracy.ts` `computeAccuracy`, after base accuracy × stat-boost adjustments:

```typescript
const itemAccMod = getItemHooks(attacker.heldItem)
  .onAccuracyModifier?.({ holder: attacker, state, move, isFirst });
if (itemAccMod !== undefined) effectiveAccuracy = Math.floor(effectiveAccuracy * itemAccMod);
```

Also check the **defender's** item for accuracy-reducing items (Bright Powder targets the attacker's roll):

```typescript
const defItemAccMod = getItemHooks(defender.heldItem)
  .onAccuracyModifier?.({ holder: defender, state, move, isFirst });
// Bright Powder reduces the attacker's chance: multiply effectiveAccuracy by the modifier
if (defItemAccMod !== undefined) effectiveAccuracy = Math.floor(effectiveAccuracy * defItemAccMod);
```

**Implementations:**
```typescript
'wide-lens': {
  onAccuracyModifier: () => 1.1,
},
'zoom-lens': {
  onAccuracyModifier: ({ isFirst }) => isFirst ? 1 : 1.2,  // activates when moving second
},
'bright-powder': {
  // Equipped by defender — reduces attacker's effective accuracy
  onAccuracyModifier: () => 0.9,
},
```

---

## `IMPLEMENTED_ITEM_IDS` keeps builder and engine in sync

`items.ts` exports:
```typescript
export const IMPLEMENTED_ITEM_IDS: ReadonlySet<string> = new Set(Object.keys(ITEM_HOOKS));
```

The admin `data:query { resource: 'items' }` handler filters `items.json` by this set. When a new item is added to `ITEM_HOOKS`, it automatically becomes searchable in the builder with no client changes.

---

## Adding a new item — checklist

1. Add entry to `ITEM_HOOKS` in `items.ts` using an existing or new hook.
2. If a new hook is needed, add it to the `ItemHooks` interface and wire the call site in `BattleEngine` / `accuracy.ts` / `effects.ts`.
3. Write a test in `items.test.ts`.
4. The item automatically appears in the builder dropdown — no other changes.
