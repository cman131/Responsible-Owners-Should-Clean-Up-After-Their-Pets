# Design: ControlPanel Battle Awareness Gaps

Date: 2026-09-17
Source: `docs/tech-debt/admin/control-panel-battle-awareness.md`

## Summary

Three additive improvements to the admin ControlPanel and BattleWaitingScreen:

1. **Disconnect indicator** — admin sees which player slots dropped mid-battle
2. **Battle end result** — admin sees winner and a "Return" button when battle concludes
3. **Cancel battle** — admin can abort a started-but-not-joined battle from the waiting screen

No existing behaviour is removed. No renames or structural refactors.

---

## Gap 1 — Disconnect Indicator in ControlPanel

### Problem

`ControlPanel` never listens to `lobby:slot-status`. The admin must infer disconnects from indirect signals (turns stop resolving).

### Design

**State:**
```ts
const [slotStatuses, setSlotStatuses] = useState<SlotStatusPayload['slots']>([]);
```

**In existing `useEffect`**, add listener and initial request:
```tsx
socket.on('lobby:slot-status', (payload: SlotStatusPayload) => {
  if (payload.battleId === battleId) setSlotStatuses(payload.slots);
});
socket.emit('admin:action', { type: 'lobby:slot-status', data: { battleId } } as any);
```
Clean up the listener in the return.

**In header row**, after the `ADMIN VIEW` badge:
```tsx
{slotStatuses.filter(s => !s.joined).map(s => (
  <span key={s.slotId} style={{ color: '#e74c3c', fontSize: 11 }}>
    ⚠ {s.displayName} disconnected
  </span>
))}
```

### Files
- `packages/client/src/admin/ControlPanel.tsx`

---

## Gap 2 — Battle End Result in ControlPanel

### Problem

`ControlPanel` never listens to `battle:end`. After the battle concludes, the admin sees a frozen screen with no winner announcement or navigation prompt.

### Design

**State:**
```ts
const [battleResult, setBattleResult] = useState<BattleEndPayload | null>(null);
```

**In existing `useEffect`**, add listener:
```tsx
socket.on('battle:end', (payload: BattleEndPayload) => setBattleResult(payload));
```

**In render**, replace the NPC actions panel conditional with a three-way:
```tsx
{battleResult ? (
  <BattleResultPanel
    winningTeamId={battleResult.winningTeamId}
    finalState={battleResult.state}
    mySlotId="__admin__"
    onGoHome={onBack}
  />
) : npcRequests.length > 0 ? (
  <NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
) : (
  <div style={...}>No pending NPC actions</div>
)}
```

Using `mySlotId="__admin__"` results in `outcome = 'neutral'`, label `BATTLE OVER`, and a neutral accent — appropriate for the admin view.

### Files
- `packages/client/src/admin/ControlPanel.tsx`
- `packages/client/src/battle/overlays/BattleResultPanel.tsx` (read-only, no changes)

---

## Gap 3 — Cancel Battle from BattleWaitingScreen

### Problem

Once a battle is started, the only way to end it without players joining is to navigate into ControlPanel and forfeit — a two-step detour. There is no direct "Cancel" path from the waiting screen.

### Design

**Shared types** — `packages/shared/src/types/events.ts`:
Add `'cancel-battle'` to the `AdminActionPayload.type` union.

**DB** — `packages/server/src/db/Database.ts`:
```ts
// Before
markEnded(battleId: string, winningTeamId: string): void

// After
markEnded(battleId: string, winningTeamId: string | null): void
```
The SQL update is unchanged; SQLite accepts NULL naturally.

**SocketServer** — `packages/server/src/socket/SocketServer.ts`:
Add private method and pass it to `registerAdminHandlers`:
```ts
private cancelBattle(battleId: string): void {
  this.rooms.delete(battleId);
  this.db.battles.markEnded(battleId, null);
  this.notifyAdminsOfBattles();
  this.notifyPlayersOfBattles();
}
```
Change `registerAdminHandlers(...)` call to pass `this.cancelBattle.bind(this)` as the new last argument.

**Admin handlers** — `packages/server/src/socket/handlers/adminHandlers.ts`:
Add `cancelRoom: (battleId: string) => void` parameter after `lobby`. Add case:
```ts
case 'cancel-battle': {
  const { battleId } = payload.data as { battleId: string };
  if (typeof battleId === 'string') cancelRoom(battleId);
  break;
}
```

**BattleWaitingScreen** — `packages/client/src/admin/BattleWaitingScreen.tsx`:
Add Cancel button in the footer (left of the WATCH button):
```tsx
<button
  onClick={() => {
    getSocket().emit('admin:action', { type: 'cancel-battle', data: { battleId } });
    onBack();
  }}
  style={{ background: '#c0392b', color: '#fff', border: 'none', padding: '5px 14px',
           fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}
>
  Cancel Battle
</button>
```

### Files
- `packages/shared/src/types/events.ts`
- `packages/server/src/db/Database.ts`
- `packages/server/src/socket/SocketServer.ts`
- `packages/server/src/socket/handlers/adminHandlers.ts`
- `packages/client/src/admin/BattleWaitingScreen.tsx`

---

## Error Handling

- All new socket listeners are cleaned up in `useEffect` return functions.
- `cancel-battle` server handler guards with `typeof battleId === 'string'` before acting.
- No new async paths introduced.

## Testing

- No new engine tests needed (no battle engine changes).
- Client component tests: add tests to `ControlPanel.test.tsx` for the `lobby:slot-status` and `battle:end` handlers if a test file exists; otherwise manual smoke test via the running app.
- Server: `adminHandlers.test.ts` already exists — add a `cancel-battle` case test.
