# Admin Registry Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the admin UI with a hub landing page, localStorage session persistence, NPC/Player registry CRUD (list + full editor), and an improved Pokémon search dropdown with keyboard navigation and species summary.

**Architecture:** `AdminShell` handles auth and reads/writes a `poke_admin_session` localStorage key with an 8-hour TTL; on valid session it skips the login form and renders `AdminRouter`. `AdminRouter` owns `mode` and `activeBattle` state, routing to `HubPanel`, `SetupPanel`, `RegistryPanel`, or `ControlPanel`. `RegistryPanel` runs a list↔editor state machine; `ProfileEditor` (shared for NPC/Player via a `type` prop) wraps the existing `TeamBuilder`, which gains a `PokemonSearchDropdown` with keyboard nav and a species summary strip.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, jsdom, Socket.io-client, uuid

---

## File Map

**Create:**
- `packages/client/src/admin/pokemonTypeColors.ts` — shared type→color map used by search dropdown and species summary
- `packages/client/src/admin/HubPanel.tsx` — landing page with two action tiles
- `packages/client/src/admin/AdminRouter.tsx` — owns `mode` + `activeBattle`, routes to panels
- `packages/client/src/admin/PokemonSearchDropdown.tsx` — searchable dropdown with keyboard nav
- `packages/client/src/admin/RegistryPanel.tsx` — NPC/Player list view + state machine
- `packages/client/src/admin/ProfileEditor.tsx` — shared NPC/Player editor (name + TeamBuilder)
- `packages/client/src/admin/__tests__/HubPanel.test.tsx`
- `packages/client/src/admin/__tests__/AdminRouter.test.tsx`
- `packages/client/src/admin/__tests__/AdminShell.test.tsx`
- `packages/client/src/admin/__tests__/SetupPanel.test.tsx`
- `packages/client/src/admin/__tests__/PokemonSearchDropdown.test.tsx`
- `packages/client/src/admin/__tests__/RegistryPanel.test.tsx`
- `packages/client/src/admin/__tests__/ProfileEditor.test.tsx`

**Modify:**
- `packages/client/src/admin/AdminShell.tsx` — add session check/save, render `<AdminRouter />` when authenticated; remove own battle/routing state
- `packages/client/src/admin/SetupPanel.tsx` — add `onBack: () => void` prop + "← HUB" button
- `packages/client/src/admin/TeamBuilder.tsx` — replace inline search with `PokemonSearchDropdown`, add species summary strip, add `slotSpecies` state

---

## Task 1: pokemonTypeColors constant

**Files:**
- Create: `packages/client/src/admin/pokemonTypeColors.ts`

- [ ] **Step 1: Create the file**

```ts
export const TYPE_COLORS: Record<string, string> = {
  Normal: '#A8A77A', Fire: '#EE8130', Water: '#6390F0', Electric: '#F7D02C',
  Grass: '#7AC74C', Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1',
  Ground: '#E2BF65', Flying: '#A98FF3', Psychic: '#F95587', Bug: '#A6B91A',
  Rock: '#B6A136', Ghost: '#735797', Dragon: '#6F35FC', Dark: '#705746',
  Steel: '#B7B7CE', Fairy: '#D685AD',
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/admin/pokemonTypeColors.ts
git commit -m "feat(admin): add Pokémon type color constants"
```

---

## Task 2: HubPanel component

**Files:**
- Create: `packages/client/src/admin/HubPanel.tsx`
- Create: `packages/client/src/admin/__tests__/HubPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/HubPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HubPanel } from '../HubPanel.js';

describe('HubPanel', () => {
  it('calls onSetup when Battle Setup tile is clicked', () => {
    const onSetup = vi.fn();
    render(<HubPanel onSetup={onSetup} onRegistry={vi.fn()} />);
    fireEvent.click(screen.getByText(/battle setup/i));
    expect(onSetup).toHaveBeenCalled();
  });

  it('calls onRegistry when Registry tile is clicked', () => {
    const onRegistry = vi.fn();
    render(<HubPanel onSetup={vi.fn()} onRegistry={onRegistry} />);
    fireEvent.click(screen.getByText(/^registry$/i));
    expect(onRegistry).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test HubPanel
```
Expected: FAIL — `HubPanel` not found.

- [ ] **Step 3: Implement HubPanel**

```tsx
// packages/client/src/admin/HubPanel.tsx
interface HubPanelProps {
  onSetup: () => void;
  onRegistry: () => void;
}

export function HubPanel({ onSetup, onRegistry }: HubPanelProps) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <h1 style={{ fontSize: 32, letterSpacing: 6, color: '#e74c3c' }}>ADMIN</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        <button onClick={onSetup} style={tile('#e74c3c')}>
          <div style={{ fontSize: 32 }}>⚔</div>
          <div style={{ color: '#e74c3c', letterSpacing: 2, fontSize: 13 }}>BATTLE SETUP</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Start a new battle</div>
        </button>
        <button onClick={onRegistry} style={tile('#27ae60')}>
          <div style={{ fontSize: 32 }}>📋</div>
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
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test HubPanel
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/HubPanel.tsx packages/client/src/admin/__tests__/HubPanel.test.tsx
git commit -m "feat(admin): add HubPanel landing page with Battle Setup and Registry tiles"
```

---

## Task 3: SetupPanel — add onBack prop

**Files:**
- Modify: `packages/client/src/admin/SetupPanel.tsx`
- Create: `packages/client/src/admin/__tests__/SetupPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/SetupPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() })),
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));

import { SetupPanel } from '../SetupPanel.js';

describe('SetupPanel', () => {
  it('renders a back-to-hub button and calls onBack when clicked', () => {
    const onBack = vi.fn();
    render(<SetupPanel onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /hub/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test SetupPanel
```
Expected: FAIL — `SetupPanel` accepts no props / button not found.

- [ ] **Step 3: Add onBack to SetupPanel**

At the top of `packages/client/src/admin/SetupPanel.tsx`, add the interface and update the signature:

```tsx
// Add after imports, before the Step type
interface SetupPanelProps {
  onBack: () => void;
}

// Change signature from:
export function SetupPanel() {
// To:
export function SetupPanel({ onBack }: SetupPanelProps) {
```

In the `if (step === 'started')` early-return block, add a back button:

```tsx
if (step === 'started') {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ color: '#27ae60', fontSize: 24 }}>Battle Started!</h2>
      <p style={{ color: '#aaa', marginTop: 12 }}>Waiting for players to join the battle room...</p>
      <button onClick={onBack} style={{ marginTop: 24, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>← HUB</button>
    </div>
  );
}
```

In the main return's header `<div>`, replace:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
  <h1 style={{ color: '#e74c3c', letterSpacing: 4 }}>BATTLE SETUP</h1>
  <span style={{ color: '#aaa', fontSize: 12 }}>{stepTitles[step as keyof typeof stepTitles]}</span>
</div>
```

With:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
  <button onClick={onBack} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>← HUB</button>
  <h1 style={{ color: '#e74c3c', letterSpacing: 4 }}>BATTLE SETUP</h1>
  <span style={{ color: '#aaa', fontSize: 12 }}>{stepTitles[step as keyof typeof stepTitles]}</span>
</div>
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test SetupPanel
```
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/SetupPanel.tsx packages/client/src/admin/__tests__/SetupPanel.test.tsx
git commit -m "feat(admin): add onBack prop to SetupPanel for hub navigation"
```

---

## Task 4: AdminRouter

**Files:**
- Create: `packages/client/src/admin/AdminRouter.tsx`
- Create: `packages/client/src/admin/__tests__/AdminRouter.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/AdminRouter.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('./HubPanel.js', () => ({
  HubPanel: ({ onSetup, onRegistry }: any) => (
    <div>
      <button onClick={onSetup}>hub-setup</button>
      <button onClick={onRegistry}>hub-registry</button>
    </div>
  ),
}));
vi.mock('./SetupPanel.js', () => ({
  SetupPanel: ({ onBack }: any) => <div>setup-panel<button onClick={onBack}>setup-back</button></div>,
}));
vi.mock('./RegistryPanel.js', () => ({
  RegistryPanel: ({ onBack }: any) => <div>registry-panel<button onClick={onBack}>reg-back</button></div>,
}));
vi.mock('./ControlPanel.js', () => ({
  ControlPanel: ({ battleId }: any) => <div>control-panel-{battleId}</div>,
}));

import { getSocket } from '../socket.js';
import { AdminRouter } from './AdminRouter.js';

let battleStartHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'battle:start') battleStartHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  battleStartHandler = null;
  vi.clearAllMocks();
});

describe('AdminRouter', () => {
  it('renders HubPanel by default', () => {
    render(<AdminRouter />);
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders SetupPanel when Battle Setup tile clicked', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-setup'));
    expect(screen.getByText('setup-panel')).toBeTruthy();
  });

  it('renders RegistryPanel when Registry tile clicked', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-registry'));
    expect(screen.getByText('registry-panel')).toBeTruthy();
  });

  it('returns to HubPanel from SetupPanel via onBack', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-setup'));
    fireEvent.click(screen.getByText('setup-back'));
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders ControlPanel when battle:start fires', () => {
    render(<AdminRouter />);
    act(() => { battleStartHandler?.({ state: { battleId: 'b1' } }); });
    expect(screen.getByText('control-panel-b1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test AdminRouter
```
Expected: FAIL — `AdminRouter` not found.

- [ ] **Step 3: Implement AdminRouter**

```tsx
// packages/client/src/admin/AdminRouter.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { HubPanel } from './HubPanel.js';
import { SetupPanel } from './SetupPanel.js';
import { RegistryPanel } from './RegistryPanel.js';
import { ControlPanel } from './ControlPanel.js';

type Mode = 'setup' | 'registry' | null;

export function AdminRouter() {
  const [mode, setMode] = useState<Mode>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onBattleStart = (payload: { state: { battleId: string } }) => {
      setActiveBattle(payload.state.battleId);
    };
    socket.on('battle:start', onBattleStart);
    return () => { socket.off('battle:start', onBattleStart); };
  }, []);

  if (activeBattle) return <ControlPanel battleId={activeBattle} />;
  if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} />;
  if (mode === 'registry') return <RegistryPanel onBack={() => setMode(null)} />;
  return <HubPanel onSetup={() => setMode('setup')} onRegistry={() => setMode('registry')} />;
}
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test AdminRouter
```
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/AdminRouter.tsx packages/client/src/admin/__tests__/AdminRouter.test.tsx
git commit -m "feat(admin): add AdminRouter — owns mode/activeBattle state and routes to panels"
```

---

## Task 5: AdminShell — session management

**Files:**
- Modify: `packages/client/src/admin/AdminShell.tsx`
- Create: `packages/client/src/admin/__tests__/AdminShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/AdminShell.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../socket.js', () => ({ connectAsAdmin: vi.fn() }));
vi.mock('./AdminRouter.js', () => ({ AdminRouter: () => <div>admin-router</div> }));

import { connectAsAdmin } from '../socket.js';
import { AdminShell } from './AdminShell.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AdminShell', () => {
  it('shows login form when no session in localStorage', () => {
    render(<AdminShell />);
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });

  it('auto-connects and renders AdminRouter when valid session exists', () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'stored-token',
      expiresAt: Date.now() + 60_000,
    }));
    render(<AdminShell />);
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('stored-token');
    expect(screen.getByText('admin-router')).toBeTruthy();
  });

  it('shows login form when session is expired', () => {
    localStorage.setItem('poke_admin_session', JSON.stringify({
      token: 'old-token',
      expiresAt: Date.now() - 1000,
    }));
    render(<AdminShell />);
    expect(screen.getByPlaceholderText(/admin token/i)).toBeTruthy();
  });

  it('saves session and renders AdminRouter on successful login', () => {
    render(<AdminShell />);
    fireEvent.change(screen.getByPlaceholderText(/admin token/i), { target: { value: 'my-token' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(vi.mocked(connectAsAdmin)).toHaveBeenCalledWith('my-token');
    const stored = JSON.parse(localStorage.getItem('poke_admin_session')!);
    expect(stored.token).toBe('my-token');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
    expect(screen.getByText('admin-router')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test AdminShell
```
Expected: FAIL — session logic not present.

- [ ] **Step 3: Rewrite AdminShell**

Replace the entire contents of `packages/client/src/admin/AdminShell.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { connectAsAdmin } from '../socket.js';
import { AdminRouter } from './AdminRouter.js';

const SESSION_KEY = 'poke_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface AdminSession { token: string; expiresAt: number }

function loadSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    return s.expiresAt > Date.now() ? s : null;
  } catch { return null; }
}

function saveSession(token: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + SESSION_TTL_MS }));
}

export function AdminShell() {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      connectAsAdmin(session.token);
      setAuthenticated(true);
    }
  }, []);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    connectAsAdmin(token.trim());
    saveSession(token.trim());
    setAuthenticated(true);
  }

  if (authenticated) return <AdminRouter />;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>ADMIN</h1>
      <form onSubmit={handleConnect} style={styles.box}>
        <label style={styles.label}>Admin token</label>
        <input
          type="password"
          style={styles.input}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter admin token"
          autoFocus
        />
        <button type="submit" style={styles.button} disabled={!token.trim()}>
          CONNECT AS ADMIN
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 36, letterSpacing: 6, color: '#e74c3c' },
  box: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 320 },
  label: { color: '#aaa', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const },
  input: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '8px 12px', fontSize: 16, borderRadius: 4, fontFamily: 'inherit' },
  button: { background: '#c0392b', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
};
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test AdminShell
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck**

```
pnpm --filter @poke-fighter/client typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/AdminShell.tsx packages/client/src/admin/__tests__/AdminShell.test.tsx
git commit -m "feat(admin): add localStorage session management to AdminShell (8hr TTL)"
```

---

## Task 6: PokemonSearchDropdown

**Files:**
- Create: `packages/client/src/admin/PokemonSearchDropdown.tsx`
- Create: `packages/client/src/admin/__tests__/PokemonSearchDropdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/PokemonSearchDropdown.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { PokemonSearchDropdown } from '../PokemonSearchDropdown.js';
import type { PokemonSpecies } from '@poke-fighter/shared';

let dataResultsHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'data:results') dataResultsHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  dataResultsHandler = null;
  vi.clearAllMocks();
});

const psyduck: PokemonSpecies = {
  id: 54, name: 'psyduck', displayName: 'Psyduck', types: ['Water'],
  baseStats: { hp: 50, atk: 52, def: 48, spa: 65, spd: 50, spe: 55 },
  abilities: { 0: 'Damp', 1: 'Cloud Nine', H: 'Swift Swim' },
  baseExpYield: 64, expGrowth: 'MediumFast', learnset: [], evolutionStage: 1,
};
const golduck: PokemonSpecies = { ...psyduck, id: 55, name: 'golduck', displayName: 'Golduck' };

describe('PokemonSearchDropdown', () => {
  it('emits data:query when 2+ characters are typed', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ type: 'data:query' }));
  });

  it('does not emit when fewer than 2 characters typed', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'p' } });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('shows results from data:results event', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    expect(screen.getByText('Psyduck')).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
  });

  it('calls onSelect and clears input when a result is clicked', () => {
    const onSelect = vi.fn();
    render(<PokemonSearchDropdown onSelect={onSelect} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    fireEvent.click(screen.getByText('Psyduck'));
    expect(onSelect).toHaveBeenCalledWith(psyduck);
    expect(screen.queryByText('Psyduck')).toBeNull();
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onSelect = vi.fn();
    render(<PokemonSearchDropdown onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck, golduck] }); });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(golduck);
  });

  it('closes dropdown on Escape', () => {
    render(<PokemonSearchDropdown onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'ps' } });
    act(() => { dataResultsHandler?.({ resource: 'pokemon', results: [psyduck] }); });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Psyduck')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test PokemonSearchDropdown
```
Expected: FAIL — `PokemonSearchDropdown` not found.

- [ ] **Step 3: Implement PokemonSearchDropdown**

```tsx
// packages/client/src/admin/PokemonSearchDropdown.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { PokemonSpecies } from '@poke-fighter/shared';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  onSelect: (species: PokemonSpecies) => void;
}

export function PokemonSearchDropdown({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonSpecies[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      if (payload.resource === 'pokemon') { setResults(payload.results); setHighlighted(0); }
    };
    socket.on('data:results' as any, handler);
    return () => { socket.off('data:results' as any, handler); };
  }, []);

  function handleChange(q: string) {
    setQuery(q);
    if (q.length >= 2) {
      getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
    } else {
      setResults([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlighted]); }
    else if (e.key === 'Escape') { setResults([]); setQuery(''); }
  }

  function pick(species: PokemonSpecies) {
    onSelect(species);
    setQuery('');
    setResults([]);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search Pokémon by name or dex #..."
        style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'inherit', width: '100%', fontSize: 13, boxSizing: 'border-box' }}
      />
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 180, overflowY: 'auto', zIndex: 10 }}>
          {results.map((s, i) => (
            <div
              key={s.id}
              onClick={() => pick(s)}
              style={{ padding: '6px 10px', cursor: 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', borderBottom: '1px solid #222' }}
            >
              <span style={{ color: '#888', minWidth: 36 }}>#{s.id}</span>
              <span>{s.displayName}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {s.types.map((t) => (
                  <span key={t} style={{ background: TYPE_COLORS[t] ?? '#555', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{t}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test PokemonSearchDropdown
```
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/PokemonSearchDropdown.tsx packages/client/src/admin/__tests__/PokemonSearchDropdown.test.tsx
git commit -m "feat(admin): add PokemonSearchDropdown with keyboard navigation and type badges"
```

---

## Task 7: TeamBuilder — integrate PokemonSearchDropdown + species summary

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`

- [ ] **Step 1: Run existing tests to confirm they currently pass**

```
pnpm --filter @poke-fighter/client test
```
Note the passing count as a baseline.

- [ ] **Step 2: Replace TeamBuilder.tsx entirely**

```tsx
// packages/client/src/admin/TeamBuilder.tsx
import { useState } from 'react';
import type { PokemonSpecies, PokemonSet } from '@poke-fighter/shared';
import { PokemonSearchDropdown } from './PokemonSearchDropdown.js';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
}

export function TeamBuilder({ onTeamSaved, initialTeam = [] }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [slotSpecies, setSlotSpecies] = useState<(PokemonSpecies | null)[]>(Array(6).fill(null));
  const [selectedSlot, setSelectedSlot] = useState(0);

  function pickPokemon(species: PokemonSpecies) {
    const updated = [...team];
    updated[selectedSlot] = {
      speciesId: species.id,
      level: 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: ['', '', '', ''] as [string, string, string, string],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'hardy',
    };
    setTeam(updated);
    const updatedSpecies = [...slotSpecies];
    updatedSpecies[selectedSlot] = species;
    setSlotSpecies(updatedSpecies);
  }

  function updateSlotField(index: number, field: keyof PokemonSet, value: unknown) {
    const updated = [...team];
    updated[index] = { ...updated[index], [field]: value };
    setTeam(updated);
  }

  const isValid = team.some((s) => s.speciesId) && team.every((s) => !s.speciesId || s.moves?.every(Boolean));
  const currentSpecies = slotSpecies[selectedSlot];

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      {/* Slot tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
            style={{ background: selectedSlot === i ? '#2980b9' : '#1a1a2e', border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            {team[i]?.speciesId ? `#${team[i]!.speciesId}` : `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Search */}
      <PokemonSearchDropdown onSelect={pickPokemon} />

      {/* Species summary — only shown after picking via dropdown in this session */}
      {currentSpecies && (
        <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{currentSpecies.displayName}</span>
          <span style={{ color: '#888' }}>#{currentSpecies.id}</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {currentSpecies.types.map((t) => (
              <span key={t} style={{ background: TYPE_COLORS[t] ?? '#555', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{t}</span>
            ))}
          </span>
          <span style={{ color: '#aaa', marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => (
              <span key={stat}>
                <span style={{ color: '#666', fontSize: 9 }}>{stat.toUpperCase()} </span>
                <span style={{ color: '#ccc' }}>{currentSpecies.baseStats[stat]}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Slot editor */}
      {team[selectedSlot]?.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#aaa', fontSize: 11 }}>Species #{team[selectedSlot]!.speciesId} — slot {selectedSlot + 1}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Level</label>
            <input type="number" min={1} max={100} value={team[selectedSlot]?.level ?? 50}
              onChange={(e) => updateSlotField(selectedSlot, 'level', Number(e.target.value))}
              style={{ ...inp, width: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Nature</label>
            <input value={team[selectedSlot]?.nature ?? 'hardy'}
              onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
              style={{ ...inp, width: 100 }} />
          </div>
          <div>
            <label style={lbl}>Moves (IDs)</label>
            {[0, 1, 2, 3].map((mi) => (
              <input key={mi} placeholder={`Move ${mi + 1} id`}
                value={(team[selectedSlot]?.moves ?? [])[mi] ?? ''}
                onChange={(e) => {
                  const moves = [...((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])];
                  moves[mi] = e.target.value;
                  updateSlotField(selectedSlot, 'moves', moves as [string, string, string, string]);
                }}
                style={{ ...inp, display: 'block', marginBottom: 4, width: '100%' }} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onTeamSaved(team.filter((s): s is PokemonSet => !!s.speciesId))}
        disabled={!isValid}
        style={{ background: isValid ? '#27ae60' : '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 4, cursor: isValid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 13, letterSpacing: 1 }}
      >
        SAVE TEAM ({team.filter((s) => s.speciesId).length}/6)
      </button>
    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 50 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
```

- [ ] **Step 3: Run all tests to verify no regression**

```
pnpm --filter @poke-fighter/client test
```
Expected: same pass count as baseline (or more).

- [ ] **Step 4: Typecheck**

```
pnpm --filter @poke-fighter/client typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/TeamBuilder.tsx
git commit -m "feat(admin): integrate PokemonSearchDropdown and species summary strip into TeamBuilder"
```

---

## Task 8: RegistryPanel — list view

**Files:**
- Create: `packages/client/src/admin/RegistryPanel.tsx`
- Create: `packages/client/src/admin/__tests__/RegistryPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/RegistryPanel.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../ProfileEditor.js', () => ({
  ProfileEditor: ({ type, onBack }: any) => (
    <div>editor-{type}<button onClick={onBack}>editor-back</button></div>
  ),
}));

import { getSocket } from '../../socket.js';
import { RegistryPanel } from '../RegistryPanel.js';

let registryDataHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'registry:data') registryDataHandler = handler;
  }),
  off: vi.fn(),
};

const mockNpc = { profileId: 'npc-1', name: 'Gym Leader Misty', team: { templateId: 't1', name: "Misty's Team", pokemon: [{ speciesId: 54 }, { speciesId: 120 }], createdAt: '2024-01-01' }, createdAt: '2024-01-01' };
const mockPlayer = { profileId: 'player-1', displayName: 'Ash Ketchum', defaultTeam: { templateId: 't2', name: "Ash's Team", pokemon: [{ speciesId: 25 }], createdAt: '2024-01-01' }, createdAt: '2024-01-01' };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  registryDataHandler = null;
  vi.clearAllMocks();
});

describe('RegistryPanel', () => {
  it('emits registry:list for both npcs and players on mount', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ data: { resource: 'npcs' } }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ data: { resource: 'players' } }));
  });

  it('shows NPC tab by default', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    expect(screen.getByText('NPCS')).toBeTruthy();
  });

  it('renders NPC rows from registry:data event', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    expect(screen.getByText('Gym Leader Misty')).toBeTruthy();
    expect(screen.getByText('2 Pokémon')).toBeTruthy();
  });

  it('switches to Players tab and shows player rows', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'players', data: [mockPlayer] }); });
    fireEvent.click(screen.getByText('PLAYERS'));
    expect(screen.getByText('Ash Ketchum')).toBeTruthy();
    expect(screen.getByText('1 Pokémon')).toBeTruthy();
  });

  it('emits registry:delete-npc when Delete clicked', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    fireEvent.click(screen.getByText('DEL'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ type: 'registry:delete-npc', data: { profileId: 'npc-1' } }));
  });

  it('shows editor when Edit clicked and returns to list on back', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    fireEvent.click(screen.getByText('EDIT'));
    expect(screen.getByText(/editor-npc/)).toBeTruthy();
    fireEvent.click(screen.getByText('editor-back'));
    expect(screen.getByText('Gym Leader Misty')).toBeTruthy();
  });

  it('shows editor for new NPC when + NEW clicked', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    fireEvent.click(screen.getByText(/new npc/i));
    expect(screen.getByText(/editor-npc/)).toBeTruthy();
  });

  it('calls onBack when ← HUB clicked', () => {
    const onBack = vi.fn();
    render(<RegistryPanel onBack={onBack} />);
    fireEvent.click(screen.getByText(/hub/i));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test RegistryPanel
```
Expected: FAIL — `RegistryPanel` not found.

- [ ] **Step 3: Implement RegistryPanel**

```tsx
// packages/client/src/admin/RegistryPanel.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { ProfileEditor } from './ProfileEditor.js';
import type { NpcProfile, PlayerProfile } from '@poke-fighter/shared';

type ActiveTab = 'npcs' | 'players';
type View =
  | { kind: 'list' }
  | { kind: 'editor'; type: 'npc'; profile: NpcProfile | null }
  | { kind: 'editor'; type: 'player'; profile: PlayerProfile | null };

interface Props { onBack: () => void }

export function RegistryPanel({ onBack }: Props) {
  const [npcs, setNpcs] = useState<NpcProfile[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('npcs');
  const [view, setView] = useState<View>({ kind: 'list' });

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } } as any);
    const handler = (payload: { resource: string; data: unknown[] }) => {
      if (payload.resource === 'npcs') setNpcs(payload.data as NpcProfile[]);
      if (payload.resource === 'players') setPlayers(payload.data as PlayerProfile[]);
    };
    socket.on('registry:data' as any, handler);
    return () => { socket.off('registry:data' as any, handler); };
  }, []);

  if (view.kind === 'editor') {
    return <ProfileEditor type={view.type} profile={view.profile} onBack={() => setView({ kind: 'list' })} />;
  }

  const items = activeTab === 'npcs' ? npcs : players;
  const getName = (item: NpcProfile | PlayerProfile) => 'name' in item ? item.name : item.displayName;
  const getPokemonCount = (item: NpcProfile | PlayerProfile) =>
    'team' in item ? item.team.pokemon.length : (item.defaultTeam?.pokemon.length ?? 0);

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← HUB</button>
          <h1 style={{ color: '#27ae60', letterSpacing: 4 }}>REGISTRY</h1>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: 16 }}>
          {(['npcs', 'players'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 20px', background: activeTab === tab ? '#27ae60' : '#1a1a2e', color: activeTab === tab ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 2 }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#aaa', fontSize: 12 }}>{items.length} {activeTab === 'npcs' ? 'NPCs' : 'Players'} saved</span>
          <button
            onClick={() => setView({ kind: 'editor', type: activeTab === 'npcs' ? 'npc' : 'player', profile: null })}
            style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
          >
            + NEW {activeTab === 'npcs' ? 'NPC' : 'PLAYER'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <div key={item.profileId} style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#fff', flex: 1, fontSize: 13 }}>{getName(item)}</span>
              <span style={{ color: '#f0c040', fontSize: 11, background: '#1a1a00', padding: '2px 8px', borderRadius: 3 }}>
                {getPokemonCount(item)} Pokémon
              </span>
              <button onClick={() => setView({ kind: 'editor', type: activeTab === 'npcs' ? 'npc' : 'player', profile: item as any })} style={{ ...actionBtn, background: '#2980b9' }}>EDIT</button>
              <button
                onClick={() => getSocket().emit('admin:action', { type: activeTab === 'npcs' ? 'registry:delete-npc' : 'registry:delete-player', data: { profileId: item.profileId } } as any)}
                style={{ ...actionBtn, background: '#c0392b' }}
              >DEL</button>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
              No {activeTab === 'npcs' ? 'NPCs' : 'Players'} yet. Click + NEW to add one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 };
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test RegistryPanel
```
Expected: PASS — 7 tests. (ProfileEditor is mocked, so it doesn't need to exist yet.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/RegistryPanel.tsx packages/client/src/admin/__tests__/RegistryPanel.test.tsx
git commit -m "feat(admin): add RegistryPanel with NPC/Player list, tabs, delete, and editor navigation"
```

---

## Task 9: ProfileEditor

**Files:**
- Create: `packages/client/src/admin/ProfileEditor.tsx`
- Create: `packages/client/src/admin/__tests__/ProfileEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/admin/__tests__/ProfileEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'generated-uuid') }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, initialTeam }: any) => (
    <div>
      <span>team-builder-initial-{initialTeam?.length ?? 0}</span>
      <button onClick={() => onTeamSaved([
        { speciesId: 25, level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' },
      ])}>save-team</button>
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { ProfileEditor } from '../ProfileEditor.js';
import type { NpcProfile, PlayerProfile } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const existingNpc: NpcProfile = {
  profileId: 'npc-1', name: 'Gym Leader Misty',
  team: { templateId: 't1', name: "Misty's Team", pokemon: [{ speciesId: 54, level: 50, ability: 'Damp', moves: ['surf', 'psychic', 'icebeam', 'encore'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'modest' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};

const existingPlayer: PlayerProfile = {
  profileId: 'player-1', displayName: 'Ash Ketchum',
  defaultTeam: { templateId: 't2', name: "Ash's Team", pokemon: [{ speciesId: 25, level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};

describe('ProfileEditor — NPC', () => {
  it('shows EDIT NPC title and pre-fills name for existing profile', () => {
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={vi.fn()} />);
    expect(screen.getByText(/edit npc/i)).toBeTruthy();
    expect(screen.getByDisplayValue('Gym Leader Misty')).toBeTruthy();
  });

  it('shows NEW NPC title when profile is null', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    expect(screen.getByText(/new npc/i)).toBeTruthy();
  });

  it('SAVE is disabled when name is empty', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('save-team'));
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('SAVE is disabled when team is empty (no team save triggered)', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. gym/i), { target: { value: 'Test NPC' } });
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('emits registry:save-npc with correct profile on SAVE', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. gym/i), { target: { value: 'Elite Four Lance' } });
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-npc',
      data: expect.objectContaining({
        profile: expect.objectContaining({ name: 'Elite Four Lance', profileId: 'generated-uuid' }),
      }),
    }));
  });

  it('preserves profileId and createdAt when editing existing NPC', () => {
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      data: expect.objectContaining({
        profile: expect.objectContaining({ profileId: 'npc-1', createdAt: '2024-01-01' }),
      }),
    }));
  });

  it('calls onBack when DISCARD clicked', () => {
    const onBack = vi.fn();
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('ProfileEditor — Player', () => {
  it('shows DISPLAY NAME label and emits registry:save-player on save', () => {
    render(<ProfileEditor type="player" profile={null} onBack={vi.fn()} />);
    expect(screen.getByText(/display name/i)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/ash/i), { target: { value: 'Gary Oak' } });
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-player',
      data: expect.objectContaining({
        profile: expect.objectContaining({ displayName: 'Gary Oak' }),
      }),
    }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test ProfileEditor
```
Expected: FAIL — `ProfileEditor` not found.

- [ ] **Step 3: Implement ProfileEditor**

```tsx
// packages/client/src/admin/ProfileEditor.tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamBuilder } from './TeamBuilder.js';
import type { NpcProfile, PlayerProfile, PokemonSet } from '@poke-fighter/shared';

interface Props {
  type: 'npc' | 'player';
  profile: NpcProfile | PlayerProfile | null;
  onBack: () => void;
}

export function ProfileEditor({ type, profile, onBack }: Props) {
  const existingName = profile
    ? ('name' in profile ? profile.name : profile.displayName)
    : '';
  const existingTeam: PokemonSet[] = profile
    ? ('team' in profile ? profile.team.pokemon : (profile.defaultTeam?.pokemon ?? []))
    : [];

  const [name, setName] = useState(existingName);
  const [team, setTeam] = useState<PokemonSet[]>(existingTeam);

  const isNew = profile === null;
  const isValid = name.trim().length > 0 && team.length > 0;
  const typeLabel = type === 'npc' ? 'NPC' : 'PLAYER';
  const nameLabel = type === 'npc' ? 'NAME' : 'DISPLAY NAME';
  const namePlaceholder = type === 'npc' ? 'e.g. Gym Leader Misty' : 'e.g. Ash Ketchum';

  function handleSave() {
    const socket = getSocket();
    const now = new Date().toISOString();
    if (type === 'npc') {
      const npcProfile: NpcProfile = {
        profileId: profile?.profileId ?? uuidv4(),
        name: name.trim(),
        team: { templateId: uuidv4(), name: `${name.trim()}'s Team`, pokemon: team, createdAt: now },
        createdAt: profile?.createdAt ?? now,
      };
      socket.emit('admin:action', { type: 'registry:save-npc', data: { profile: npcProfile } } as any);
    } else {
      const playerProfile: PlayerProfile = {
        profileId: profile?.profileId ?? uuidv4(),
        displayName: name.trim(),
        defaultTeam: { templateId: uuidv4(), name: `${name.trim()}'s Team`, pokemon: team, createdAt: now },
        createdAt: profile?.createdAt ?? now,
      };
      socket.emit('admin:action', { type: 'registry:save-player', data: { profile: playerProfile } } as any);
    }
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← Back to {type === 'npc' ? 'NPCs' : 'Players'}</button>
          <span style={{ color: '#f0c040', fontSize: 14, letterSpacing: 2 }}>{isNew ? 'NEW' : 'EDIT'} {typeLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...actionBtn, background: '#c0392b' }}>DISCARD</button>
            <button onClick={handleSave} disabled={!isValid} style={{ ...actionBtn, background: isValid ? '#27ae60' : '#555', cursor: isValid ? 'pointer' : 'not-allowed' }}>SAVE</button>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>{nameLabel}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4 }}>
          <TeamBuilder initialTeam={existingTeam} onTeamSaved={setTeam} />
        </div>

        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0 ? 'Name is required.' : 'Add at least 1 Pokémon with all 4 moves filled.'}
          </div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test ProfileEditor
```
Expected: PASS — 8 tests.

- [ ] **Step 5: Run all tests**

```
pnpm --filter @poke-fighter/client test
```
Expected: all tests pass.

- [ ] **Step 6: Typecheck**

```
pnpm --filter @poke-fighter/client typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/admin/ProfileEditor.tsx packages/client/src/admin/__tests__/ProfileEditor.test.tsx
git commit -m "feat(admin): add ProfileEditor — shared NPC/Player editor with validation and save"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered by |
|---|---|
| Hub landing page with two tiles | Task 2 (HubPanel) |
| AdminRouter owning mode + activeBattle state | Task 4 (AdminRouter) |
| SetupPanel gets onBack prop | Task 3 |
| localStorage session, 8hr TTL | Task 5 (AdminShell) |
| Auto-connect if valid session, skip login | Task 5 |
| RegistryPanel — tabs (NPCs / Players) | Task 8 |
| List view with name, Pokémon count, Edit, Delete | Task 8 |
| Full editor screen (replaces list) | Task 9 (ProfileEditor) |
| Name field, required non-empty | Task 9 |
| TeamBuilder integration, ≥1 Pokémon required | Task 9 |
| SAVE emits registry:save-npc / save-player | Task 9 |
| Delete emits registry:delete-npc / delete-player | Task 8 |
| PokemonSearchDropdown replaces inline search | Task 6, 7 |
| Keyboard nav (↑/↓/Enter/Escape) | Task 6 |
| Type badges with type colours | Task 1, 6 |
| Species summary strip (name, types, base stats) | Task 7 |
| No server changes needed | Confirmed — all handlers exist in adminHandlers.ts |

**Placeholder scan:** No TBDs or TODOs found.

**Type consistency:** All types (NpcProfile, PlayerProfile, PokemonSet, PokemonSpecies) are imported from `@poke-fighter/shared` consistently across tasks. `onBack`, `onSetup`, `onRegistry` prop names are consistent between definition and usage. `registry:save-npc` / `registry:save-player` / `registry:delete-npc` / `registry:delete-player` match the existing `AdminActionPayload` union in `events.ts`.
