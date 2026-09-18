# Leave-Battle Confirmation Dialog — Design Spec

## Overview

Gate the "← Home" button behind a native `confirm()` dialog while a battle is active. After the battle ends (result shown) or before a battle starts (waiting screen), the button navigates immediately without a prompt.

## Scope

Single file change: `packages/client/src/pages/BattlePage.tsx`.
No new components, no new state, no socket event changes.

## Behavior

### Condition for prompt

```
state !== null && battleResult === null
```

Both values are already destructured from `useBattle()` in `BattleView`.

### Modified handleGoHome

```ts
function handleGoHome() {
  if (state && !battleResult) {
    if (!confirm('Leave this battle? You may not be able to rejoin.')) return;
  }
  getSocket().emit('player:leave');
  sessionStorage.removeItem('mySlotId');
  navigate('/');
}
```

The button element and its styles are unchanged.

### When prompt does NOT appear

- `state` is null: player is on the "Waiting for battle to start..." screen — no active battle, leave immediately
- `battleResult` is non-null: battle is over, result panel is showing — leave immediately

## Testing

### Updates to existing test

`'clicking Home emits player:leave and clears sessionStorage.mySlotId'` (BattlePage.test.tsx line 234):
- Add `vi.spyOn(window, 'confirm').mockReturnValue(true)` in the test body (or `beforeEach`)
- Assertion stays the same (emit called, sessionStorage cleared)

### New tests

1. **Confirm cancel — no leave during active battle**: spy returns `false` → `player:leave` NOT emitted, sessionStorage not cleared
2. **Confirm skipped after battle result**: render with `battleResult` set → click Home → `player:leave` emitted without triggering `window.confirm`
3. **Confirm skipped on waiting screen**: render with no initial `battleState` (state is null) → click Home → `player:leave` emitted without `window.confirm`
