# Item Effects — Remaining Backlog Design

**Date:** 2026-09-02
**Status:** Approved — ready for implementation plan
**Scope:** Implement all remaining items from the backlog in `docs/upcoming-features/12-item-effects-backlog.md`. Adds two new hooks to `ItemHooks`, wires them in `BattleEngine`, and registers 23 items total across three tiers.

---

## Architecture

### New hook: `onHealAfterAttack`

Heals the attacker after dealing damage. Needed for Shell Bell.

```typescript
onHealAfterAttack?: (ctx: ItemAttackContext & { damageDealt: number }) => { hpDelta: number };
```

**Call site:** Post-hit block in `BattleEngine.executeMove`, after `totalDamage` is finalised, before Rocky Helmet. `holder` is the attacker, `target` is the defender.

```typescript
if (totalDamage > 0 && !attacker.fainted) {
  const healResult = getItemHooks(attacker.heldItem).onHealAfterAttack?.({
    holder: attacker, state: s, moveType: effectiveMoveType,
    basePower: effectiveBasePower, target, isPhysical, damageDealt: totalDamage,
  });
  if (healResult && healResult.hpDelta > 0) {
    const healed = Math.min(healResult.hpDelta, attacker.maxHp - attacker.currentHp);
    if (healed > 0) {
      attacker.currentHp += healed;
      events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: healed, remainingHp: attacker.currentHp } });
    }
  }
}
```

---

### New hook: `onAccuracyModifier`

Multiplies the computed hit chance. Needed for Wide Lens, Zoom Lens, Bright Powder.

```typescript
onAccuracyModifier?: (ctx: ItemContext & { move: Move; isFirst: boolean }) => number;
```

`isFirst` is `true` if the holder moves before the target this turn. Computed by comparing the attacker's and target's positions in the sorted action list.

**Call site:** In `BattleEngine.executeMove`, after `computeHitChance` and weather/gravity overrides, before the miss roll. Applied to both the attacker's item and the defender's item (Bright Powder equips on the defender to reduce the attacker's roll):

```typescript
if (typeof hitChance === 'number') {
  const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
    holder: attacker, state: s, move, isFirst,
  });
  if (attItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * attItemMod));

  const defItemMod = getItemHooks(target.heldItem).onAccuracyModifier?.({
    holder: target, state: s, move, isFirst,
  });
  if (defItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * defItemMod));
}
```

`isFirst` is derived from the `order: string[]` already computed by `buildActionOrder` in `resolveTurn`. Pass it as a new parameter to `executeMove` and compute: `isFirst = order.indexOf(attackerSlotId) < order.indexOf(targetSlotId)`.

---

## Tier 1 — Type boosters (no new hooks)

All use `onAttackerModifier`. Pattern: return `1.2` if `moveType` matches, else `1`.

| Item id | Type boosted |
|---------|-------------|
| `charcoal` | Fire |
| `mystic-water` | Water |
| `miracle-seed` | Grass |
| `magnet` | Electric |
| `never-melt-ice` | Ice |
| `twisted-spoon` | Psychic |
| `black-belt` | Fighting |
| `poison-barb` | Poison |
| `soft-sand` | Ground |
| `sharp-beak` | Flying |
| `silver-powder` | Bug |
| `hard-stone` | Rock |
| `spell-tag` | Ghost |
| `dragon-fang` | Dragon |
| `black-glasses` | Dark |
| `metal-coat` | Steel |
| `silk-scarf` | Normal |
| `fairy-feather` | Fairy |

Expert Belt uses `onDamageModifier`:

```typescript
'expert-belt': { onDamageModifier: ({ effectiveness }) => effectiveness > 1 ? 1.2 : 1 },
```

---

## Tier 2 — Shell Bell

```typescript
'shell-bell': {
  onHealAfterAttack: ({ damageDealt }) => ({ hpDelta: Math.floor(damageDealt / 8) }),
},
```

---

## Tier 3 — Accuracy items

```typescript
'wide-lens':     { onAccuracyModifier: () => 1.1 },
'zoom-lens':     { onAccuracyModifier: ({ isFirst }) => isFirst ? 1 : 1.2 },
'bright-powder': { onAccuracyModifier: () => 0.9 },  // defender's item — reduces attacker's roll
```

---

## Testing

All new tests go in `packages/server/src/engine/__tests__/items.test.ts`.

| Test | What to verify |
|------|---------------|
| Charcoal | Fire move deals ×1.2; Water move unaffected |
| Expert Belt | +20% on super-effective hit; no boost on neutral |
| Shell Bell | Attacker heals floor(damage/8) after dealing damage; capped at maxHp |
| Wide Lens | A 90-accuracy move now hits at 99% (floor(90 × 1.1)) |
| Zoom Lens | Holder moving second: accuracy boosted; holder moving first: no boost |
| Bright Powder | Defender holding it: attacker's 90-acc move becomes floor(90 × 0.9) = 81 |

One test per group is sufficient — the hook plumbing is the same for all 18 type-boosters.

---

## What does NOT change

- Existing `ItemHooks` entries — no removals or renames
- `ItemAttackContext` / `ItemContext` — no field additions needed
- `accuracy.ts` functions — `computeHitChance` stays unchanged; modifiers are applied in `BattleEngine` after the call
- Client code — `IMPLEMENTED_ITEM_IDS` auto-expands as items are added to `ITEM_HOOKS`
