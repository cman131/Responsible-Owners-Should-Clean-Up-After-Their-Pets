# Bind Does Not Prevent Switching

## State

New

## Summary

Pokémon afflicted with the `bound` volatile status (applied by Bind, Wrap, Fire Spin, Whirlpool, and Clamp) are not prevented from switching out voluntarily. The `executeSwitch` method in `BattleEngine` checks for the `trapped`, `no-retreat`, and `ingrain` volatiles to block switches, but does not check for `bound`. Because these are two separate volatile names, a bound Pokémon passes the trap check and switches freely, breaking the trapping mechanic that Bind-class moves are supposed to provide.

## Problem Details

**File:** `packages/server/src/engine/BattleEngine.ts:2390`

```typescript
const isTrapped = active.heldItem !== 'shed-shell' && active.volatileStatus.some(
  v => v.name === 'trapped' || v.name === 'no-retreat' || v.name === 'ingrain',
);
```

The `bound` volatile is applied by `evaluateVolatileEffect` in `effects.ts`:

**File:** `packages/server/src/engine/effects.ts:117`

```typescript
export function evaluateVolatileEffect(
  moveId: string,
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
  attacker?: PartyMember,
): TurnResolveEvent | null {
  if (!BOUND_MOVES.has(moveId)) return null;
  // ...
  return applyVolatile(target, targetSlotId, attackerSlotId, 'bound', counter);
}
```

`'bound'` and `'trapped'` are intentionally separate volatiles (they have different EOT damage and clearing rules), but `executeSwitch` was never updated to include `'bound'` in its trap check.

## Impact

- Players using Bind, Wrap, Fire Spin, Whirlpool, or Clamp can deal EOT chip damage but cannot actually trap the opponent — the opponent simply switches out, defeating the entire purpose of these moves.
- This also affects `'bound'` applied via items or secondary effects if any are added in the future.
- Existing tests for `trapped` preventing switches pass, giving false confidence that trapping works generally.

## Suggested Fix

1. Add `v.name === 'bound'` to the `isTrapped` predicate in `executeSwitch` (BattleEngine.ts:2390):

```typescript
const isTrapped = active.heldItem !== 'shed-shell' && active.volatileStatus.some(
  v => v.name === 'trapped' || v.name === 'bound' || v.name === 'no-retreat' || v.name === 'ingrain',
);
```

2. Add a test to `BattleEngine.test.ts` (or a dedicated trapping test file) that verifies a Pokémon with `bound` volatile cannot switch out voluntarily, and can switch out if holding Shed Shell.

Note: verify whether the same check in `BattleEngine.ts:756` (attack-phase trap check) also needs `'bound'` added — that check currently blocks moves by trapped Pokémon, which is a separate mechanic (Bind traps for switching, not for move selection).

## Related Files

- `packages/server/src/engine/BattleEngine.ts`
- `packages/server/src/engine/effects.ts`
- `packages/server/src/engine/__tests__/BattleEngine.test.ts`
- `packages/server/src/engine/__tests__/opponentManipulation.test.ts`
