# Plan 05: Admin Battle Setup Panel (F4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-facing battle setup UI — connect as admin, view connected players, define Team A and Team B, assign players/NPCs to slots, build or load Pokémon teams for each slot, configure battle settings, and start the battle.

**Architecture:** The admin connects via `connectAsAdmin(token)` from the client. The `/admin` route renders a React multi-step setup flow: (1) team structure, (2) slot assignment, (3) team building, (4) settings + start. The team builder uses the `DataLoader` data (exposed via a Socket.io query endpoint) to search Pokémon and moves. When the admin clicks "Start Battle", the server creates a `BattleState` from the config and calls `SocketServer.startBattle()`.

**Tech Stack:** React 18, socket.io-client, `@poke-fighter/shared` types.

**Prerequisite:** Plans 01–04 complete.

---

## File Structure

```
packages/client/src/
├── admin/
│   ├── AdminShell.tsx               # admin login gate + nav
│   ├── SetupPanel.tsx               # step controller
│   ├── steps/
│   │   ├── TeamStructureStep.tsx    # define number of slots per team
│   │   ├── SlotAssignmentStep.tsx   # assign player/NPC to each slot
│   │   ├── TeamBuilderStep.tsx      # build 6-mon teams per slot
│   │   └── BattleSettingsStep.tsx   # timer, label, start button
│   ├── TeamBuilder.tsx              # reusable Pokémon team editor
│   └── __tests__/
│       ├── TeamStructureStep.test.tsx
│       └── TeamBuilder.test.tsx

packages/server/src/
├── setup/
│   ├── BattleConfigurator.ts        # converts admin config into BattleState
│   └── __tests__/
│       └── BattleConfigurator.test.ts
```

---

## Task 1: Admin Login Gate

**Files:**
- Modify: `packages/client/src/pages/AdminPage.tsx`
- Create: `packages/client/src/admin/AdminShell.tsx`

- [ ] **Step 1: Create packages/client/src/admin/AdminShell.tsx**

```tsx
import { useState } from 'react';
import { connectAsAdmin } from '../socket.js';
import { SetupPanel } from './SetupPanel.js';

export function AdminShell() {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    connectAsAdmin(token.trim());
    setConnected(true);
    // If token is wrong the server will simply not grant admin room —
    // admin actions will silently fail. For R1 intranet this is acceptable.
  }

  if (connected) return <SetupPanel />;

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
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" style={styles.button} disabled={!token.trim()}>
          CONNECT AS ADMIN
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:24 },
  title: { fontSize:36, letterSpacing:6, color:'#e74c3c' },
  box: { background:'#0d0d1a', border:'2px solid #e74c3c', borderRadius:8, padding:32, display:'flex', flexDirection:'column' as const, gap:16, minWidth:320 },
  label: { color:'#aaa', fontSize:12, letterSpacing:2, textTransform:'uppercase' as const },
  input: { background:'#1a1a2e', border:'1px solid #e74c3c', color:'#fff', padding:'8px 12px', fontSize:16, borderRadius:4, fontFamily:'inherit' },
  button: { background:'#c0392b', color:'#fff', border:'none', padding:'10px 20px', fontSize:14, letterSpacing:2, cursor:'pointer', borderRadius:4, fontFamily:'inherit' },
  error: { color:'#e74c3c', fontSize:12 },
};
```

- [ ] **Step 2: Update AdminPage.tsx to render AdminShell**

```tsx
import { AdminShell } from '../admin/AdminShell.js';

export function AdminPage() {
  return <AdminShell />;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/admin/AdminShell.tsx packages/client/src/pages/AdminPage.tsx
git commit -m "feat(client): admin login gate"
```

---

## Task 2: Team Structure Step

**Files:**
- Create: `packages/client/src/admin/steps/TeamStructureStep.tsx`
- Create: `packages/client/src/admin/__tests__/TeamStructureStep.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/client/src/admin/__tests__/TeamStructureStep.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TeamStructureStep } from '../steps/TeamStructureStep.js';

describe('TeamStructureStep', () => {
  it('renders team A and team B slot count pickers', () => {
    render(<TeamStructureStep onNext={vi.fn()} />);
    expect(screen.getByText(/team a/i)).toBeTruthy();
    expect(screen.getByText(/team b/i)).toBeTruthy();
  });

  it('calls onNext with slot counts when confirmed', () => {
    const onNext = vi.fn();
    render(<TeamStructureStep onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith({ teamASlots: 1, teamBSlots: 1 });
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 3: Create packages/client/src/admin/steps/TeamStructureStep.tsx**

```tsx
import { useState } from 'react';

interface Props {
  onNext: (config: { teamASlots: number; teamBSlots: number }) => void;
}

export function TeamStructureStep({ onNext }: Props) {
  const [teamASlots, setTeamASlots] = useState(1);
  const [teamBSlots, setTeamBSlots] = useState(1);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Team Structure</h2>
      <p style={styles.sub}>How many players/NPCs per team?</p>

      <div style={styles.row}>
        <TeamSlotPicker label="Team A" value={teamASlots} onChange={setTeamASlots} />
        <TeamSlotPicker label="Team B" value={teamBSlots} onChange={setTeamBSlots} />
      </div>

      <button style={styles.button} onClick={() => onNext({ teamASlots, teamBSlots })}>
        NEXT →
      </button>
    </div>
  );
}

function TeamSlotPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#aaa', fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={styles.countBtn} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <span style={{ fontSize: 32, color: '#fff', minWidth: 32, textAlign: 'center' }}>{value}</span>
        <button style={styles.countBtn} onClick={() => onChange(Math.min(6, value + 1))}>+</button>
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>slots (1–6)</div>
    </div>
  );
}

const styles = {
  container: { display:'flex', flexDirection:'column' as const, gap:24, padding:24 },
  heading: { color:'#f0c040', fontSize:20, letterSpacing:2 },
  sub: { color:'#aaa', fontSize:14 },
  row: { display:'flex', gap:48, justifyContent:'center' },
  button: { background:'#2980b9', color:'#fff', border:'none', padding:'10px 24px', fontSize:14, letterSpacing:2, cursor:'pointer', borderRadius:4, fontFamily:'inherit', alignSelf:'flex-end' },
  countBtn: { background:'#1a1a2e', color:'#fff', border:'1px solid #3498db', width:32, height:32, cursor:'pointer', fontSize:18, borderRadius:4 },
};
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/steps/TeamStructureStep.tsx packages/client/src/admin/__tests__/TeamStructureStep.test.tsx
git commit -m "feat(client): admin team structure step — slot count picker"
```

---

## Task 3: Slot Assignment Step

**Files:**
- Create: `packages/client/src/admin/steps/SlotAssignmentStep.tsx`

- [ ] **Step 1: Create packages/client/src/admin/steps/SlotAssignmentStep.tsx**

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../../socket.js';

interface SlotConfig {
  slotId: string;
  type: 'player' | 'npc';
  displayName: string;
  profileId?: string;
}

interface Props {
  teamASlots: number;
  teamBSlots: number;
  onNext: (slots: { teamA: SlotConfig[]; teamB: SlotConfig[] }) => void;
  onBack: () => void;
}

export function SlotAssignmentStep({ teamASlots, teamBSlots, onNext, onBack }: Props) {
  const [waitingPlayers, setWaitingPlayers] = useState<string[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<{ profileId: string; displayName: string }[]>([]);
  const [savedNpcs, setSavedNpcs] = useState<{ profileId: string; name: string }[]>([]);
  const [slots, setSlots] = useState<SlotConfig[]>(() => [
    ...Array.from({ length: teamASlots }, (_, i) => ({ slotId: `a${i + 1}`, type: 'player' as const, displayName: '' })),
    ...Array.from({ length: teamBSlots }, (_, i) => ({ slotId: `b${i + 1}`, type: 'npc' as const, displayName: '' })),
  ]);

  useEffect(() => {
    const socket = getSocket();
    // Request registry data from server
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } } as any);
    // Request waiting players
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'waiting' } } as any);

    socket.on('registry:data' as any, (payload: any) => {
      if (payload.resource === 'players') setSavedPlayers(payload.data);
      if (payload.resource === 'npcs') setSavedNpcs(payload.data.map((n: any) => ({ profileId: n.profileId, name: n.name })));
      if (payload.resource === 'waiting') setWaitingPlayers(payload.data);
    });

    return () => { socket.off('registry:data' as any); };
  }, []);

  function updateSlot(index: number, update: Partial<SlotConfig>) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  }

  const allFilled = slots.every((s) => s.displayName.trim());

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Assign Slots</h2>

      <div style={{ display: 'flex', gap: 32 }}>
        <TeamColumn
          label="Team A"
          slots={slots.filter((s) => s.slotId.startsWith('a'))}
          startIndex={0}
          onUpdate={updateSlot}
          waitingPlayers={waitingPlayers}
          savedPlayers={savedPlayers}
          savedNpcs={savedNpcs}
        />
        <TeamColumn
          label="Team B"
          slots={slots.filter((s) => s.slotId.startsWith('b'))}
          startIndex={teamASlots}
          onUpdate={updateSlot}
          waitingPlayers={waitingPlayers}
          savedPlayers={savedPlayers}
          savedNpcs={savedNpcs}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ ...btnStyle, background: '#333' }}>← BACK</button>
        <button
          onClick={() => onNext({ teamA: slots.filter((s) => s.slotId.startsWith('a')), teamB: slots.filter((s) => s.slotId.startsWith('b')) })}
          style={{ ...btnStyle, background: '#2980b9' }}
          disabled={!allFilled}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}

function TeamColumn({ label, slots, startIndex, onUpdate, waitingPlayers, savedPlayers, savedNpcs }: any) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: '#aaa', fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>{label.toUpperCase()}</div>
      {slots.map((slot: any, i: number) => (
        <SlotRow key={slot.slotId} slot={slot} index={startIndex + i} onUpdate={onUpdate}
          waitingPlayers={waitingPlayers} savedPlayers={savedPlayers} savedNpcs={savedNpcs} />
      ))}
    </div>
  );
}

function SlotRow({ slot, index, onUpdate, waitingPlayers, savedPlayers, savedNpcs }: any) {
  return (
    <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 4, padding: 12, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={slot.type}
        onChange={(e) => onUpdate(index, { type: e.target.value, displayName: '' })}
        style={selectStyle}
      >
        <option value="player">Player</option>
        <option value="npc">NPC</option>
      </select>

      {slot.type === 'player' ? (
        <select
          value={slot.displayName}
          onChange={(e) => onUpdate(index, { displayName: e.target.value })}
          style={selectStyle}
        >
          <option value="">— select player —</option>
          {waitingPlayers.map((name: string) => <option key={name} value={name}>{name} (online)</option>)}
          {savedPlayers.map((p: any) => <option key={p.profileId} value={p.displayName} data-id={p.profileId}>{p.displayName} (saved)</option>)}
        </select>
      ) : (
        <select
          value={slot.displayName}
          onChange={(e) => onUpdate(index, { displayName: e.target.value })}
          style={selectStyle}
        >
          <option value="">— select NPC —</option>
          {savedNpcs.map((n: any) => <option key={n.profileId} value={n.name}>{n.name}</option>)}
          <option value="__new__">+ New NPC</option>
        </select>
      )}

      <span style={{ color: slot.displayName ? '#2ecc71' : '#555', fontSize: 12 }}>
        {slot.displayName ? '✓' : '○'}
      </span>
    </div>
  );
}

const btnStyle = { color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
const selectStyle = { background: '#1a1a2e', color: '#fff', border: '1px solid #555', padding: '6px 8px', borderRadius: 4, fontFamily: 'inherit', flex: 1 };
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/admin/steps/SlotAssignmentStep.tsx
git commit -m "feat(client): admin slot assignment step with player/NPC picker"
```

---

## Task 4: Battle Configurator (Server)

**Files:**
- Create: `packages/server/src/setup/BattleConfigurator.ts`
- Create: `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/server/src/setup/__tests__/BattleConfigurator.test.ts
import { describe, it, expect } from 'vitest';
import { BattleConfigurator } from '../BattleConfigurator.js';
import type { PokemonSet } from '@poke-fighter/shared';

const mockSet: PokemonSet = {
  speciesId: 6, level: 50, ability: 'blaze',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('BattleConfigurator', () => {
  it('builds a valid BattleState from a slot configuration', () => {
    const config = new BattleConfigurator();
    const state = config.build({
      battleId: 'test-battle',
      label: 'Test',
      turnTimerSeconds: 60,
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [mockSet] }] },
      ],
    });

    expect(state.battleId).toBe('test-battle');
    expect(state.teams[0]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(0);
    expect(state.teams[0]!.slots[0]!.party[0]!.moves).toHaveLength(4);
    expect(state.teams[0]!.slots[0]!.party[0]!.stats.spe).toBeGreaterThan(0);
  });

  it('calculates correct HP from EVs/IVs/nature', () => {
    const config = new BattleConfigurator();
    const state = config.build({
      battleId: 'x', label: 'x', turnTimerSeconds: 60,
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
      ],
    });
    // Charizard base HP=78, L50, 0 EVs, 31 IVs: floor((2*78+31+0)*50/100)+50+10 = 143
    expect(state.teams[0]!.slots[0]!.party[0]!.maxHp).toBe(143);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/setup/__tests__/BattleConfigurator.test.ts
```

- [ ] **Step 3: Create packages/server/src/setup/BattleConfigurator.ts**

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { BattleState, SlotState, PartyMember, PokemonSet, TeamState } from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { calcAllStats } from '../engine/stats.js';

interface SlotConfig {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  party: PokemonSet[];
}

interface TeamConfig {
  slots: SlotConfig[];
}

interface BuildConfig {
  battleId: string;
  label: string;
  turnTimerSeconds: number;
  teams: [TeamConfig, TeamConfig];
}

export class BattleConfigurator {
  private readonly data = new DataLoader();

  build(config: BuildConfig): BattleState {
    const teams = config.teams.map((teamConfig, teamIdx) => this.buildTeam(teamConfig, teamIdx)) as [TeamState, TeamState];

    return {
      battleId: config.battleId,
      label: config.label,
      turnNumber: 1,
      phase: 'action',
      teams,
      field: {
        trickRoom: 0,
        gravity: 0,
        sideConditions: [
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
        ],
      },
      turnTimerSeconds: config.turnTimerSeconds,
    };
  }

  private buildTeam(teamConfig: TeamConfig, teamIdx: number): TeamState {
    return {
      teamId: `team-${teamIdx === 0 ? 'a' : 'b'}`,
      slots: teamConfig.slots.map((slotConfig) => this.buildSlot(slotConfig)),
    };
  }

  private buildSlot(slotConfig: SlotConfig): SlotState {
    return {
      slotId: slotConfig.slotId,
      displayName: slotConfig.displayName,
      isNpc: slotConfig.isNpc,
      isSpectator: false,
      party: slotConfig.party.map((set) => this.buildPartyMember(set)),
      activePokemonIndex: 0,
    };
  }

  private buildPartyMember(set: PokemonSet): PartyMember {
    const species = this.data.getSpecies(set.speciesId);
    if (!species) throw new Error(`Unknown species id: ${set.speciesId}`);

    const stats = calcAllStats({
      baseStats: species.baseStats,
      ivs: set.ivs,
      evs: set.evs,
      level: set.level,
      nature: set.nature,
    });

    return {
      instanceId: uuidv4(),
      speciesId: set.speciesId,
      nickname: set.nickname,
      level: set.level,
      currentHp: stats.hp,
      maxHp: stats.hp,
      stats,
      ability: set.ability,
      heldItem: set.heldItem,
      moves: set.moves.map((moveId) => ({
        moveId,
        currentPp: this.data.getMove(moveId)?.pp ?? 0,
        maxPp: this.data.getMove(moveId)?.pp ?? 0,
      })) as [any, any, any, any],
      status: undefined,
      volatileStatus: [],
      statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      teraType: set.teraType,
      hasTerastallized: false,
      fainted: false,
      expTotal: 0,
    };
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/setup/__tests__/BattleConfigurator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/setup/
git commit -m "feat(server): BattleConfigurator — converts admin config into initial BattleState"
```

---

## Task 4b: Team Builder Step

**Files:**
- Create: `packages/client/src/admin/steps/TeamBuilderStep.tsx`
- Create: `packages/client/src/admin/TeamBuilder.tsx`

The team builder is used by the admin to assign a 6-Pokémon team to each slot. It fetches the Pokémon list from the server via a Socket.io query and lets the admin search, pick Pokémon, and assign moves/item/ability/level.

- [ ] **Step 1: Add a server-side data query handler**

In `adminHandlers.ts`, add:

```typescript
case 'data:query': {
  const { resource, query } = payload.data as { resource: 'pokemon' | 'moves' | 'abilities' | 'items'; query?: string };
  const data = new DataLoader();
  let results: unknown[];
  switch (resource) {
    case 'pokemon':
      results = data.getAllSpecies().filter((s) =>
        !query || s.name.includes(query.toLowerCase()) || String(s.id).includes(query)
      ).slice(0, 30);
      break;
    case 'moves':
      // Return learnset for a given speciesId
      const species = data.getSpecies(Number(query));
      results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
      break;
    default:
      results = [];
  }
  socket.emit('data:results' as any, { resource, results });
  break;
}
```

- [ ] **Step 2: Create packages/client/src/admin/TeamBuilder.tsx**

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../../socket.js';
import type { PokemonSpecies, Move, PokemonSet } from '@poke-fighter/shared';

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
}

export function TeamBuilder({ onTeamSaved, initialTeam = [] }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PokemonSpecies[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    socket.on('data:results' as any, (payload: any) => {
      if (payload.resource === 'pokemon') setSearchResults(payload.results);
    });
    return () => { socket.off('data:results' as any); };
  }, []);

  function searchPokemon(q: string) {
    setSearch(q);
    if (q.length >= 2) {
      getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
    } else {
      setSearchResults([]);
    }
  }

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
    setSearchResults([]);
    setSearch('');
  }

  function updateSlotField(index: number, field: keyof PokemonSet, value: unknown) {
    const updated = [...team];
    updated[index] = { ...updated[index], [field]: value };
    setTeam(updated);
  }

  const isValid = team.length > 0 && team.every((s) => s.speciesId && s.moves?.every(Boolean));

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      {/* Slot tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) setTeam([...team, {}]); }}
            style={{
              background: selectedSlot === i ? '#2980b9' : '#1a1a2e',
              border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`,
              color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            }}
          >
            {team[i]?.speciesId ? `#${team[i]?.speciesId}` : `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Pokémon search */}
      <div>
        <input
          placeholder="Search Pokémon by name or dex number..."
          value={search}
          onChange={(e) => searchPokemon(e.target.value)}
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'inherit', width: '100%', fontSize: 13 }}
        />
        {searchResults.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
            {searchResults.map((s) => (
              <div
                key={s.id}
                onClick={() => pickPokemon(s)}
                style={{ padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: 12, borderBottom: '1px solid #222' }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#1a3a5c')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                #{s.id} {s.displayName} [{s.types.join('/')}]
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slot editor — shows for selected slot */}
      {team[selectedSlot]?.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#aaa', fontSize: 11 }}>Species #{team[selectedSlot]!.speciesId} — editing slot {selectedSlot + 1}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={lbl}>Level</label>
            <input type="number" min={1} max={100} value={team[selectedSlot]?.level ?? 50}
              onChange={(e) => updateSlotField(selectedSlot, 'level', Number(e.target.value))}
              style={{ ...inp, width: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={lbl}>Nature</label>
            <input value={team[selectedSlot]?.nature ?? 'hardy'}
              onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
              style={{ ...inp, width: 100 }} />
          </div>
          <div>
            <label style={lbl}>Moves (IDs, one per line)</label>
            {[0, 1, 2, 3].map((mi) => (
              <input key={mi} placeholder={`Move ${mi + 1} id`}
                value={(team[selectedSlot]?.moves ?? [])[mi] ?? ''}
                onChange={(e) => {
                  const moves = [...((team[selectedSlot]?.moves ?? ['','','','']) as string[])];
                  moves[mi] = e.target.value;
                  updateSlotField(selectedSlot, 'moves', moves as [string,string,string,string]);
                }}
                style={{ ...inp, display: 'block', marginBottom: 4, width: '100%' }} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onTeamSaved(team.filter((s) => s.speciesId) as PokemonSet[])}
        disabled={!isValid}
        style={{ background: isValid ? '#27ae60' : '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 4, cursor: isValid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 13, letterSpacing: 1 }}
      >
        SAVE TEAM ({team.filter((s) => s.speciesId).length}/6)
      </button>
    </div>
  );
}

const lbl = { color: '#aaa', fontSize: 11, minWidth: 50 };
const inp = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
```

- [ ] **Step 3: Create packages/client/src/admin/steps/TeamBuilderStep.tsx**

```tsx
import { useState } from 'react';
import { TeamBuilder } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

interface SlotTeam { slotId: string; displayName: string; team: PokemonSet[] }

interface Props {
  slots: { teamA: { slotId: string; displayName: string }[]; teamB: { slotId: string; displayName: string }[] };
  onNext: (slotTeams: SlotTeam[]) => void;
  onBack: () => void;
}

export function TeamBuilderStep({ slots, onNext, onBack }: Props) {
  const allSlots = [...slots.teamA, ...slots.teamB];
  const [activeSlot, setActiveSlot] = useState(allSlots[0]?.slotId ?? '');
  const [teams, setTeams] = useState<Record<string, PokemonSet[]>>({});

  function saveTeam(slotId: string, team: PokemonSet[]) {
    setTeams((prev) => ({ ...prev, [slotId]: team }));
  }

  const allFilled = allSlots.every((s) => (teams[s.slotId]?.length ?? 0) > 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Build Teams</h2>

      {/* Slot picker */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {allSlots.map((slot) => (
          <button
            key={slot.slotId}
            onClick={() => setActiveSlot(slot.slotId)}
            style={{
              background: activeSlot === slot.slotId ? '#2980b9' : '#1a1a2e',
              border: `1px solid ${teams[slot.slotId] ? '#27ae60' : activeSlot === slot.slotId ? '#3498db' : '#555'}`,
              color: '#fff', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
            }}
          >
            {slot.displayName} {teams[slot.slotId] ? '✓' : '○'}
          </button>
        ))}
      </div>

      {/* Active team builder */}
      {activeSlot && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 6 }}>
          <TeamBuilder
            key={activeSlot}
            initialTeam={teams[activeSlot] ?? []}
            onTeamSaved={(team) => saveTeam(activeSlot, team)}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => onNext(allSlots.map((s) => ({ slotId: s.slotId, displayName: s.displayName, team: teams[s.slotId] ?? [] })))}
          disabled={!allFilled}
          style={{ background: allFilled ? '#2980b9' : '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: allFilled ? 'pointer' : 'not-allowed', borderRadius: 4, fontFamily: 'inherit' }}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update SetupPanel to include TeamBuilderStep**

In `SetupPanel.tsx`, add `'teams'` to the `Step` type and insert it between `'assignment'` and `'settings'`:

```typescript
type Step = 'structure' | 'assignment' | 'teams' | 'settings' | 'started';
```

Add state for `slotTeams` and add the step render:

```tsx
import { TeamBuilderStep } from './steps/TeamBuilderStep.js';

// In handleAssignmentNext:
function handleAssignmentNext(slots: ...) {
  setSlotAssignment(slots);
  setStep('teams'); // was 'settings'
}

// In SetupPanel render, add:
{step === 'teams' && (
  <TeamBuilderStep
    slots={slotAssignment}
    onNext={(slotTeams) => { setSlotTeams(slotTeams); setStep('settings'); }}
    onBack={() => setStep('assignment')}
  />
)}
```

Also update `stepTitles` to include the new step and pass team data through to `handleStart`.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/TeamBuilder.tsx packages/client/src/admin/steps/TeamBuilderStep.tsx packages/client/src/admin/SetupPanel.tsx
git commit -m "feat(client): team builder step in admin setup — search, pick pokemon, assign moves"
```

---

## Task 5: SetupPanel & Battle Start

**Files:**
- Create: `packages/client/src/admin/SetupPanel.tsx`
- Create: `packages/client/src/admin/steps/BattleSettingsStep.tsx`

- [ ] **Step 1: Create packages/client/src/admin/steps/BattleSettingsStep.tsx**

```tsx
import { useState } from 'react';

interface Props {
  onStart: (settings: { label: string; timerSeconds: number }) => void;
  onBack: () => void;
}

export function BattleSettingsStep({ onStart, onBack }: Props) {
  const [label, setLabel] = useState('Battle 1');
  const [timer, setTimer] = useState(60);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Battle Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>BATTLE NAME</label>
        <input
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16 }}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>TURN TIMER (seconds)</label>
        <input
          type="number"
          min={15}
          max={300}
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16, width: 100 }}
          value={timer}
          onChange={(e) => setTimer(Number(e.target.value))}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => onStart({ label, timerSeconds: timer })}
          style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}
          disabled={!label.trim()}
        >
          ▶ START BATTLE
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create packages/client/src/admin/SetupPanel.tsx**

```tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamStructureStep } from './steps/TeamStructureStep.js';
import { SlotAssignmentStep } from './steps/SlotAssignmentStep.js';
import { BattleSettingsStep } from './steps/BattleSettingsStep.js';

type Step = 'structure' | 'assignment' | 'settings' | 'started';

export function SetupPanel() {
  const [step, setStep] = useState<Step>('structure');
  const [structure, setStructure] = useState({ teamASlots: 1, teamBSlots: 1 });
  const [slotAssignment, setSlotAssignment] = useState<any>(null);

  function handleStructureNext(config: { teamASlots: number; teamBSlots: number }) {
    setStructure(config);
    setStep('assignment');
  }

  function handleAssignmentNext(slots: { teamA: any[]; teamB: any[] }) {
    setSlotAssignment(slots);
    setStep('settings');
  }

  function handleStart({ label, timerSeconds }: { label: string; timerSeconds: number }) {
    const socket = getSocket();
    const battleId = uuidv4();
    socket.emit('admin:action', {
      type: 'start-battle',
      data: {
        battleId,
        label,
        turnTimerSeconds: timerSeconds,
        teams: [
          { slots: slotAssignment.teamA },
          { slots: slotAssignment.teamB },
        ],
      },
    } as any);
    setStep('started');
  }

  if (step === 'started') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ color: '#27ae60', fontSize: 24 }}>Battle Started!</h2>
        <p style={{ color: '#aaa', marginTop: 12 }}>Waiting for players to join the battle room...</p>
      </div>
    );
  }

  const stepTitles = { structure: '1 / 3 — Structure', assignment: '2 / 3 — Assign Slots', settings: '3 / 3 — Settings' };

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ color: '#e74c3c', letterSpacing: 4 }}>BATTLE SETUP</h1>
          <span style={{ color: '#aaa', fontSize: 12 }}>{stepTitles[step as keyof typeof stepTitles]}</span>
        </div>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}>
          {step === 'structure' && <TeamStructureStep onNext={handleStructureNext} />}
          {step === 'assignment' && (
            <SlotAssignmentStep
              teamASlots={structure.teamASlots}
              teamBSlots={structure.teamBSlots}
              onNext={handleAssignmentNext}
              onBack={() => setStep('structure')}
            />
          )}
          {step === 'settings' && (
            <BattleSettingsStep
              onStart={handleStart}
              onBack={() => setStep('assignment')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add 'start-battle' handler to adminHandlers.ts on the server**

In `packages/server/src/socket/handlers/adminHandlers.ts`, add to the switch:

```typescript
case 'start-battle': {
  const { battleId, label, turnTimerSeconds, teams } = payload.data as {
    battleId: string; label: string; turnTimerSeconds: number;
    teams: [{ slots: any[] }, { slots: any[] }];
  };
  const configurator = new (await import('../../setup/BattleConfigurator.js')).BattleConfigurator();
  const state = configurator.build({ battleId, label, turnTimerSeconds, teams });
  const room = startBattle(state);
  // Move players into the battle room
  for (const team of state.teams) {
    for (const slot of team.slots) {
      const player = lobby.getByName(slot.displayName);
      if (player) {
        player.battleId = battleId;
        player.battleSlotId = slot.slotId;
        io.sockets.sockets.get(player.socketId)?.join(`battle:${battleId}`);
      }
    }
  }
  io.to(`battle:${battleId}`).emit('battle:start', { state });
  break;
}
```

- [ ] **Step 4: Add uuid to client package**

```bash
pnpm --filter @poke-fighter/client add uuid
pnpm --filter @poke-fighter/client add -D @types/uuid
pnpm install
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/ packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/setup/
git commit -m "feat: admin setup panel with team structure, slot assignment, and battle start"
```

---

**Plan 05 complete.** The admin can log in, define team structure, assign players and NPCs to slots, configure battle settings, and start a battle. The server builds the initial `BattleState` via `BattleConfigurator` and notifies all assigned players.
