# TurnLog Size & Collapsible Toggle Design

Date: 2026-09-17  
Tech debt ref: `docs/tech-debt/battle-ui/turn-log-too-small.md`

## Problem

`TurnLog` has a hardcoded `maxHeight: 150` (~8 visible lines) and entries are capped at 50. A single busy doubles turn can produce 8+ lines, filling the entire visible area. Over a long battle, early turns are permanently lost.

## Changes

### `packages/client/src/battle/overlays/TurnLog.tsx`

- Add `const [expanded, setExpanded] = useState(false)`.
- Change `styles.log.maxHeight` from `150` to `expanded ? 400 : 220`, with `transition: 'max-height 0.2s ease'`.
- Add a "Show full log" / "Collapse" text button below the scroll div that toggles `expanded`.

### `packages/client/src/battle/BattleContext.tsx`

- Change all three `.slice(-50)` calls to `.slice(-150)`:
  - Line 496: playback drain effect (normal log entries)
  - Line 549: battle-end winner message
  - Line 597: round-start header

## Numbers

| Knob | Before | After |
|------|--------|-------|
| Default visible height | 150px (~8 lines) | 220px (~13 lines) |
| Expanded height | — | 400px (~22 lines) |
| Entry cap | 50 | 150 |

220px at 13px font / 1.4 line height ≈ 18.2px per line → ~13 lines.  
150 entries comfortably covers 20+ typical turns.

## Out of scope

- `battle:history` path already sets the full array without a cap — no change needed.
- No new files or components.
