# 25 — Battle UI Is Fixed at 800px Width — Not Responsive

## State

Complete

## Summary

Every major container in the battle UI is hardcoded to `width: 800` or `minWidth: 800`. The layout breaks on any viewport narrower than approximately 850px. There are no media queries or flex-wrap fallbacks. This affects tablets, small laptops, browser windows that aren't maximised, and any mobile device.

## Problem Details

Hardcoded widths appear in:

| File | Line | Value |
|---|---|---|
| `packages/client/src/pages/BattlePage.tsx` | inner layout div | `width: 800` |
| `packages/client/src/battle/BattleScene.tsx` | scene container | `width: 800, height: 240` |
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | row container | `width: 800` |
| `packages/client/src/admin/ControlPanel.tsx` | layout divs | `width: 800` |
| `packages/client/src/pages/LobbyPage.tsx` | box | `minWidth: 320, maxWidth: 400` (fine) |

The action panel and turn log split is also hardcoded:
```tsx
<div style={{ display: 'flex', gap: 16, width: 800 }}>
  <div style={{ flex: 1 }}>   {/* action panel */}
  <div style={{ width: 300 }}> {/* turn log */}
```

On a 768px-wide viewport (iPad portrait), the 800px containers overflow horizontally.

## Impact

- Horizontal scroll on tablets and small laptops
- On mobile the UI is completely unusable
- Even on desktops where players may not be maximising the window, the fixed width can cause overflow
- The admin control panel has the same issue — an admin on a laptop at 1280px wide has large empty margins but the actual content area is exactly 800px

## Suggested Fix

Replace hardcoded widths with a responsive approach:

1. **Use `max-width` with `100%`** for top-level containers:
```ts
{ width: '100%', maxWidth: 800 }
```

2. **For the BattleScene**, the fixed 800×240 aspect ratio can be maintained with:
```ts
{ width: '100%', maxWidth: 800, aspectRatio: '10/3', position: 'relative' }
```
Sprite positions (currently pixel values) would need to become percentages.

3. **For the action panel / turn log split**, switch to `flex-wrap: wrap` so the log drops below on narrow viewports:
```ts
{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }
```

This is a substantial layout change — the BattleScene in particular will require careful work since sprite positions are absolute pixel values.

## Related Files

- `packages/client/src/pages/BattlePage.tsx`
- `packages/client/src/battle/BattleScene.tsx`
- `packages/client/src/battle/overlays/HpBarsRow.tsx`
- `packages/client/src/admin/ControlPanel.tsx`
