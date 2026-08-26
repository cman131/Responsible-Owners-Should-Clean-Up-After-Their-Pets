# Status Effects Indicator Design

**Date:** 2026-08-26
**Feature:** Visual indicators of active effects on a Pokémon in the battle UI

## Overview

Add a compact inline chip row to each HP bar row in the battle view. When a Pokémon has any active effects (status condition, volatile statuses, or non-zero stat boosts), the chips appear after the HP numbers. Hovering the chip area opens a popover above the row with full effect details.

## Component

**File:** `packages/client/src/battle/overlays/EffectsIndicator.tsx`

**Props:** `{ mon: PartyMember }`

**Returns:** `null` when no effects are active.

**Replaces:** `packages/client/src/battle/overlays/StatusBadge.tsx` — that file is deleted (it was unused).

### Active effects definition

The indicator is shown when `mon.fainted` is false AND any of the following is true:
- `mon.status` is set (any status condition)
- `mon.volatileStatus.length > 0`
- Any value in `mon.statBoosts` is non-zero

## Chip display (inline indicator)

Chips appear inside a `position: relative` wrapper div that is the last item in the existing HP row flex layout. The wrapper does not disrupt the flex row.

**Chip ordering:** status chip first → volatile status chips → `±` fallback chip

**Status chips:** color-coded by condition using the existing color map:
- BRN `#e67e22`, PAR `#f0c040`, SLP `#95a5a6`, FRZ `#a8d8ea`, PSN `#9b59b6`, TOX `#6c3483`

**Volatile status chips:** blue (`#3498db`). Names abbreviated:
- `confusion` → CNF, `leechseed` → SEED, `encore` → ENC
- Unknown names: first 3 chars uppercased

**Stat-only fallback chip:** If stat boosts are non-zero but there is no status and no volatile status, show a single `±` chip in gray (`#7f8c8d`) so the indicator is still present. (Purple is avoided because it is already used for PSN.)

**Overflow:** Show up to 3 chips inline. Additional effects collapse to a `+N` label.

## Popover

**Trigger:** `onMouseEnter` / `onMouseLeave` on the wrapper div, driving a `isHovered` React state boolean.

**Position:** `position: absolute; bottom: calc(100% + 4px); right: 0` — opens above the chips, right-aligned.

**Dimensions:** width 190px, background `#111`, border `1px solid #444`, border-radius 4px, padding 10px.

### Effects section

Rendered only when there is at least one status or volatile status. Shows chips for every active status and volatile effect using the same colors as the inline chips.

### Stat stages section

Rendered only when at least one stat boost is non-zero. Each non-zero stat gets its own row:
- Left: stat label (ATK, DEF, SP.ATK, SP.DEF, SPE, ACC, EVA)
- Right: one icon per stage level — `+` in green (`#2ecc71`) for positive, `−` in red (`#e74c3c`) for negative

A dimmed footnote line lists the names of all stats that are at 0, e.g. `DEF · SP.DEF · SPE at 0`.

If all 7 stats are 0, the stat section is omitted entirely.

## Integration

In `BattlePage.tsx`, both the enemy HP rows and the own-team HP rows receive `<EffectsIndicator mon={mon} />` as an additional flex item after the HP numbers span. No structural changes to the existing row layout are needed.

## Testing

- `EffectsIndicator` returns `null` when `status` is undefined, `volatileStatus` is empty, and all stat boosts are 0
- `EffectsIndicator` returns `null` when `mon.fainted` is true
- Renders status chip with correct color when `status` is set
- Renders volatile chips with abbreviations
- Renders `±` chip when only stat boosts are non-zero
- Collapses to `+N` when more than 3 effects are present
- Popover shows stat rows only for non-zero boosts; footnote lists zero stats
- Popover omits stat section when all boosts are 0
