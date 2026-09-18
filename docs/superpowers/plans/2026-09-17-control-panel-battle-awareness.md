# ControlPanel Battle Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three admin UX gaps — player disconnect indicator in ControlPanel, battle-end result panel in ControlPanel, and a Cancel Battle button on BattleWaitingScreen.

**Architecture:** All changes are purely additive. Gap 1 adds a `lobby:slot-status` listener to `ControlPanelInner`. Gap 2 reads the `battleResult` value already exposed by `BattleContext` and renders the existing `BattleResultPanel`. Gap 3 adds a `cancel-battle` admin action across shared types, the server DB layer, the socket server, and the waiting-screen UI.

**Tech Stack:** React + TypeScript (client), Node.js + Socket.io (server), better-sqlite3 (DB), Vitest + React Testing Library (tests), pnpm monorepo.

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/events.ts` | Add `'cancel-battle'` to `AdminActionPayload.type` union |
| `packages/server/src/db/Database.ts` | Widen `markEnded(…, winningTeamId: string)` to `string \| null` |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Add `cancelRoom` parameter; add `cancel-battle` case |
| `packages/server/src/socket/SocketServer.ts` | Add `cancelBattle` private method; pass it to `registerAdminHandlers` |
| `packages/client/src/admin/BattleWaitingScreen.tsx` | Add Cancel Battle button in footer |
| `packages/client/src/admin/ControlPanel.tsx` | Add `lobby:slot-status` listener + disconnect UI; read `battleResult` from context + render `BattleResultPanel` |

Test files touched:
- `packages/server/src/db/__tests__/Database.test.ts`
- `packages/server/src/socket/__tests__/adminHandlers.test.ts`
- `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx`
- `packages/client/src/admin/__tests__/ControlPanel.test.tsx`

---

## Task 1: Add `cancel-battle` to shared types and rebuild

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add the type**

Open `packages/shared/src/types/events.ts`. The `AdminActionPayload` interface starts at line 33. Add `'cancel-battle'` to the `type` union, after `'start-battle'`:

```ts
export interface AdminActionPayload {
  type:
    | 'npc-action'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
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

Run:
```
pnpm --filter @poke-fighter/shared build
```
Expected: no errors, `packages/shared/dist/` is updated.

- [ ] **Step 3: Commit**

```
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add cancel-battle to AdminActionPayload type"
```

---

## Task 2: Widen `markEnded` to accept a null winner

**Files:**
- Modify: `packages/server/src/db/Database.ts`
- Test: `packages/server/src/db/__tests__/Database.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/server/src/db/__tests__/Database.test.ts`, add a new test after the existing `'markEnded sets status ended with winningTeamId'` test (around line 172):

```ts
it('markEnded accepts null winningTeamId (cancelled battle)', () => {
  db.battles.insert(makeBattleState());
  db.battles.markEnded('b1', null);
  const summary = db.battles.list()[0]!;
  expect(summary.status).toBe('ended');
  expect(summary.winningTeamId).toBeNull();
  expect(summary.endedAt).toBeTypeOf('number');
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @poke-fighter/server exec vitest run src/db/__tests__/Database.test.ts
```
Expected: TypeScript compile error — argument of type `null` is not assignable to `string`.

- [ ] **Step 3: Widen the signature in Database.ts**

In `packages/server/src/db/Database.ts`, change `markEnded` (currently at line 142):

```ts
markEnded(battleId: string, winningTeamId: string | null): void {
  this.db.prepare(`
    UPDATE battles SET status = 'ended', winningTeamId = @winningTeamId, endedAt = @endedAt WHERE battleId = @battleId
  `).run({ battleId, winningTeamId, endedAt: Date.now() });
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm --filter @poke-fighter/server exec vitest run src/db/__tests__/Database.test.ts
```
Expected: all tests pass including the new one.

- [ ] **Step 5: Commit**

```
git add packages/server/src/db/Database.ts packages/server/src/db/__tests__/Database.test.ts
git commit -m "feat(db): allow null winningTeamId in markEnded for cancelled battles"
```

---

## Task 3: Add `cancel-battle` handler to server admin handlers

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Test: `packages/server/src/socket/__tests__/adminHandlers.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/server/src/socket/__tests__/adminHandlers.test.ts`, add a new `describe` block after the existing `registerAdminHandlers – battles:connect` block (around line 177). Also update the existing `beforeEach` in that block to pass a mock `cancelRoom` — the signature change will cause a TypeScript error until we add the parameter.

First, add the new test block:

```ts
describe('registerAdminHandlers – cancel-battle', () => {
  function makeAdminSocket(id = 'admin1') {
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

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;
  const mockCancelRoom = vi.fn();

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    mockCancelRoom.mockClear();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, mockCancelRoom);
  });

  afterEach(() => { db.close(); });

  it('calls cancelRoom with the battleId', () => {
    socket.trigger('admin:action', { type: 'cancel-battle', data: { battleId: 'b1' } });
    expect(mockCancelRoom).toHaveBeenCalledWith('b1');
  });

  it('does not call cancelRoom when battleId is missing', () => {
    socket.trigger('admin:action', { type: 'cancel-battle', data: {} });
    expect(mockCancelRoom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/adminHandlers.test.ts
```
Expected: TypeScript compile error — `registerAdminHandlers` does not accept 7 arguments.

- [ ] **Step 3: Add `cancelRoom` parameter and case to adminHandlers.ts**

In `packages/server/src/socket/handlers/adminHandlers.ts`, update the function signature (line 26) and add the `cancel-battle` case. Also update the existing `battles:connect` describe block's `beforeEach` to pass a `vi.fn()` for the new parameter.

New function signature:
```ts
export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom,
  db: AppDatabase,
  lobby: LobbyManager,
  cancelRoom: (battleId: string) => void
): void {
```

Add the `cancel-battle` case inside the `switch` (after the `forfeit` case, before `lobby:list`):
```ts
case 'cancel-battle': {
  const { battleId } = payload.data as { battleId: string };
  if (typeof battleId === 'string') cancelRoom(battleId);
  break;
}
```

- [ ] **Step 4: Update the existing test's `beforeEach` to pass `vi.fn()` for cancelRoom**

In the `registerAdminHandlers – battles:connect` describe block, the `beforeEach` at line 121 currently reads:
```ts
registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby);
```

Change it to:
```ts
registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby, vi.fn());
```

(Same fix needed for any other `registerAdminHandlers` call sites in the test file — search for them and add `vi.fn()` as the last argument.)

- [ ] **Step 5: Run all admin handler tests to verify they pass**

```
pnpm --filter @poke-fighter/server exec vitest run src/socket/__tests__/adminHandlers.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "feat(server): add cancel-battle admin action handler"
```

---

## Task 4: Wire `cancelBattle` into SocketServer

**Files:**
- Modify: `packages/server/src/socket/SocketServer.ts`

No new test file needed here — `SocketServer` is integration-tested through `adminHandlers.test.ts` which already covers the handler. The `SocketServer` method itself is trivial and tested indirectly.

- [ ] **Step 1: Add `cancelBattle` method to SocketServer**

In `packages/server/src/socket/SocketServer.ts`, add a new private method after `notifyAdminsOfBattles` (around line 135):

```ts
private cancelBattle(battleId: string): void {
  this.rooms.delete(battleId);
  this.db.battles.markEnded(battleId, null);
  this.notifyAdminsOfBattles();
  this.notifyPlayersOfBattles();
}
```

- [ ] **Step 2: Pass `cancelBattle` to `registerAdminHandlers`**

In `SocketServer.ts`, find the `registerAdminHandlers` call (line 57):
```ts
registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this), this.db, this.lobby);
```

Change it to:
```ts
registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this), this.db, this.lobby, this.cancelBattle.bind(this));
```

- [ ] **Step 3: Typecheck the server**

```
pnpm --filter @poke-fighter/server typecheck
```
Expected: no errors.

- [ ] **Step 4: Run all server tests**

```
pnpm --filter @poke-fighter/server test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/socket/SocketServer.ts
git commit -m "feat(server): wire cancelBattle into SocketServer and pass to admin handlers"
```

---

## Task 5: Add Cancel Battle button to BattleWaitingScreen

**Files:**
- Modify: `packages/client/src/admin/BattleWaitingScreen.tsx`
- Test: `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx`, add two tests after the existing `'calls onWatch with battleId when WATCH BATTLE is clicked'` test (around line 148):

```ts
it('renders a Cancel Battle button', () => {
  render(
    <BattleWaitingScreen
      battleId="battle-1"
      slotAssignment={slotAssignment}
      onBack={vi.fn()}
      onWatch={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: /cancel battle/i })).toBeTruthy();
});

it('emits cancel-battle and calls onBack when Cancel Battle is clicked', () => {
  const onBack = vi.fn();
  render(
    <BattleWaitingScreen
      battleId="battle-1"
      slotAssignment={slotAssignment}
      onBack={onBack}
      onWatch={vi.fn()}
    />
  );
  screen.getByRole('button', { name: /cancel battle/i }).click();
  expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
    type: 'cancel-battle',
    data: { battleId: 'battle-1' },
  });
  expect(onBack).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/BattleWaitingScreen.test.tsx
```
Expected: both new tests fail — button not found.

- [ ] **Step 3: Add the Cancel Battle button to BattleWaitingScreen.tsx**

In `packages/client/src/admin/BattleWaitingScreen.tsx`, replace the `<div style={styles.footer}>` block (lines 93–96):

```tsx
<div style={styles.footer}>
  <div style={styles.countText}>{joinedCount} / {totalCount} players connected</div>
  <button onClick={() => onWatch(battleId)} style={styles.watchButton}>WATCH BATTLE →</button>
</div>
```

With:

```tsx
<div style={styles.footer}>
  <div style={styles.countText}>{joinedCount} / {totalCount} players connected</div>
  <div style={{ display: 'flex', gap: 8 }}>
    <button
      onClick={() => {
        getSocket().emit('admin:action', { type: 'cancel-battle', data: { battleId } });
        onBack();
      }}
      style={{ background: '#c0392b', color: '#fff', border: 'none', padding: '5px 14px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}
    >
      Cancel Battle
    </button>
    <button onClick={() => onWatch(battleId)} style={styles.watchButton}>WATCH BATTLE →</button>
  </div>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/BattleWaitingScreen.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/client/src/admin/BattleWaitingScreen.tsx packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx
git commit -m "feat(client): add Cancel Battle button to BattleWaitingScreen"
```

---

## Task 6: Add disconnect indicator to ControlPanel (Gap 1)

**Files:**
- Modify: `packages/client/src/admin/ControlPanel.tsx`
- Test: `packages/client/src/admin/__tests__/ControlPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/admin/__tests__/ControlPanel.test.tsx`, add two tests after the existing `'shows NpcTabPanel when NPC requests arrive'` test (around line 114):

```ts
it('shows disconnect indicator when lobby:slot-status arrives with a disconnected slot', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
  act(() => {
    slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
  });
  expect(screen.getByText(/Alice disconnected/)).toBeTruthy();
});

it('does not show disconnect indicator when all slots are joined', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
  act(() => {
    slotStatusCall![1]({ battleId: 'b1', slots: [{ slotId: 'a1', displayName: 'Alice', joined: true }] });
  });
  expect(screen.queryByText(/Alice disconnected/)).toBeNull();
});

it('ignores lobby:slot-status for a different battleId', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const slotStatusCall = mockSocket.on.mock.calls.find((c) => c[0] === 'lobby:slot-status');
  act(() => {
    slotStatusCall![1]({ battleId: 'OTHER', slots: [{ slotId: 'a1', displayName: 'Alice', joined: false }] });
  });
  expect(screen.queryByText(/Alice disconnected/)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```
Expected: three new tests fail — no `lobby:slot-status` handler registered.

- [ ] **Step 3: Add slot status state and listener to ControlPanelInner**

In `packages/client/src/admin/ControlPanel.tsx`, make these changes to `ControlPanelInner`:

Add import for `SlotStatusPayload`:
```ts
import type { ActionRequestPayload, AdminActionPayload, SlotStatusPayload } from '@poke-fighter/shared';
```

Add state at the top of `ControlPanelInner` (after the `npcRequests` state line):
```ts
const [slotStatuses, setSlotStatuses] = useState<SlotStatusPayload['slots']>([]);
```

In the existing `useEffect`, add the new listener and initial request. The current useEffect registers `npc:action-request` and `turn:resolve`. Extend it to also register `lobby:slot-status` and request the initial status:

```ts
useEffect(() => {
  const socket = getSocket();

  const onNpcRequest = (payload: { battleId: string; slots: NpcSlotRequest[] }) => {
    if (payload.battleId === battleId) setNpcRequests(payload.slots);
  };
  const onTurnResolve = () => setNpcRequests([]);
  const onSlotStatus = (payload: SlotStatusPayload) => {
    if (payload.battleId === battleId) setSlotStatuses(payload.slots);
  };

  socket.on('npc:action-request', onNpcRequest);
  socket.on('turn:resolve', onTurnResolve);
  socket.on('lobby:slot-status', onSlotStatus);

  socket.emit('admin:action', { type: 'lobby:slot-status', data: { battleId } } as any);

  return () => {
    socket.off('npc:action-request', onNpcRequest);
    socket.off('turn:resolve', onTurnResolve);
    socket.off('lobby:slot-status', onSlotStatus);
  };
}, [battleId]);
```

In the render, add disconnect indicators in the header row, after the `ADMIN VIEW` span (around line 66):

```tsx
<span style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW</span>
{slotStatuses.filter(s => !s.joined).map(s => (
  <span key={s.slotId} style={{ color: '#e74c3c', fontSize: 11 }}>
    ⚠ {s.displayName} disconnected
  </span>
))}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/client/src/admin/ControlPanel.tsx packages/client/src/admin/__tests__/ControlPanel.test.tsx
git commit -m "feat(client): show player disconnect indicator in ControlPanel header"
```

---

## Task 7: Show battle result panel in ControlPanel (Gap 2)

**Files:**
- Modify: `packages/client/src/admin/ControlPanel.tsx`
- Test: `packages/client/src/admin/__tests__/ControlPanel.test.tsx`

`BattleContext` (which wraps `ControlPanel`) already listens to `battle:end` and exposes `battleResult: { winningTeamId: string; finalState: BattleState } | null` via `useBattle()`. No new socket listener is needed.

- [ ] **Step 1: Add `BattleResultPanel` mock to the test file**

In `packages/client/src/admin/__tests__/ControlPanel.test.tsx`, add a new `vi.mock` call after the existing mocks (around line 16):

```ts
vi.mock('../../battle/overlays/BattleResultPanel.js', () => ({
  BattleResultPanel: ({ winningTeamId, onGoHome }: { winningTeamId: string; onGoHome: () => void }) => (
    <div data-testid="battle-result-panel" data-winner={winningTeamId}>
      <button onClick={onGoHome}>Return</button>
    </div>
  ),
}));
```

- [ ] **Step 2: Write the failing tests**

Add two tests after the disconnect indicator tests added in Task 6:

```ts
it('shows BattleResultPanel when battle:end arrives', () => {
  render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
  const battleEndCall = mockSocket.on.mock.calls.find((c) => c[0] === 'battle:end');
  act(() => {
    battleEndCall![1]({ winningTeamId: 'team-a', state: makeState() });
  });
  expect(screen.getByTestId('battle-result-panel')).toBeTruthy();
  expect(screen.queryByText('No pending NPC actions')).toBeNull();
});

it('calls onBack when Return is clicked in BattleResultPanel', () => {
  const onBack = vi.fn();
  render(<ControlPanel battleId="b1" onBack={onBack} />);
  const battleEndCall = mockSocket.on.mock.calls.find((c) => c[0] === 'battle:end');
  act(() => {
    battleEndCall![1]({ winningTeamId: 'team-a', state: makeState() });
  });
  fireEvent.click(screen.getByRole('button', { name: /return/i }));
  expect(onBack).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```
Expected: two new tests fail — `battle-result-panel` not found.

- [ ] **Step 4: Add BattleResultPanel import and render it in ControlPanel**

In `packages/client/src/admin/ControlPanel.tsx`:

Add import at the top (after the existing imports):
```ts
import { BattleResultPanel } from '../battle/overlays/BattleResultPanel.js';
```

In `ControlPanelInner`, update the `useBattle` destructure to include `battleResult`:
```ts
const { state, turnLog, battleResult } = useBattle();
```

Replace the NPC actions panel section (the `<div style={{ flex: 1 }}>` block around lines 81–90) with:
```tsx
<div style={{ flex: 1 }}>
  {battleResult ? (
    <BattleResultPanel
      winningTeamId={battleResult.winningTeamId}
      finalState={battleResult.finalState}
      mySlotId="__admin__"
      onGoHome={onBack}
    />
  ) : npcRequests.length > 0 ? (
    <NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
  ) : (
    <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>
      No pending NPC actions
    </div>
  )}
</div>
```

`battleResult` type is inferred from `useBattle()` — no extra type import needed.

- [ ] **Step 5: Run tests to verify they pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
```
Expected: all tests pass.

- [ ] **Step 6: Typecheck the client**

```
pnpm --filter @poke-fighter/client typecheck
```
Expected: no errors.

- [ ] **Step 7: Run all client tests**

```
pnpm --filter @poke-fighter/client test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```
git add packages/client/src/admin/ControlPanel.tsx packages/client/src/admin/__tests__/ControlPanel.test.tsx
git commit -m "feat(client): show BattleResultPanel in ControlPanel when battle ends"
```

---

## Task 8: Final typecheck and full test run

- [ ] **Step 1: Typecheck all packages**

```
pnpm typecheck
```
Expected: no errors across shared, server, and client.

- [ ] **Step 2: Run all tests**

```
pnpm test
```
Expected: all tests pass.

- [ ] **Step 3: Commit any remaining changes (if needed)**

If all tests pass and typechecking is clean, there are no additional changes. The plan is complete.
