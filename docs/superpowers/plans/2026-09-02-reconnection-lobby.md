# Reconnection & Lobby Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all active battles in the lobby with slot-connection status, support player reconnection after tab close, and add a Home button to the battle screen.

**Architecture:** Add a `status` field to `BattleJoinOption.slots` (shared types), return all active rooms from `getBattleJoinOptions()` (server), handle intentional exit with a new `player:leave` socket event (server + client), and render status-aware UI in `LobbyPage` plus a Home button in `BattlePage`.

**Tech Stack:** TypeScript, Socket.io, React, Vitest. Server: `packages/server`. Client: `packages/client`. Shared: `packages/shared`.

**Test commands:**
- Server: run from `packages/server/` → `npm test`; single file: `npx vitest run src/socket/__tests__/lobbyHandlers.test.ts`
- Client: run from `packages/client/` → `npm test`; single file: `npx vitest run src/__tests__/LobbyPage.test.tsx`
- Typecheck (shared): run from `packages/shared/` → `npm run typecheck` (or `npx tsc --noEmit`)

---

### Task 1: Shared type changes

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Update `BattleJoinOption` and `ClientToServerEvents`**

Replace the current `BattleJoinOption` interface and add `player:leave` to `ClientToServerEvents`:

```typescript
// In packages/shared/src/types/events.ts

// REPLACE the existing BattleJoinOption:
export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{
    slotId: string;
    displayName: string;
    status: 'available' | 'reconnectable' | 'occupied';
  }>;
}

// REPLACE the existing ClientToServerEvents (add player:leave):
export interface ClientToServerEvents {
  'player:join': (payload: PlayerJoinPayload) => void;
  'action:submit': (payload: ActionSubmitPayload) => void;
  'action:resync': () => void;
  'switch:submit': (payload: SwitchSubmitPayload) => void;
  'admin:action': (payload: AdminActionPayload) => void;
  'player:leave': () => void;
}
```

- [ ] **Step 2: Typecheck shared**

Run from `packages/shared/`:
```
npx tsc --noEmit
```
Expected: zero errors (the type change itself has no downstream issues in `shared`).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat: add slot status to BattleJoinOption and player:leave event"
```

---

### Task 2: `computeSlotStatus` helper + unit tests

**Files:**
- Modify: `packages/server/src/socket/LobbyManager.ts`
- Modify: `packages/server/src/socket/__tests__/LobbyManager.test.ts`

- [ ] **Step 1: Write failing tests**

Open `packages/server/src/socket/__tests__/LobbyManager.test.ts`. Add this describe block **after** the existing tests (after the last closing brace):

```typescript
import { computeSlotStatus } from '../LobbyManager.js';

describe('computeSlotStatus', () => {
  it('returns available when player is undefined', () => {
    expect(computeSlotStatus(undefined)).toBe('available');
  });

  it('returns reconnectable when player has disconnectedAt set', () => {
    const player = { socketId: 's1', displayName: 'Alice', disconnectedAt: Date.now() };
    expect(computeSlotStatus(player)).toBe('reconnectable');
  });

  it('returns occupied when player exists with no disconnectedAt', () => {
    const player = { socketId: 's1', displayName: 'Alice' };
    expect(computeSlotStatus(player)).toBe('occupied');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/server/`:
```
npx vitest run src/socket/__tests__/LobbyManager.test.ts
```
Expected: FAIL — `computeSlotStatus` is not exported.

- [ ] **Step 3: Implement `computeSlotStatus`**

Open `packages/server/src/socket/LobbyManager.ts`. Add this exported function **after the closing brace of the `LobbyManager` class**:

```typescript
export function computeSlotStatus(
  player: ConnectedPlayer | undefined,
): 'available' | 'reconnectable' | 'occupied' {
  if (!player) return 'available';
  return player.disconnectedAt !== undefined ? 'reconnectable' : 'occupied';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `packages/server/`:
```
npx vitest run src/socket/__tests__/LobbyManager.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/LobbyManager.ts packages/server/src/socket/__tests__/LobbyManager.test.ts
git commit -m "feat: export computeSlotStatus helper from LobbyManager"
```

---

### Task 3: Update `getBattleJoinOptions()` to return all active rooms

**Files:**
- Modify: `packages/server/src/socket/SocketServer.ts`

- [ ] **Step 1: Import `computeSlotStatus`**

In `packages/server/src/socket/SocketServer.ts`, update the `LobbyManager` import line:

```typescript
// REPLACE:
import { LobbyManager } from './LobbyManager.js';

// WITH:
import { LobbyManager, computeSlotStatus } from './LobbyManager.js';
```

- [ ] **Step 2: Replace `getBattleJoinOptions()`**

Find the `private getBattleJoinOptions()` method and replace it entirely:

```typescript
private getBattleJoinOptions(): BattleJoinOption[] {
  const options: BattleJoinOption[] = [];
  for (const [battleId, room] of this.rooms) {
    const state = room.getStateSnapshot();
    const slots = state.teams
      .flatMap((t) => t.slots)
      .filter((s) => !s.isNpc && !s.isSpectator)
      .map((s) => ({
        slotId: s.slotId,
        displayName: s.displayName,
        status: computeSlotStatus(this.lobby.getBySlotId(s.slotId)),
      }));
    options.push({ battleId, label: state.label, slots });
  }
  return options;
}
```

- [ ] **Step 3: Typecheck server**

Run from `packages/server/`:
```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Run full server test suite**

Run from `packages/server/`:
```
npm test
```
Expected: all existing tests PASS (this change has no test coverage yet; we're verifying no regressions).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/SocketServer.ts
git commit -m "feat: getBattleJoinOptions returns all active rooms with slot status"
```

---

### Task 4: `player:leave` handler + tests

**Files:**
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`

- [ ] **Step 1: Update the mock helpers in the test file**

Open `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`.

1. Add `leave` to the `MockSocket` interface:

```typescript
interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;   // ADD THIS LINE
  on: (event: string, handler: (payload: unknown) => void) => void;
}
```

2. Add `leave: vi.fn()` inside `makeSocket()`:

```typescript
function makeSocket(id = 'sock1'): MockSocket & { trigger(e: string, p: unknown): void } {
  const handlers: Record<string, (p: unknown) => void> = {};
  return {
    id,
    data: {},
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),   // ADD THIS LINE
    on: (event, handler) => { handlers[event] = handler; },
    trigger(event: string, payload: unknown) {
      handlers[event]?.(payload);
    },
  };
}
```

3. Add `removePlayer` to `makeLobby()`:

```typescript
function makeLobby() {
  return {
    registerPlayer: vi.fn(),
    getBySlotId: vi.fn(),
    getBySocketId: vi.fn(),
    markDisconnected: vi.fn(),
    removePlayer: vi.fn(),           // ADD THIS LINE
    getWaitingPlayers: vi.fn(() => []),
    getByName: vi.fn(),
  };
}
```

- [ ] **Step 2: Write failing tests for `player:leave`**

Add a new describe block **after** the existing `registerLobbyHandlers – player:join` block in the test file:

```typescript
describe('registerLobbyHandlers – player:leave', () => {
  it('removes the player, clears socket.data.battleId, leaves the room, and notifies', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    const room = makeRoom();
    const notifyAdminsOfSlotStatus = vi.fn();
    const notifyPlayersOfBattles = vi.fn();

    socket.data['battleId'] = 'battle-1';
    lobby.getBySocketId.mockReturnValue({
      socketId: 'sock1',
      displayName: 'Ash',
      battleId: 'battle-1',
      battleSlotId: 'slot-a1',
    });

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (room as any) : undefined),
      vi.fn(),
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).toHaveBeenCalledWith('sock1');
    expect(socket.data['battleId']).toBeUndefined();
    expect(socket.leave).toHaveBeenCalledWith('battle:battle-1');
    expect(notifyAdminsOfSlotStatus).toHaveBeenCalledWith('battle-1');
    expect(notifyPlayersOfBattles).toHaveBeenCalled();
  });

  it('is a no-op when the socket has no associated player', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    lobby.getBySocketId.mockReturnValue(undefined);
    const notifyPlayersOfBattles = vi.fn();

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      () => undefined,
      vi.fn(),
      vi.fn(),
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).not.toHaveBeenCalled();
    expect(notifyPlayersOfBattles).not.toHaveBeenCalled();
  });

  it('is a no-op when the player has no battleId', () => {
    const socket = makeSocket();
    const lobby = makeLobby();
    lobby.getBySocketId.mockReturnValue({
      socketId: 'sock1',
      displayName: 'Ash',
      battleId: undefined,
    });
    const notifyPlayersOfBattles = vi.fn();

    registerLobbyHandlers(
      socket as any,
      lobby as any,
      () => undefined,
      vi.fn(),
      vi.fn(),
      notifyPlayersOfBattles,
      vi.fn(() => []),
    );

    socket.trigger('player:leave', undefined);

    expect(lobby.removePlayer).not.toHaveBeenCalled();
    expect(notifyPlayersOfBattles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run from `packages/server/`:
```
npx vitest run src/socket/__tests__/lobbyHandlers.test.ts
```
Expected: FAIL — `player:leave` handler not yet registered (no handler found).

- [ ] **Step 4: Implement the `player:leave` handler**

Open `packages/server/src/socket/handlers/lobbyHandlers.ts`. Add the handler **after** the closing brace of the `socket.on('player:join', ...)` block, still inside `registerLobbyHandlers`:

```typescript
socket.on('player:leave', () => {
  const player = lobby.getBySocketId(socket.id);
  if (!player?.battleId) return;
  const { battleId } = player;
  lobby.removePlayer(socket.id);
  delete socket.data['battleId'];
  socket.leave(`battle:${battleId}`);
  notifyAdminsOfSlotStatus(battleId);
  notifyPlayersOfBattles();
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run from `packages/server/`:
```
npx vitest run src/socket/__tests__/lobbyHandlers.test.ts
```
Expected: all tests PASS.

- [ ] **Step 6: Run full server test suite**

Run from `packages/server/`:
```
npm test
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/socket/handlers/lobbyHandlers.ts packages/server/src/socket/__tests__/lobbyHandlers.test.ts
git commit -m "feat: add player:leave handler to free slot on deliberate exit"
```

---

### Task 5: `LobbyPage` — render all battles with slot status

**Files:**
- Modify: `packages/client/src/__tests__/LobbyPage.test.tsx`
- Modify: `packages/client/src/pages/LobbyPage.tsx`

- [ ] **Step 1: Update mock data and add new failing tests**

Open `packages/client/src/__tests__/LobbyPage.test.tsx`.

1. Update `mockBattles` to include `status` on each slot (required by the updated type):

```typescript
const mockBattles = [
  {
    battleId: 'battle-1',
    label: 'Friday Night Brawl',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor', status: 'available' as const },
      { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
    ],
  },
];
```

2. Add new tests **inside** the existing `describe('LobbyPage', ...)` block, after the last `it(...)`:

```typescript
it('shows "Full – In Progress" and no slot dropdown when all slots are occupied', () => {
  const fullBattle = {
    battleId: 'battle-2',
    label: 'Locked Battle',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor', status: 'occupied' as const },
      { slotId: 'slot-b1', displayName: 'Kyle', status: 'occupied' as const },
    ],
  };
  render(<MemoryRouter><LobbyPage /></MemoryRouter>);
  act(() => {
    socketHandlers['lobby:battles']?.({ battles: [fullBattle] });
  });
  fireEvent.click(screen.getByText('Locked Battle'));
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getByText(/full/i)).toBeTruthy();
});

it('appends (reconnect) to reconnectable slot names in the dropdown', () => {
  const reconnectBattle = {
    battleId: 'battle-3',
    label: 'Reconnect Battle',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor', status: 'reconnectable' as const },
      { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
    ],
  };
  render(<MemoryRouter><LobbyPage /></MemoryRouter>);
  act(() => {
    socketHandlers['lobby:battles']?.({ battles: [reconnectBattle] });
  });
  fireEvent.click(screen.getByText('Reconnect Battle'));
  expect(screen.getByText('Conor (reconnect)')).toBeTruthy();
});

it('excludes occupied slots from the slot dropdown', () => {
  const mixedBattle = {
    battleId: 'battle-4',
    label: 'Mixed Battle',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor', status: 'occupied' as const },
      { slotId: 'slot-b1', displayName: 'Kyle', status: 'available' as const },
    ],
  };
  render(<MemoryRouter><LobbyPage /></MemoryRouter>);
  act(() => {
    socketHandlers['lobby:battles']?.({ battles: [mixedBattle] });
  });
  fireEvent.click(screen.getByText('Mixed Battle'));
  expect(screen.getByRole('combobox')).toBeTruthy();
  expect(screen.queryByText(/Conor/)).toBeNull();
  expect(screen.getByText('Kyle')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `packages/client/`:
```
npx vitest run src/__tests__/LobbyPage.test.tsx
```
Expected: new tests FAIL (component not yet updated). Existing tests may also fail due to the `status` field now being required by TypeScript — that's expected.

- [ ] **Step 3: Update `LobbyPage.tsx`**

Replace the full contents of `packages/client/src/pages/LobbyPage.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, connectAsPlayer } from '../socket.js';
import type { LobbyErrorPayload, BattleJoinOption, BattleState } from '@poke-fighter/shared';

type Phase = 'browse' | 'waiting';

export function LobbyPage() {
  const [phase, setPhase] = useState<Phase>('browse');
  const [battles, setBattles] = useState<BattleJoinOption[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinedDisplayName, setJoinedDisplayName] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (selectedBattleId === null) return;
    const battle = battles.find((b) => b.battleId === selectedBattleId);
    if (!battle) {
      setSelectedBattleId(null);
      setSelectedSlotId(null);
      return;
    }
    if (selectedSlotId !== null && !battle.slots.find((s) => s.slotId === selectedSlotId)) {
      setSelectedSlotId(null);
    }
  }, [battles, selectedBattleId, selectedSlotId]);

  useEffect(() => {
    connectAsPlayer();
    const socket = getSocket();

    socket.on('lobby:battles', (payload: { battles: BattleJoinOption[] }) => {
      setBattles(payload.battles);
    });

    socket.on('lobby:error', (payload: LobbyErrorPayload) => {
      setError(payload.message);
      setPhase('browse');
    });

    socket.on('state:sync', (state: BattleState) => {
      navigate('/battle', { state: { battleState: state } });
    });

    return () => {
      socket.off('lobby:battles');
      socket.off('lobby:error');
      socket.off('state:sync');
    };
  }, [navigate]);

  function handleJoin() {
    if (!selectedBattleId || !selectedSlotId) return;

    const battle = battles.find((b) => b.battleId === selectedBattleId);
    const slot = battle?.slots.find((s) => s.slotId === selectedSlotId);
    if (!slot) return;

    setError(null);
    setJoinedDisplayName(slot.displayName);
    sessionStorage.setItem('mySlotId', selectedSlotId);
    getSocket().emit('player:join', { battleId: selectedBattleId, slotId: selectedSlotId });
    setPhase('waiting');
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.waiting}>Welcome, <strong>{joinedDisplayName}</strong>!</p>
          <p style={styles.subtitle}>Waiting for the battle to begin...</p>
          <div style={styles.spinner}>■ ■ ■</div>
        </div>
      </div>
    );
  }

  const selectedBattle = battles.find((b) => b.battleId === selectedBattleId) ?? null;
  const joinableSlots = selectedBattle?.slots.filter((s) => s.status !== 'occupied') ?? [];
  const canJoin = selectedBattleId !== null && selectedSlotId !== null;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <div style={styles.box}>
        <div style={styles.sectionLabel}>Select Battle</div>

        {battles.length === 0 ? (
          <p style={styles.emptyText}>No active battles yet. Check with your admin.</p>
        ) : (
          battles.map((b) => {
            const joinable = b.slots.filter((s) => s.status !== 'occupied').length;
            return (
              <div
                key={b.battleId}
                onClick={() => { setSelectedBattleId(b.battleId); setSelectedSlotId(null); }}
                style={{
                  ...styles.battleCard,
                  borderColor: selectedBattleId === b.battleId ? '#27ae60' : '#333',
                  background: selectedBattleId === b.battleId ? '#0d1a12' : '#111',
                }}
              >
                <div style={styles.battleLabel}>{b.label}</div>
                {joinable > 0 ? (
                  <div style={styles.slotCount}>{joinable} slot{joinable !== 1 ? 's' : ''} available</div>
                ) : (
                  <div style={{ ...styles.slotCount, color: '#666' }}>Full – In Progress</div>
                )}
              </div>
            );
          })
        )}

        {selectedBattle && joinableSlots.length > 0 && (
          <div style={styles.slotSection}>
            <div style={styles.sectionLabel}>You are...</div>
            <select
              style={styles.select}
              value={selectedSlotId ?? ''}
              onChange={(e) => setSelectedSlotId(e.target.value || null)}
            >
              <option value="">— pick your slot —</option>
              {joinableSlots.map((s) => (
                <option key={s.slotId} value={s.slotId}>
                  {s.displayName}{s.status === 'reconnectable' ? ' (reconnect)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: canJoin ? 1 : 0.5 }}
          disabled={!canJoin}
          onClick={handleJoin}
        >
          JOIN BATTLE
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 14, minWidth: 320, maxWidth: 400 },
  sectionLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const },
  emptyText: { color: '#555', fontSize: 13 },
  battleCard: { border: '2px solid #333', borderRadius: 6, padding: '12px 14px', cursor: 'pointer' },
  battleLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' as const },
  slotCount: { color: '#aaa', fontSize: 11, marginTop: 3 },
  slotSection: { display: 'flex', flexDirection: 'column' as const, gap: 10, borderTop: '1px solid #222', paddingTop: 14 },
  select: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit' },
  error: { color: '#e74c3c', fontSize: 12 },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  waiting: { color: '#fff', fontSize: 18 },
  subtitle: { color: '#aaa', fontSize: 14 },
  spinner: { color: '#3498db', fontSize: 24, textAlign: 'center' as const },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `packages/client/`:
```
npx vitest run src/__tests__/LobbyPage.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/LobbyPage.tsx packages/client/src/__tests__/LobbyPage.test.tsx
git commit -m "feat: lobby shows all active battles with slot status and reconnect labels"
```

---

### Task 6: Home button on `BattlePage`

**Files:**
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx`
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Write failing tests**

Open `packages/client/src/pages/__tests__/BattlePage.test.tsx`. Add these tests **inside** the existing `describe('BattlePage', ...)` block, after the last `it(...)`:

```typescript
it('renders a Home button in the battle view', () => {
  renderBattlePage(makeState());
  expect(screen.getByRole('button', { name: /home/i })).toBeTruthy();
});

it('clicking Home emits player:leave and clears sessionStorage.mySlotId', () => {
  sessionStorage.setItem('mySlotId', 'a1');
  renderBattlePage(makeState());
  fireEvent.click(screen.getByRole('button', { name: /home/i }));
  expect(mockSocket.emit).toHaveBeenCalledWith('player:leave');
  expect(sessionStorage.getItem('mySlotId')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `packages/client/`:
```
npx vitest run src/pages/__tests__/BattlePage.test.tsx
```
Expected: new tests FAIL — no Home button in the component yet.

- [ ] **Step 3: Update `BattlePage.tsx`**

Open `packages/client/src/pages/BattlePage.tsx`.

1. Update the react-router-dom import to include `useNavigate`:

```typescript
// REPLACE:
import { useLocation } from 'react-router-dom';
// WITH:
import { useLocation, useNavigate } from 'react-router-dom';
```

2. Add `getSocket` to the socket import:

```typescript
// REPLACE:
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
// WITH:
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { getSocket } from '../socket.js';
```

3. Inside `BattleView()`, add `useNavigate` and the `handleGoHome` function. Add these **before** the existing `const [targetingMove, ...]` line:

```typescript
function BattleView() {
  const navigate = useNavigate();
  const { state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction } = useBattle();
  // ... existing useState declarations ...

  function handleGoHome() {
    getSocket().emit('player:leave');
    sessionStorage.removeItem('mySlotId');
    navigate('/');
  }
```

4. In the `return (...)` of `BattleView`, update the outer div to add `position: 'relative'` and insert the Home button as the first child:

```typescript
return (
  <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12, position: 'relative' }}>
    <button
      onClick={handleGoHome}
      style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
    >
      ← Home
    </button>

    {/* existing content starts here — the label div, HpBarsRow, BattleScene, etc. */}
    <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>
    {/* ... rest of existing JSX unchanged ... */}
  </div>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `packages/client/`:
```
npx vitest run src/pages/__tests__/BattlePage.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 5: Run the full client test suite**

Run from `packages/client/`:
```
npm test
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git commit -m "feat: add Home button to battle screen that emits player:leave"
```

---

### Task 7: Final typecheck and integration verification

- [ ] **Step 1: Typecheck all packages**

Run from the repo root (or each package directory):
```
cd packages/shared && npx tsc --noEmit
cd ../server && npx tsc --noEmit
cd ../client && npx tsc --noEmit
```
Expected: zero errors in all three packages.

- [ ] **Step 2: Run all tests**

Run from `packages/server/`:
```
npm test
```
Run from `packages/client/`:
```
npm test
```
Expected: all tests PASS in both.

- [ ] **Step 3: Commit if any fixes were needed**

If the typecheck or tests revealed anything that needed fixing, commit those fixes:
```bash
git add -p
git commit -m "fix: address typecheck issues from reconnection feature"
```
