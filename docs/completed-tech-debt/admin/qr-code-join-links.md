# QR Code Join Links for Active Battles

## State

Complete

## Summary

There is no way for an admin to share a direct join link with players during or after battle setup. Players must manually navigate to `/`, find the correct battle, and pick a slot. Adding a QR code that encodes `/?battleId=<id>` — shown on the `BattleWaitingScreen` and behind a modal button on the `ControlPanel` — lets the admin share a scannable link that brings a player straight to the right battle. The lobby page also needs to read the `battleId` query parameter and pre-select that battle on load.

## Problem Details

**File:** `packages/client/src/admin/BattleWaitingScreen.tsx:78`

The waiting screen footer only contains a "Cancel Battle" button and a "WATCH BATTLE →" button. There is no mechanism to share the join URL with players who need to connect.

```tsx
<div style={{ display: 'flex', gap: 8 }}>
  <button onClick={...} style={...}>Cancel Battle</button>
  <button onClick={() => onWatch(battleId)} style={styles.watchButton}>WATCH BATTLE →</button>
</div>
```

**File:** `packages/client/src/admin/ControlPanel.tsx:87`

The header action row contains forfeit buttons but nothing to surface the join URL after the battle is already underway — useful for reconnecting a dropped player.

```tsx
<div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
  <button onClick={() => handleForfeit('team-a')} style={btnStyle}>FORFEIT TEAM A</button>
  <button onClick={() => handleForfeit('team-b')} style={btnStyle}>FORFEIT TEAM B</button>
</div>
```

**File:** `packages/client/src/pages/LobbyPage.tsx:11`

`selectedBattleId` is hardcoded to `null` with no URL parameter reading, so a `?battleId=<id>` link has no effect.

```tsx
const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
```

## Impact

- In a local/LAN play session the admin must verbally tell each player which battle to join, making setup error-prone and slow.
- No way to reconnect a dropped player quickly — admin cannot re-share a direct link mid-battle.
- The `BattleWaitingScreen` already shows per-slot join status; without a shareable link the screen is passive-only and offers no help to players still looking for the right battle.

## Suggested Fix

1. Add `qrcode.react` to `packages/client/package.json` dependencies.
2. Create `packages/client/src/components/QrCodeModal.tsx` — a small modal that accepts a `url: string` prop and renders a `<QRCodeSVG>` from `qrcode.react` inside a centred overlay with a close button and the raw URL as copyable text beneath the code.
3. Update `LobbyPage.tsx` to read `new URLSearchParams(window.location.search).get('battleId')` on mount and pass it as the initial value of `selectedBattleId`.
4. In `BattleWaitingScreen.tsx`, add a "Share QR" button to the footer next to the existing buttons. Clicking it opens `QrCodeModal` with `url = window.location.origin + '/?battleId=' + battleId`.
5. In `ControlPanel.tsx`, add a "Join QR" button to the header action row alongside the forfeit buttons. Clicking it opens the same modal.

## Related Files

- `packages/client/src/admin/BattleWaitingScreen.tsx`
- `packages/client/src/admin/ControlPanel.tsx`
- `packages/client/src/pages/LobbyPage.tsx`
- `packages/client/package.json`
