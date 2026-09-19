# Mobile-Responsive Battle View

## State

New

## Summary

The player-facing battle screen (`BattlePage.tsx`) is designed for a desktop viewport of ~800px wide. It uses fixed `maxWidth: 800` constraints and inline styles with no media queries, causing the layout to overflow or compress poorly on mobile screens. The battle scene canvas (`BattleScene`) uses a fixed aspect ratio but no minimum height floor, making sprites tiny on small screens. The action panel and turn log sit side-by-side in a flex-wrap row that breaks awkwardly at narrow widths — on a phone, the action panel (where moves are chosen) ends up below the turn log rather than being the primary focus. There is no touch-optimised sizing for the move buttons, switch panel, or HP bar row.

## Problem Details

**File:** `packages/client/src/pages/BattlePage.tsx:67`

The root container has no viewport-width responsiveness:
```typescript
<div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12, position: 'relative' }}>
```

**File:** `packages/client/src/pages/BattlePage.tsx:96`

The action/log row uses `flexWrap: 'wrap'` with fixed flex-basis values but no column-order control for narrow screens — the log appears first in DOM order so it renders above the action panel on wrap:
```typescript
<div data-testid="action-log-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }}>
  <div style={{ flex: '1 0 260px' }}>   {/* action panel */}
  <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>  {/* turn log */}
```

**File:** `packages/client/src/battle/BattleScene.tsx:24`

The battle scene has a fixed aspect ratio but no `minHeight`, so at ~360px wide (common phone) the scene height is only ~108px — sprites are difficult to see:
```typescript
<div style={{ position: 'relative', width: '100%', maxWidth: 800, aspectRatio: '10/3', ... }}>
```

**File:** `packages/client/src/battle/overlays/HpBarsRow.tsx:26`

The HP bars row has `maxWidth: 800` but internal text widths are fixed (e.g. `width: 130` for name, `width: 65` for HP numbers), causing overflow on very narrow screens.

**File:** `packages/client/src/battle/overlays/ActionPanel.tsx:119`

Move buttons use a fixed `gridTemplateColumns: '1fr 1fr'` grid — on narrow screens this keeps two columns, making each button very narrow and difficult to tap.

## Impact

- Players joining from a phone cannot comfortably choose moves — buttons may be too small to tap accurately.
- The action panel is not visible without scrolling on small screens because the log renders first.
- HP bar names overflow or truncate on very narrow viewports.
- The battle scene sprites become extremely small at mobile widths, degrading the visual experience.
- Mobile is a primary use case for players joining via QR code link.

## Suggested Fix

1. **Action panel priority on mobile**: Use CSS `order` or reorder the DOM so the ActionPanel appears above the TurnLog on narrow screens. At a breakpoint of ~600px, stack them with the action panel first.

2. **Move button sizing**: At narrow widths, switch the move grid to `gridTemplateColumns: '1fr'` (single column) with larger tap targets (min 44px height per button).

3. **Battle scene min-height**: Add a `minHeight` (e.g. 130px) to the `BattleScene` container so sprites remain visible on very narrow phones.

4. **HP bar text overflow**: Replace fixed pixel widths on the name span in `HpBarsRow` with `flex: 1` + `overflow: hidden` + `text-overflow: ellipsis` so names truncate gracefully rather than overflowing.

5. **Padding and font sizes**: At mobile widths, reduce outer padding and consider slightly larger font sizes for the action panel to ease readability.

6. **Implementation approach**: Since the project currently uses inline styles throughout (no CSS modules or Tailwind), introduce a small `useIsMobile` hook that returns true below a breakpoint (e.g. `window.innerWidth < 600`), and conditionally apply mobile-specific style overrides in the relevant components. Alternatively, add a `<style>` block with `@media` queries in `index.html` or a global CSS file.

## Related Files

- `packages/client/src/pages/BattlePage.tsx`
- `packages/client/src/battle/BattleScene.tsx`
- `packages/client/src/battle/overlays/ActionPanel.tsx`
- `packages/client/src/battle/overlays/HpBarsRow.tsx`
- `packages/client/src/battle/overlays/SwitchPanel.tsx`
- `packages/client/src/battle/overlays/TurnLog.tsx`
