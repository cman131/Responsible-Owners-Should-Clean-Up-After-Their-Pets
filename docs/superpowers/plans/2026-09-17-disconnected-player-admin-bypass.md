# Disconnected Player Admin Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Submit default action" admin button so a disconnected player no longer stalls a turn indefinitely.

**Architecture:** Add `'submit-default-action'` to the shared admin action type union, implement `BattleRoom.submitDefaultAction()` using existing `buildValidMoves` + `submitAction`, wire the handler in `adminHandlers.ts`, and surface a button per-disconnected-slot in `ControlPanel.tsx`.

**Tech Stack:** TypeScript 5.4, Socket.io, React + Vite, Vitest, `@testing-library/react`

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/shared/src/types/events.ts` |
| Modify | `packages/server/src/socket/BattleRoom.ts` |
| Modify | `packages/server/src/socket/__tests__/BattleRoom.test.ts` |
| Modify | `packages/server/src/socket/handlers/adminHandlers.ts` |
| Modify | `packages/server/src/socket/__tests__/adminHandlers.test.ts` |
| Modify | `packages/client/src/admin/ControlPanel.tsx` |
| Modify | `packages/client/src/admin/__tests__/ControlPanel.test.tsx` |

---

## Task 1: Add `'submit-default-action'` to shared admin action types

**Files:**
- Modify: `packages/shared/src/types/events.ts:34-53`

- [ ] **Step 1: Add the new action type to the union**

In `packages/shared/src/types/events.ts`, find the `AdminActionPayload` interface and add `'submit-default-action'` to the `type` union:

```ts
export interface AdminActionPayload {
  type:
    | 'npc-action'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
    | 'submit-default-action'   // ← add this line
    | 'lobby:list'
    | 'lobby:slot-status'
    | 'battles:list'
    | 'battles:connect'
    | 'registry:list'
    | 'registry:save-player'
    | 'registry:delete-player'
    | 'registry:save-npc'
    | 'registry:delete-npc'
    | 'registry:save-team'
    | 'registry:delete-team'
    | 'start-battle'
    | 'cancel-battle'
    | 'data:query';
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Rebuild shared**

```powershell
pnpm --filter @poke-fighter/shared build
```

Expected: `dist/` updated with no errors.

- [ ] **Step 3: Typecheck all packages**

```powershell
pnpm typecheck
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add submit-default-action to AdminActionPayload type"
```

---

## Task 2: Implement `BattleRoom.submitDefaultAction` (TDD)

**Files:**
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`
- Modify: `packages/server/src/socket/BattleRoom.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `packages/server/src/socket/__tests__/BattleRoom.test.ts`:

```ts
describe('submitDefaultAction', () => {
  it('returns ok and stores a pending action for a slot that has not yet acted', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    // slot-b1 (NPC) also needs to act before turn resolves; submit it first so
    // we can check submitDefaultAction on slot-a1 in isolation without triggering resolveTurn
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    const result = room.submitDefaultAction('slot-a1');
    expect(result.ok).toBe(true);
  });

  it('returns error when action is already pending for the slot', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    // Submit for slot-a1 first (slot-b1 still needs to act so turn won't resolve)
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });

    const result = room.submitDefaultAction('slot-a1');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already/i);
  });

  it('returns error when the battle phase is not action', () => {
    const state = make1v1State();
    state.phase = 'ended';
    const room = new BattleRoom({ initialState: state });

    const result = room.submitDefaultAction('slot-a1');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/action phase/i);
  });

  it('resolves the turn when it supplies the last missing action', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const events: unknown[] = [];
    room.onTurnResolved((e) => events.push(e));

    // slot-b1 submits; slot-a1 is the stalled slot
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });
    expect(events).toHaveLength(0); // not resolved yet

    room.submitDefaultAction('slot-a1');
    expect(events.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });

  it('uses moveIndex 0 (Struggle) when the active pokemon has all PP at zero', () => {
    const state = make1v1State();
    const activeMon = state.teams[0]!.slots[0]!.party[0]!;
    for (const move of activeMon.moves) move.currentPp = 0;
    const room = new BattleRoom({ initialState: state });
    // slot-b1 submits so turn won't resolve prematurely while we check the result
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    const result = room.submitDefaultAction('slot-a1');
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they all fail**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/BattleRoom.test.ts
```

Expected: 5 new test failures with something like `TypeError: room.submitDefaultAction is not a function`.

- [ ] **Step 3: Implement `submitDefaultAction` in BattleRoom**

In `packages/server/src/socket/BattleRoom.ts`, add this public method after the `submitAction` method (around line 143):

```ts
submitDefaultAction(slotId: string): { ok: boolean; reason?: string } {
  if (this.state.phase !== 'action') {
    return { ok: false, reason: 'Battle not in action phase' };
  }
  if (this.awaitingForcedSwitches.has(slotId)) {
    return { ok: false, reason: 'Slot awaiting forced switch, not action phase stall' };
  }
  if (this.pendingActions.has(slotId)) {
    return { ok: false, reason: 'Action already submitted for this slot' };
  }
  const slot = this.findSlot(slotId);
  if (!slot) return { ok: false, reason: 'Unknown slot' };
  const active = slot.party[slot.activePokemonIndex];
  if (!active || active.fainted) return { ok: false, reason: 'No active pokemon' };

  const validMoves = this.buildValidMoves(slotId, active);
  const firstMove = validMoves[0]!;
  const action: MoveAction = { type: 'move', moveIndex: firstMove.index };
  return this.submitAction(slotId, action);
}
```

`MoveAction` is already imported at the top of the file.

- [ ] **Step 4: Run the tests to verify they all pass**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/BattleRoom.test.ts
```

Expected: all tests pass, including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat(server): add BattleRoom.submitDefaultAction to unblock stalled turns"
```

---

## Task 3: Wire `submit-default-action` in admin handler (TDD)

**Files:**
- Modify: `packages/server/src/socket/__tests__/adminHandlers.test.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block at the end of `packages/server/src/socket/__tests__/adminHandlers.test.ts`:

```ts
describe('registerAdminHandlers – submit-default-action', () => {
  function makeAdminSocket(id = 'admin-sda') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  it('calls submitDefaultAction on the room for the given slotId', () => {
    const mockRoom = { submitDefaultAction: vi.fn(() => ({ ok: true })) };
    const getRoom = vi.fn((_id: string) => mockRoom as any);

    const socket = makeAdminSocket();
    const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
    const db = new AppDatabase(':memory:');

    registerAdminHandlers(socket as any, mockIo, getRoom, vi.fn(), db, { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any, vi.fn());

    socket.trigger('admin:action', {
      type: 'submit-default-action',
      data: { battleId: 'b1', slotId: 'slot-a1' },
    });

    expect(getRoom).toHaveBeenCalledWith('b1');
    expect(mockRoom.submitDefaultAction).toHaveBeenCalledWith('slot-a1');

    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: 1 new failure — `submitDefaultAction` not called because the case is not handled.

- [ ] **Step 3: Add the handler case to `adminHandlers.ts`**

In `packages/server/src/socket/handlers/adminHandlers.ts`, add a new case inside the `admin:action` switch (after the `'cancel-battle'` case, around line 138):

```ts
case 'submit-default-action': {
  const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
  if (typeof battleId === 'string' && typeof slotId === 'string') {
    getRoom(battleId)?.submitDefaultAction(slotId);
  }
  break;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck server**

```powershell
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "feat(server): handle submit-default-action admin event"
```

---

## Task 4: Add "Submit action" button to ControlPanel (TDD)

**Files:**
- Modify: `packages/client/src/admin/__tests__/ControlPanel.test.tsx`
- Modify: `packages/client/src/admin/ControlPanel.tsx`

- [ ] **Step 1: Write the failing tests**

Append two tests to the existing `describe('ControlPanel', ...)` block in `packages/client/src/admin/__tests__/ControlPanel.test.tsx`:

```ts
it('shows a SUBMIT ACTION button for each disconnected slot', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
  act(() => {
    slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
  });
  expect(screen.getByRole('button', { name: /submit action/i })).toBeTruthy();
});

it('emits submit-default-action when SUBMIT ACTION is clicked', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
  act(() => {
    slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
  });
  fireEvent.click(screen.getByRole('button', { name: /submit action/i }));
  expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
    type: 'submit-default-action',
    data: { battleId: 'b1', slotId: 'a1' },
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```

Expected: 2 new failures — button doesn't exist yet.

- [ ] **Step 3: Add the button to ControlPanel**

In `packages/client/src/admin/ControlPanel.tsx`, find the disconnected slot indicators rendered in the header (around line 76-80):

```tsx
{slotStatuses.filter(s => !s.joined).map(s => (
  <span key={s.slotId} style={{ color: '#e74c3c', fontSize: 11 }}>
    ⚠ {s.displayName} disconnected
  </span>
))}
```

Replace it with:

```tsx
{slotStatuses.filter(s => !s.joined).map(s => (
  <span key={s.slotId} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e74c3c', fontSize: 11 }}>
    ⚠ {s.displayName} disconnected
    <button
      onClick={() => sendAdminAction('submit-default-action', { slotId: s.slotId })}
      style={{ ...btnStyle, background: '#7a3', padding: '2px 8px', fontSize: 10 }}
    >
      SUBMIT ACTION
    </button>
  </span>
))}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```

Expected: all tests pass, including the 2 new ones.

- [ ] **Step 5: Run the full test suite**

```powershell
pnpm test
```

Expected: all tests pass across all packages.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/ControlPanel.tsx packages/client/src/admin/__tests__/ControlPanel.test.tsx
git commit -m "feat(client): add Submit Action button for disconnected slots in ControlPanel"
```

---

## Self-Review

**Spec coverage:**
- ✅ `'submit-default-action'` in `AdminActionPayload['type']` → Task 1
- ✅ `BattleRoom.submitDefaultAction()` using `buildValidMoves` + `submitAction` → Task 2
- ✅ Admin handler case → Task 3
- ✅ Button on disconnected slot in ControlPanel → Task 4
- ✅ Struggle fallback (all PP zero) → Task 2, Step 1 (5th test)
- ✅ Already-submitted guard → Task 2, Step 1 (2nd test)
- ✅ Wrong-phase guard → Task 2, Step 1 (3rd test)

**Placeholders:** None.

**Type consistency:**
- `submitDefaultAction` returns `{ ok: boolean; reason?: string }` — matches `submitAction` return type
- `MoveAction` import already present in `BattleRoom.ts`
- `btnStyle` referenced in Task 4 is defined at the bottom of `ControlPanel.tsx` (line 128)
- `sendAdminAction` is defined in `ControlPanel.tsx` (line 48) and already used by forfeit buttons — reused here
