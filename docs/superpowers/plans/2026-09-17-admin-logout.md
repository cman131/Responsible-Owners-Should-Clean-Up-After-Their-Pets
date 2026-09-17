# Admin Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LOG OUT button to `HubPanel` so admins can explicitly end their session without waiting for the 8-hour TTL.

**Architecture:** `AdminShell` owns auth state and defines `handleLogout` (clears localStorage, sets `authenticated = false`, disconnects socket). The callback is prop-threaded through `AdminRouter` to `HubPanel`, where a small LOG OUT button renders absolutely in the top-right corner. This follows the existing pattern used by all other callbacks (`onBack`, `onWatch`, etc.).

**Tech Stack:** React (TSX), Vitest + @testing-library/react, socket.io-client (`getSocket().disconnect()`)

---

## File Map

| File | Change |
|------|--------|
| `packages/client/src/admin/HubPanel.tsx` | Add `onLogout` prop; add `position: relative` to outer div; add LOG OUT button |
| `packages/client/src/admin/AdminRouter.tsx` | Add `AdminRouterProps` interface with `onLogout`; forward to `HubPanel` |
| `packages/client/src/admin/AdminShell.tsx` | Add `handleLogout`; pass to `<AdminRouter onLogout={handleLogout}>` |
| `packages/client/src/admin/__tests__/HubPanel.test.tsx` | Add `onLogout` to all existing renders; add logout click test |
| `packages/client/src/admin/__tests__/AdminRouter.test.tsx` | Update HubPanel mock to expose logout button; update existing renders; add logout test |
| `packages/client/src/admin/__tests__/AdminShell.test.tsx` | Add `disconnect` to mockSocket; update AdminRouter mock to expose logout button; add logout test |
| `docs/tech-debt/admin/no-admin-logout.md` | Update State: `New` → `InProgress` at start, `Complete` at end |

---

### Task 1: Mark tech debt InProgress

**Files:**
- Modify: `docs/tech-debt/admin/no-admin-logout.md`

- [ ] **Step 1: Update State field**

Change line 3 from:
```
New
```
to:
```
InProgress
```

- [ ] **Step 2: Commit**

```bash
git add docs/tech-debt/admin/no-admin-logout.md
git commit -m "docs: mark admin-logout tech debt InProgress"
```

---

### Task 2: HubPanel — add `onLogout` prop and LOG OUT button (TDD)

**Files:**
- Modify: `packages/client/src/admin/HubPanel.tsx`
- Test: `packages/client/src/admin/__tests__/HubPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `packages/client/src/admin/__tests__/HubPanel.test.tsx`. Add `onLogout={vi.fn()}` to every existing `render(<HubPanel ...>)` call (3 tests), then add this new test at the end of the `describe` block:

```tsx
it('calls onLogout when LOG OUT button is clicked', () => {
  const onLogout = vi.fn();
  render(<HubPanel onSetup={vi.fn()} onBattles={vi.fn()} onRegistry={vi.fn()} onLogout={onLogout} />);
  fireEvent.click(screen.getByRole('button', { name: /log out/i }));
  expect(onLogout).toHaveBeenCalled();
});
```

The three existing tests need `onLogout={vi.fn()}` added, e.g.:
```tsx
render(<HubPanel onSetup={onSetup} onBattles={vi.fn()} onRegistry={vi.fn()} onLogout={vi.fn()} />);
```
(Apply to all three.)

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/client && npx vitest run src/admin/__tests__/HubPanel.test.tsx
```

Expected: new test FAILS (LOG OUT button not found), existing three tests may fail too due to missing required prop — that's fine, we're about to fix both.

- [ ] **Step 3: Implement HubPanel changes**

Replace the full content of `packages/client/src/admin/HubPanel.tsx` with:

```tsx
interface HubPanelProps {
  onSetup: () => void;
  onBattles: () => void;
  onRegistry: () => void;
  onLogout: () => void;
}

export function HubPanel({ onSetup, onBattles, onRegistry, onLogout }: HubPanelProps) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <button onClick={onLogout} style={logoutBtn}>LOG OUT</button>
      <h1 style={{ fontSize: 32, letterSpacing: 6, color: '#e74c3c' }}>ADMIN</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        <button onClick={onSetup} style={tile('#e74c3c')}>
          <div style={{ fontSize: 32 }}>⚔</div>
          <div style={{ color: '#e74c3c', letterSpacing: 2, fontSize: 13 }}>BATTLE SETUP</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Start a new battle</div>
        </button>
        <button onClick={onBattles} style={tile('#3498db')}>
          <div style={{ fontSize: 32 }}>📋</div>
          <div style={{ color: '#3498db', letterSpacing: 2, fontSize: 13 }}>BATTLES</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Active & history</div>
        </button>
        <button onClick={onRegistry} style={tile('#27ae60')}>
          <div style={{ fontSize: 32 }}>👤</div>
          <div style={{ color: '#27ae60', letterSpacing: 2, fontSize: 13 }}>REGISTRY</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Manage NPCs & Players</div>
        </button>
      </div>
    </div>
  );
}

function tile(accent: string): React.CSSProperties {
  return {
    background: '#111', border: `2px solid ${accent}`, borderRadius: 8,
    padding: '32px 40px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', width: 180,
  };
}

const logoutBtn: React.CSSProperties = {
  position: 'absolute', top: 16, right: 16,
  background: 'transparent', border: '1px solid #555', color: '#888',
  padding: '6px 14px', fontSize: 11, letterSpacing: 2,
  cursor: 'pointer', fontFamily: 'inherit', borderRadius: 4,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && npx vitest run src/admin/__tests__/HubPanel.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/HubPanel.tsx packages/client/src/admin/__tests__/HubPanel.test.tsx
git commit -m "feat: add onLogout prop and LOG OUT button to HubPanel"
```

---

### Task 3: AdminRouter — accept and forward `onLogout` (TDD)

**Files:**
- Modify: `packages/client/src/admin/AdminRouter.tsx`
- Test: `packages/client/src/admin/__tests__/AdminRouter.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `packages/client/src/admin/__tests__/AdminRouter.test.tsx`.

Update the HubPanel mock (around line 6) to expose a logout button:

```tsx
vi.mock('../HubPanel.js', () => ({
  HubPanel: ({ onSetup, onRegistry, onBattles, onLogout }: any) => (
    <div>
      <button onClick={onSetup}>hub-setup</button>
      <button onClick={onRegistry}>hub-registry</button>
      <button onClick={onBattles}>hub-battles</button>
      <button onClick={onLogout}>hub-logout</button>
    </div>
  ),
}));
```

Update every `render(<AdminRouter />)` call (all 9 tests) to pass a no-op `onLogout`:

```tsx
render(<AdminRouter onLogout={vi.fn()} />);
```

Then add this new test at the end of the `describe` block:

```tsx
it('calls onLogout prop when HubPanel triggers logout', () => {
  const onLogout = vi.fn();
  render(<AdminRouter onLogout={onLogout} />);
  fireEvent.click(screen.getByText('hub-logout'));
  expect(onLogout).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/client && npx vitest run src/admin/__tests__/AdminRouter.test.tsx
```

Expected: new test FAILS (hub-logout button not found), existing tests may also fail due to missing prop — that's expected.

- [ ] **Step 3: Implement AdminRouter changes**

Replace the full content of `packages/client/src/admin/AdminRouter.tsx` with:

```tsx
import { useState } from 'react';
import { getSocket } from '../socket.js';
import { HubPanel } from './HubPanel.js';
import { SetupPanel } from './SetupPanel.js';
import { RegistryPanel } from './RegistryPanel.js';
import { ControlPanel } from './ControlPanel.js';
import { BattlesPanel } from './BattlesPanel.js';

type Mode = 'setup' | 'registry' | 'battles' | null;

interface AdminRouterProps {
  onLogout: () => void;
}

export function AdminRouter({ onLogout }: AdminRouterProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  function handleWatch(battleId: string) {
    getSocket().emit('admin:action', { type: 'battles:connect', data: { battleId } } as any);
    setActiveBattle(battleId);
  }

  if (activeBattle) {
    return <ControlPanel battleId={activeBattle} onBack={() => setActiveBattle(null)} />;
  }
  if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
  if (mode === 'registry') return <RegistryPanel onBack={() => setMode(null)} />;
  if (mode === 'battles') return <BattlesPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
  return (
    <HubPanel
      onSetup={() => setMode('setup')}
      onRegistry={() => setMode('registry')}
      onBattles={() => setMode('battles')}
      onLogout={onLogout}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && npx vitest run src/admin/__tests__/AdminRouter.test.tsx
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/AdminRouter.tsx packages/client/src/admin/__tests__/AdminRouter.test.tsx
git commit -m "feat: thread onLogout prop through AdminRouter to HubPanel"
```

---

### Task 4: AdminShell — add `handleLogout` and wire to AdminRouter (TDD)

**Files:**
- Modify: `packages/client/src/admin/AdminShell.tsx`
- Test: `packages/client/src/admin/__tests__/AdminShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `packages/client/src/admin/__tests__/AdminShell.test.tsx`.

First, add `disconnect: vi.fn()` to `mockSocket` (around line 7):

```tsx
const mockSocket = {
  on: vi.fn((event: string, handler: EventHandler) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(handler);
  }),
  off: vi.fn((event: string, handler: EventHandler) => {
    listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
  }),
  disconnect: vi.fn(),
};
```

Next, update the AdminRouter mock (around line 25) to expose a logout button:

```tsx
vi.mock('../AdminRouter.tsx', () => ({
  AdminRouter: ({ onLogout }: any) => (
    <div>
      admin-router
      <button onClick={onLogout}>admin-logout</button>
    </div>
  ),
}));
```

Then add this new test at the end of the `describe` block:

```tsx
it('clears session and shows login form when logout is triggered', async () => {
  localStorage.setItem('poke_admin_session', JSON.stringify({
    token: 'my-token',
    expiresAt: Date.now() + 60_000,
  }));
  render(<AdminShell />);
  await act(async () => { emit('admin:authenticated'); });
  expect(screen.getByText('admin-router')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /admin-logout/i }));
  expect(localStorage.getItem('poke_admin_session')).toBeNull();
  expect(mockSocket.disconnect).toHaveBeenCalled();
  expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/client && npx vitest run src/admin/__tests__/AdminShell.test.tsx
```

Expected: new test FAILS (`onLogout` is not a function / button not found).

- [ ] **Step 3: Implement AdminShell changes**

In `packages/client/src/admin/AdminShell.tsx`, add `handleLogout` and update the authenticated render line.

Add after `handleConnect` (around line 75), before the render:

```tsx
function handleLogout() {
  localStorage.removeItem(SESSION_KEY);
  setAuthenticated(false);
  getSocket().disconnect();
}
```

Change line 77 from:
```tsx
if (authenticated) return <AdminRouter />;
```
to:
```tsx
if (authenticated) return <AdminRouter onLogout={handleLogout} />;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && npx vitest run src/admin/__tests__/AdminShell.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full client test suite**

```bash
cd packages/client && npx vitest run
```

Expected: all tests PASS with no regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/AdminShell.tsx packages/client/src/admin/__tests__/AdminShell.test.tsx
git commit -m "feat: add handleLogout to AdminShell; wire to AdminRouter"
```

---

### Task 5: Mark tech debt Complete

**Files:**
- Modify: `docs/tech-debt/admin/no-admin-logout.md`

- [ ] **Step 1: Update State field**

Change line 3 from:
```
InProgress
```
to:
```
Complete
```

- [ ] **Step 2: Commit**

```bash
git add docs/tech-debt/admin/no-admin-logout.md
git commit -m "docs: mark admin-logout tech debt Complete"
```
