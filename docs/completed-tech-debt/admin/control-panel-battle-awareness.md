# Tech Debt: ControlPanel Battle Awareness Gaps

## State

Complete

Three related gaps in what the admin `ControlPanel` knows and can do during and after a battle. All three are ControlPanel-level additions and can be implemented together.

---

## 1 — Admin ControlPanel Blind to Player Disconnects During Battle

### Summary

When a player disconnects mid-battle, the server emits `lobby:slot-status` to all admin sockets. `ControlPanel` never listens to this event — it's only consumed by `BattleWaitingScreen` (pre-battle). Once in `ControlPanel`, the admin has no visual indication that a player has dropped out.

### Problem Details

Server side:
```ts
// Called on player disconnect
notifyAdminsOfSlotStatus(battleId);  // emits lobby:slot-status
```

Client side — `ControlPanel` never registers this listener. `BattleWaitingScreen` does, but that component is unmounted once the battle starts.

### Location

- `packages/client/src/admin/ControlPanel.tsx`
- Server disconnect handler (emits `lobby:slot-status`)

### Impact

The admin must infer a player has disconnected from indirect signals (turn never resolves, no action submitted). There is no proactive alert. This delays the admin's response to a stuck battle.

### Suggested Fix

Add a `lobby:slot-status` listener in `ControlPanel` and render a disconnect indicator per slot:

```tsx
useEffect(() => {
  socket.on('lobby:slot-status', (status: SlotStatusPayload) => {
    setSlotStatuses(status.slots);
  });
  return () => { socket.off('lobby:slot-status'); };
}, []);

// In render:
{slotStatuses.map((s) => s.connected ? null : (
  <div key={s.slotId} style={{ color: '#e74c3c' }}>
    ⚠ {s.displayName} disconnected
  </div>
))}
```

---

## 2 — Admin ControlPanel Shows No Result When Battle Ends

### Summary

When a battle concludes (natural end or forfeit), the player-facing `BattlePage` shows a `BattleResultPanel` with VICTORY/DEFEAT and a "Return Home" button. The admin's `ControlPanel` does nothing — the NPC action area switches to "No pending NPC actions" and there is no winner announcement or prompt to navigate away.

### Problem Details

`ControlPanel` does not listen to `battle:end` or any equivalent event that would trigger a result state. The `BattleResultPanel` component exists and works on the player side but is never used in `ControlPanel`.

### Location

- `packages/client/src/admin/ControlPanel.tsx`
- `packages/client/src/battle/BattleResultPanel.tsx`

### Impact

After a battle ends, the admin is left looking at a frozen control panel with no indication of who won. They must navigate away manually with no prompt.

### Suggested Fix

Listen for `battle:end` in `ControlPanel` and render a result banner or reuse `BattleResultPanel`:

```tsx
const [battleResult, setBattleResult] = useState<BattleResult | null>(null);

useEffect(() => {
  socket.on('battle:end', (result: BattleResult) => setBattleResult(result));
  return () => { socket.off('battle:end'); };
}, []);

{battleResult && (
  <div style={{ ... }}>
    <strong>Battle ended — Winner: {battleResult.winnerLabel}</strong>
    <button onClick={() => navigate('/admin')}>Return to Admin</button>
  </div>
)}
```

---

## 3 — No Way to Cancel a Started Battle Before Players Join

### Summary

Once a battle is launched from the Setup panel, `BattleWaitingScreen` shows the connection status of each player slot. There is no "Cancel Battle" button. If players never connect, the admin cannot end the battle without first clicking "WATCH BATTLE" to enter `ControlPanel` and then using the forfeit buttons — a two-step detour that's unintuitive.

### Problem Details

`BattleWaitingScreen` has only a "WATCH BATTLE" button. Forfeiting requires entering the full `ControlPanel`. There is no direct cancel path from the waiting screen.

### Location

- `packages/client/src/admin/BattleWaitingScreen.tsx`
- Server: needs a `cancel-battle` or equivalent admin action handler

### Impact

An admin who launched the wrong battle (wrong teams, wrong players) must either wait for incorrect players to connect and then forfeit, or manually clean up server state. There is no fast path to abort.

### Suggested Fix

Add a "Cancel Battle" button to `BattleWaitingScreen` that emits an admin cancel action and navigates back to Setup:

```tsx
<button
  onClick={() => {
    socket.emit('admin:action', { type: 'cancel-battle', battleId });
    navigate('/admin');
  }}
  style={{ background: '#c0392b', color: '#fff', ... }}
>
  Cancel Battle
</button>
```

Server side: add a `cancel-battle` case to the admin action handler that tears down the `BattleRoom` and removes it from the active battles map.
