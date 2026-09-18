# Battle UI Responsive Layout

## Overview

Replace all hardcoded `width: 800` values in the battle UI with a responsive `width: '100%', maxWidth: 800` pattern. The BattleScene additionally converts sprite positions from absolute pixel values to percentages so sprites scale proportionally with the container.

## Affected Files

- `packages/client/src/pages/BattlePage.tsx`
- `packages/client/src/battle/BattleScene.tsx`
- `packages/client/src/battle/overlays/HpBarsRow.tsx`
- `packages/client/src/admin/ControlPanel.tsx`

## Container Strategy

Every top-level layout div at `width: 800` changes to:

```ts
{ width: '100%', maxWidth: 800 }
```

This applies to:
- `HpBarsRow` outer wrapper
- `ControlPanel` header bar (line 63) and action/log wrapper (line 101)
- `BattlePage` action/log wrapper (line 91)

## BattleScene

### Container

```ts
// Before
{ position: 'relative', width: 800, height: 240, ... }

// After
{ position: 'relative', width: '100%', maxWidth: 800, aspectRatio: '10/3', ... }
```

The `height` property is removed; the container height is derived from `aspectRatio` and the actual rendered width.

### Sprite Positions

All pixel values in the `pos` object inside `SpriteSlot` convert to percentage strings:

- **x-axis** (`left`, `right`): `px / 800 * 100`%
- **y-axis** (`top`, `bottom`): `px / 240 * 100`%
- **width**: `px / 800 * 100`%
- **height**: `px / 240 * 100`%

Conversions:

| Role | Property | px | % |
|------|----------|----|---|
| own | bottom | 18 | 7.5% |
| own | left | 60 | 7.5% |
| own | width | 72 | 9% |
| own | height | 72 | 30% |
| ally | bottom | 24 | 10% |
| ally | left | 155 + i×60 | `(19.375 + i×7.5)%` |
| ally | width | 54 | 6.75% |
| ally | height | 54 | 22.5% |
| foe[0] | top | 18 | 7.5% |
| foe[0] | right | 60 | 7.5% |
| foe[0] | width | 64 | 8% |
| foe[0] | height | 64 | 26.67% |
| foe[i>0] | top | 30 | 12.5% |
| foe[i>0] | right | 145 + i×60 | `(18.125 + i×7.5)%` |
| foe[i>0] | width | 50 | 6.25% |
| foe[i>0] | height | 50 | 20.83% |

The `pos` type changes from `React.CSSProperties` with numeric values to string percentages.

## Action / Turn Log Split

`BattlePage` and `ControlPanel` both have a flex row with an action panel + turn log:

```ts
// Before
{ display: 'flex', gap: 16, width: 800 }

// After
{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }
```

Action panel: changes from `{ flex: 1 }` to `{ flex: '1 0 260px' }` — grows freely but won't shrink below 260px, which forces wrapping instead of squashing.

Turn log: changes from `{ width: 300 }` to `{ flex: '0 0 300px', maxWidth: '100%' }` — holds 300px on wide screens; `maxWidth: '100%'` prevents overflow on very narrow phones.

## Breakpoint Behaviour

No explicit media queries. Wrapping is driven by flex layout:

- Above ~576px (260 + 16 gap + 300): action panel + turn log side by side
- Below ~576px: turn log drops below action panel; action panel takes full container width, turn log stays at 300px (or shrinks on very narrow phones via `maxWidth: '100%'`)

## Out of Scope

- Sprite label (`displayName`) font size — already small, readable at any scale
- `LobbyPage` — already uses `minWidth: 320, maxWidth: 400`, no change needed
- Mobile-specific touch targets or font size adjustments
