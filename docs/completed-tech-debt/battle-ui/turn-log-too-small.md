# 20 — Turn Log Too Small and Capped at 50 Entries

## State

Complete

## Summary

The `TurnLog` component has a hardcoded `maxHeight: 150` pixels and the log is trimmed to the last 50 entries. On a busy doubles turn (multiple moves, stat changes, weather, hazard damage, ability triggers), 10+ entries can arrive at once, pushing earlier entries out of view immediately. Over a long battle the 50-entry cap means early turn history is permanently lost from view.

## Problem Details

**File:** `packages/client/src/battle/overlays/TurnLog.tsx:36`

```ts
const styles = {
  log: { maxHeight: 150, overflowY: 'auto' as const, ... },
```

150px at a 13px font size with 1.4 line height is approximately 8 lines of text.

**File:** `packages/client/src/battle/BattleContext.tsx:497, 549, 574`

Entry cap applied on every append:
```ts
setTurnLog((prev) => [...prev, entry].slice(-50));
```

Also applied when the battle-over entry is added:
```ts
setTurnLog(prev => [...prev, { type: 'normal', text: `Battle over! Winner: ...` }].slice(-50));
```

And on the initial `battle:start` event, the log is reset to a single entry (fine, but worth noting).

## Impact

- In multi-target doubles turns, a single turn can produce 8+ log lines — the entire visible area fills with one turn's events and the round header scrolls off
- Players cannot easily review what happened several turns ago without the log already having lost those entries
- For long battles (20+ turns) early turns are lost entirely

## Suggested Fix

1. **Increase `maxHeight`**: `200–250px` would show ~12–15 lines without dramatically changing the layout
2. **Increase entry cap**: 100–150 entries is more appropriate for longer battles; the memory cost is negligible (plain strings)
3. **Consider a collapsible/expandable log**: A "Show full log" toggle that expands to a larger scrollable view while keeping the default compact

The 50-entry log cap and the 150px height are independent knobs — both should be tuned.

## Related Files

- `packages/client/src/battle/overlays/TurnLog.tsx`
- `packages/client/src/battle/BattleContext.tsx`
