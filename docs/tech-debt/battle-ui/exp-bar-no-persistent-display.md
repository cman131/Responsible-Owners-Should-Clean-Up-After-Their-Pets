# 23 — EXP Gain Has No Persistent Bar — Only a Fleeting Overlay

## State

New

## Summary

EXP awards and level-ups are shown as temporary floating overlays that auto-dismiss after 3–4 seconds. There is no persistent EXP progress bar showing how far the active Pokémon is from their next level. Players have no lasting visual reference for EXP progress, and in multi-slot formats the fixed overlay position doesn't indicate which Pokémon gained EXP.

## Problem Details

**File:** `packages/client/src/battle/overlays/ExpBar.tsx`

```ts
const styles = {
  container: { position: 'absolute' as const, bottom: 220, left: 80, zIndex: 100, pointerEvents: 'none' as const },
  levelUp: { background: '#f0c040', color: '#000', padding: '6px 14px', ...},
  expGain: { background: '#1a3a5c', color: '#3498db', border: '1px solid #3498db', ...},
};
```

The component:
- Is rendered in `BattlePage` only for `myActiveMon` (the player's own active Pokémon)
- Is hidden when there's no active EXP gain or level-up event
- Disappears after 3 seconds (EXP) or 4 seconds (level-up)
- Is positioned at `bottom: 220, left: 80` absolutely — fixed screen position, not relative to the relevant Pokémon sprite

The component has no persistent bar graphic showing current EXP / EXP needed for next level. `PartyMember.expTotal` is available in the state, and species growth rate data exists on the server via `DataLoader`, but neither is surfaced here.

## Impact

- Players can't track EXP progress between turns
- The fleeting overlay is easy to miss if the player is focused on the action panel
- Level-up notification at a fixed position doesn't say *which* Pokémon leveled up in multi-slot formats (though currently `ExpBar` is only rendered for `myActiveMon`)
- No history — if you miss the popup, you have no way to check how much EXP was gained

## Suggested Fix

Two improvements:

1. **Persistent EXP bar** in the HP bars row, shown alongside HP for the player's own Pokémon slot. Display `expTotal` as a thin bar under the HP bar, colored differently. Requires either sending growth curve thresholds from the server or bundling the EXP formula client-side.

2. **Better level-up notification** that names the Pokémon and appears near the relevant sprite rather than at a fixed screen position.

The fleeting overlay can remain as supplementary feedback — it just shouldn't be the only feedback.

## Related Files

- `packages/client/src/battle/overlays/ExpBar.tsx`
- `packages/client/src/pages/BattlePage.tsx` (renders ExpBar)
- `packages/client/src/battle/overlays/HpBarsRow.tsx` (candidate location for persistent bar)
- `packages/server/src/engine/exp.ts` (EXP calculation logic)
