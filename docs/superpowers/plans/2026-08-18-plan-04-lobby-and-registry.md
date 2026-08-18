# Plan 04: Player Lobby UI + Registry (F2 + F3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Vite + React client, implement the player login and waiting room UI, and build the server-side JSON registry (player profiles, NPC profiles, team templates) with admin CRUD endpoints.

**Architecture:** Client package (`@poke-fighter/client`) is a Vite + React SPA. Socket.io client is a singleton module. React Router handles three top-level routes: `/` (player login), `/battle` (battle view), `/admin` (admin shell). Registry is persisted as JSON files on the server under `packages/server/data/registry/`.

**Tech Stack:** Vite 5, React 18, React Router 6, TypeScript, `socket.io-client`, `vitest` + `@testing-library/react` (client tests).

**Prerequisite:** Plans 01–03 complete (server running, shared types available).

---

## File Structure

```
packages/client/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── socket.ts                    # Socket.io client singleton
    ├── pages/
    │   ├── LobbyPage.tsx            # login form + waiting room
    │   ├── BattlePage.tsx           # placeholder for Plan 06
    │   └── AdminPage.tsx            # placeholder for Plan 05
    └── __tests__/
        └── LobbyPage.test.tsx

packages/server/src/
├── registry/
│   ├── RegistryStore.ts             # JSON file read/write
│   ├── registryHandlers.ts          # Socket.io admin events for CRUD
│   └── __tests__/
│       └── RegistryStore.test.ts
└── data/
    └── registry/                    # runtime JSON files (git-ignored)
        ├── players.json
        ├── npcs.json
        └── teams.json
```

---

## Task 1: Client Package Scaffold

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`

- [ ] **Step 1: Create packages/client/package.json**

```json
{
  "name": "@poke-fighter/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@poke-fighter/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create packages/client/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "outDir": "./dist",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/client/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 4: Create packages/client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Poke Fighter</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #1a1a2e; color: #fff; font-family: 'Courier New', monospace; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create packages/client/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 6: Create packages/client/src/App.tsx**

```tsx
import { Routes, Route } from 'react-router-dom';
import { LobbyPage } from './pages/LobbyPage.js';
import { BattlePage } from './pages/BattlePage.js';
import { AdminPage } from './pages/AdminPage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/battle" element={<BattlePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
```

- [ ] **Step 7: Create placeholder pages**

`packages/client/src/pages/BattlePage.tsx`:
```tsx
export function BattlePage() {
  return <div>Battle (Plan 06)</div>;
}
```

`packages/client/src/pages/AdminPage.tsx`:
```tsx
export function AdminPage() {
  return <div>Admin (Plan 05)</div>;
}
```

- [ ] **Step 8: Install and verify build**

```bash
pnpm install
pnpm --filter @poke-fighter/client typecheck
```

Expected: no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add packages/client/
git commit -m "feat(client): Vite + React client scaffold with routing"
```

---

## Task 2: Socket.io Client Singleton

**Files:**
- Create: `packages/client/src/socket.ts`

- [ ] **Step 1: Create packages/client/src/socket.ts**

```typescript
import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@poke-fighter/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: {}, // populated by connectAsPlayer or connectAsAdmin
    });
  }
  return socket;
}

export function connectAsPlayer(displayName: string): void {
  const s = getSocket();
  s.auth = {};
  s.connect();
  s.emit('player:join', { displayName });
}

export function connectAsAdmin(adminToken: string): void {
  const s = getSocket();
  s.auth = { token: adminToken };
  s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/socket.ts
git commit -m "feat(client): Socket.io client singleton with player and admin connect helpers"
```

---

## Task 3: Login & Waiting Room UI

**Files:**
- Create: `packages/client/src/pages/LobbyPage.tsx`
- Create: `packages/client/src/__tests__/LobbyPage.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/client/src/__tests__/LobbyPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LobbyPage } from '../pages/LobbyPage.js';

// Mock socket module
vi.mock('../socket.js', () => ({
  connectAsPlayer: vi.fn(),
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

describe('LobbyPage', () => {
  it('renders the login form', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/enter your name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /join/i })).toBeTruthy();
  });

  it('disables submit for empty name', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    const button = screen.getByRole('button', { name: /join/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables submit when name is typed', async () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/enter your name/i), { target: { value: 'Ash' } });
    const button = screen.getByRole('button', { name: /join/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: FAIL — `LobbyPage not found`

- [ ] **Step 3: Create packages/client/src/pages/LobbyPage.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectAsPlayer, getSocket } from '../socket.js';
import type { LobbyErrorPayload } from '@poke-fighter/shared';

type Phase = 'login' | 'waiting';

export function LobbyPage() {
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>('login');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket();

    socket.on('lobby:error', (payload: LobbyErrorPayload) => {
      setError(payload.message);
      setPhase('login');
    });

    socket.on('battle:start', () => {
      navigate('/battle');
    });

    return () => {
      socket.off('lobby:error');
      socket.off('battle:start');
    };
  }, [navigate]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    connectAsPlayer(name.trim());
    setPhase('waiting');
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.waiting}>Welcome, <strong>{name}</strong>!</p>
          <p style={styles.subtitle}>Waiting for the admin to set up a battle...</p>
          <div style={styles.spinner}>■ ■ ■</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <form onSubmit={handleJoin} style={styles.box}>
        <label style={styles.label}>Enter your trainer name</label>
        <input
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          type="submit"
          style={styles.button}
          disabled={!name.trim()}
        >
          JOIN BATTLE
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 320 },
  label: { color: '#aaa', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const },
  input: { background: '#1a1a2e', border: '1px solid #3498db', color: '#fff', padding: '8px 12px', fontSize: 16, borderRadius: 4, fontFamily: 'inherit' },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  error: { color: '#e74c3c', fontSize: 12 },
  waiting: { color: '#fff', fontSize: 18 },
  subtitle: { color: '#aaa', fontSize: 14 },
  spinner: { color: '#3498db', fontSize: 24, textAlign: 'center' as const, animation: 'pulse 1s infinite' },
};
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 5: Start client dev server and verify visually**

```bash
pnpm --filter @poke-fighter/client dev
```

Open `http://localhost:5173` — confirm login form renders, enter a name, confirm waiting room appears.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/LobbyPage.tsx packages/client/src/__tests__/LobbyPage.test.tsx packages/client/src/socket.ts
git commit -m "feat(client): player login and waiting room UI"
```

---

## Task 4: Server-side Registry Store

**Files:**
- Create: `packages/server/src/registry/RegistryStore.ts`
- Create: `packages/server/src/registry/__tests__/RegistryStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/registry/__tests__/RegistryStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RegistryStore } from '../RegistryStore.js';
import type { PlayerProfile, TeamTemplate } from '@poke-fighter/shared';

const TEST_DIR = join(process.cwd(), 'test-registry-tmp');

describe('RegistryStore', () => {
  let store: RegistryStore;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new RegistryStore(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('saves and retrieves a player profile', () => {
    const profile: PlayerProfile = {
      profileId: 'p1', displayName: 'Ash',
      createdAt: new Date().toISOString(),
    };
    store.savePlayer(profile);
    const retrieved = store.getPlayer('p1');
    expect(retrieved?.displayName).toBe('Ash');
  });

  it('persists data across store instances', () => {
    store.savePlayer({ profileId: 'p2', displayName: 'Misty', createdAt: new Date().toISOString() });
    const store2 = new RegistryStore(TEST_DIR);
    expect(store2.getPlayer('p2')?.displayName).toBe('Misty');
  });

  it('deletes a player profile', () => {
    store.savePlayer({ profileId: 'p3', displayName: 'Brock', createdAt: new Date().toISOString() });
    store.deletePlayer('p3');
    expect(store.getPlayer('p3')).toBeUndefined();
  });

  it('lists all players', () => {
    store.savePlayer({ profileId: 'a', displayName: 'A', createdAt: new Date().toISOString() });
    store.savePlayer({ profileId: 'b', displayName: 'B', createdAt: new Date().toISOString() });
    expect(store.listPlayers().length).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/registry/__tests__/RegistryStore.test.ts
```

- [ ] **Step 3: Create packages/server/src/registry/RegistryStore.ts**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerProfile, NpcProfile, TeamTemplate } from '@poke-fighter/shared';

export class RegistryStore {
  private readonly dir: string;
  private players: Map<string, PlayerProfile>;
  private npcs: Map<string, NpcProfile>;
  private teams: Map<string, TeamTemplate>;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.players = this.loadFile<PlayerProfile>('players.json');
    this.npcs = this.loadFile<NpcProfile>('npcs.json');
    this.teams = this.loadFile<TeamTemplate>('teams.json');
  }

  private loadFile<T extends { profileId?: string; templateId?: string }>(filename: string): Map<string, T> {
    const path = join(this.dir, filename);
    if (!existsSync(path)) return new Map();
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as T[];
    return new Map(raw.map((item) => [(item.profileId ?? item.templateId)!, item]));
  }

  private saveFile<T>(filename: string, map: Map<string, T>): void {
    writeFileSync(join(this.dir, filename), JSON.stringify(Array.from(map.values()), null, 2));
  }

  // ── Players ──
  savePlayer(profile: PlayerProfile): void {
    this.players.set(profile.profileId, profile);
    this.saveFile('players.json', this.players);
  }

  getPlayer(id: string): PlayerProfile | undefined { return this.players.get(id); }
  getPlayerByName(name: string): PlayerProfile | undefined {
    return Array.from(this.players.values()).find((p) => p.displayName.toLowerCase() === name.toLowerCase());
  }
  listPlayers(): PlayerProfile[] { return Array.from(this.players.values()); }
  deletePlayer(id: string): void { this.players.delete(id); this.saveFile('players.json', this.players); }

  // ── NPCs ──
  saveNpc(profile: NpcProfile): void {
    this.npcs.set(profile.profileId, profile);
    this.saveFile('npcs.json', this.npcs);
  }
  getNpc(id: string): NpcProfile | undefined { return this.npcs.get(id); }
  listNpcs(): NpcProfile[] { return Array.from(this.npcs.values()); }
  deleteNpc(id: string): void { this.npcs.delete(id); this.saveFile('npcs.json', this.npcs); }

  // ── Teams ──
  saveTeam(template: TeamTemplate): void {
    this.teams.set(template.templateId, template);
    this.saveFile('teams.json', this.teams);
  }
  getTeam(id: string): TeamTemplate | undefined { return this.teams.get(id); }
  listTeams(): TeamTemplate[] { return Array.from(this.teams.values()); }
  deleteTeam(id: string): void { this.teams.delete(id); this.saveFile('teams.json', this.teams); }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/registry/__tests__/RegistryStore.test.ts
```

- [ ] **Step 5: Wire RegistryStore into SocketServer**

In `SocketServer.ts`, add:

```typescript
import { RegistryStore } from '../registry/RegistryStore.js';
import { join } from 'node:path';

// In constructor, after creating io:
this.registry = new RegistryStore(join(process.cwd(), 'data/registry'));
```

Declare `private readonly registry: RegistryStore;` as a class field.

- [ ] **Step 6: Add registry event handlers to adminHandlers.ts**

```typescript
// In registerAdminHandlers, add:
socket.on('admin:action', (payload: AdminActionPayload) => {
  if (payload.type === 'registry:list') {
    const { resource } = payload.data as { resource: 'players' | 'npcs' | 'teams' };
    const data = resource === 'players' ? registry.listPlayers()
      : resource === 'npcs' ? registry.listNpcs()
      : registry.listTeams();
    socket.emit('registry:data' as any, { resource, data });
  }
  // save/delete handlers follow the same pattern
});
```

Update `registerAdminHandlers` to accept `registry: RegistryStore` as a parameter.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/registry/
git commit -m "feat(server): RegistryStore — JSON persistence for player, NPC, and team profiles"
```

---

**Plan 04 complete.** The React client is bootstrapped with a working login and waiting room. The server persists player/NPC/team profiles to JSON files. The admin can query the registry via Socket.io.
