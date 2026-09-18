# 09 — Leech Seed Volatile Key Mismatch in EffectsIndicator

## State

Complete

## Summary

`EffectsIndicator` maps the volatile name `'leechseed'` (no hyphen) to the abbreviation `'SEED'`. The battle engine and `BattleContext` emit volatile events using the key `'leech-seed'` (with hyphen). The lookup misses, so leech-seeded Pokémon display `'LEE'` (the first 3 characters of `'leech-seed'`) instead of `'SEED'`.

## Problem Details

**File:** `packages/client/src/battle/overlays/EffectsIndicator.tsx:17`

```ts
const VOLATILE_ABBREV: Record<string, string> = {
  confusion: 'CNF',
  leechseed: 'SEED',   // ← wrong key
  encore: 'ENC',
};
```

**File:** `packages/client/src/battle/BattleContext.tsx:107`

The `volatileAppliedText` function handles `'leech-seed'` with a hyphen:
```ts
case 'leech-seed': return `${slotId} was seeded!`;
```

The `abbrev()` fallback in `EffectsIndicator` is:
```ts
function abbrev(name: string): string {
  return VOLATILE_ABBREV[name] ?? name.slice(0, 3).toUpperCase();
}
```

So `'leech-seed'` → not found in `VOLATILE_ABBREV` → `'LEE'`.

## Impact

- Leech seeded Pokémon display `LEE` chip in the HP bar row instead of `SEED`
- Minor but visually wrong and potentially confusing

## Suggested Fix

Change the key in `VOLATILE_ABBREV`:

```ts
const VOLATILE_ABBREV: Record<string, string> = {
  confusion: 'CNF',
  'leech-seed': 'SEED',  // ← fix hyphen
  encore: 'ENC',
};
```

## Related Files

- `packages/client/src/battle/overlays/EffectsIndicator.tsx`
