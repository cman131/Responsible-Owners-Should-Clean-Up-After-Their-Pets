# Battle Setup Wizard Validation Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add move-completeness validation to `TeamBuilderStep` and `PlayerProfileEditor`, and add a non-blocking duplicate-slot warning to `SlotAssignmentStep`.

**Architecture:** All three fixes are pure client-side UI changes. `TeamBuilderStep` and `PlayerProfileEditor` import `slotStatus` (already exported by `TeamBuilder.tsx`) to gate their proceed/save actions. `SlotAssignmentStep` computes a `duplicateNames` Set from current slot state and passes it to `SlotRow` for badge rendering.

**Tech Stack:** React, TypeScript, Vitest + Testing Library (client package)

---

### Task 1: TeamBuilderStep — block NEXT when any Pokémon has no moves

**Files:**
- Modify: `packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx`
- Modify: `packages/client/src/admin/steps/TeamBuilderStep.tsx`

- [ ] **Step 1: Update mock to export `slotStatus` and add two failing tests**

Replace the full contents of `packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ initialTeam }: any) => (
    <div>team-size-{initialTeam?.length ?? 0}</div>
  ),
  slotStatus: (p: any) => {
    if (!p?.speciesId) return 'empty';
    if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
    return 'complete';
  },
}));

import { TeamBuilderStep } from '../steps/TeamBuilderStep.js';
import type { PokemonSet } from '@poke-fighter/shared';

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
  moves: ['thunderbolt', '', '', ''], ability: 'Static',
  evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 },
  ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
};

const pikachuNoMoves: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
  moves: ['', '', '', ''], ability: 'Static',
  evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 },
  ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
};

describe('TeamBuilderStep — defaultTeam pre-fill', () => {
  it('pre-fills TeamBuilder initialTeam from slot.defaultTeam', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Ash', defaultTeam: [pikachu] }],
      teamB: [{ slotId: 'b1', displayName: 'Gary' }],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('team-size-1')).toBeTruthy();
  });

  it('starts with empty team when slot has no defaultTeam', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Gary' }],
      teamB: [],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('team-size-0')).toBeTruthy();
  });

  it('NEXT is disabled when a pokemon in the pre-filled team has no moves', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Ash', defaultTeam: [pikachuNoMoves] }],
      teamB: [],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('NEXT is enabled when all pokemon have at least one move', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Ash', defaultTeam: [pikachu] }],
      teamB: [],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm the two new tests fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilderStepPrefill.test.tsx
```

Expected: "NEXT is disabled..." FAILS (NEXT currently enabled since `allFilled` only checks team length). "NEXT is enabled..." also FAILS (because `slotStatus` isn't imported yet in the component, so `allFilled` doesn't use it). The two pre-fill tests still pass.

- [ ] **Step 3: Implement the fix in `TeamBuilderStep.tsx`**

Replace the full contents of `packages/client/src/admin/steps/TeamBuilderStep.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { TeamBuilder, slotStatus } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

interface SlotInfo { slotId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }
interface SlotTeam { slotId: string; displayName: string; team: PokemonSet[] }

interface Props {
  slots: { teamA: SlotInfo[]; teamB: SlotInfo[] };
  onNext: (slotTeams: SlotTeam[]) => void;
  onBack: () => void;
}

export function TeamBuilderStep({ slots, onNext, onBack }: Props) {
  const allSlots = [...slots.teamA, ...slots.teamB];
  const [activeSlot, setActiveSlot] = useState(allSlots[0]?.slotId ?? '');
  const [teams, setTeams] = useState<Record<string, PokemonSet[]>>(() => {
    const initial: Record<string, PokemonSet[]> = {};
    allSlots.forEach((slot) => {
      if (slot.defaultTeam && slot.defaultTeam.length > 0) {
        initial[slot.slotId] = slot.defaultTeam;
      }
    });
    return initial;
  });

  const handleTeamSaved = useCallback((team: PokemonSet[]) => {
    setTeams((prev) => ({ ...prev, [activeSlot]: team }));
  }, [activeSlot]);

  const allFilled = allSlots.every((s) => {
    const team = teams[s.slotId] ?? [];
    return team.length > 0 && team.every((p) => slotStatus(p) === 'complete');
  });

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Build Teams</h2>

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

      {activeSlot && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 6 }}>
          <TeamBuilder
            key={activeSlot}
            initialTeam={teams[activeSlot] ?? []}
            onTeamSaved={handleTeamSaved}
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

- [ ] **Step 4: Run tests to confirm all four pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilderStepPrefill.test.tsx
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx packages/client/src/admin/steps/TeamBuilderStep.tsx
git commit -m "feat(client): block NEXT in TeamBuilderStep when pokemon have no moves"
```

---

### Task 2: PlayerProfileEditor — block SAVE when team has Pokémon with no moves

**Files:**
- Modify: `packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx`
- Modify: `packages/client/src/admin/PlayerProfileEditor.tsx`

- [ ] **Step 1: Add `slotStatus` to mock and add two failing tests**

Open `packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx`. Make two changes:

**Change 1 — update the `TeamBuilder.js` mock** (add `slotStatus` to the factory return):

```tsx
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, onSendToBank }: any) => (
    <div>
      <span>team-builder</span>
      <button onClick={() => onSendToBank?.({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['','','',''] as [string,string,string,string], ability: 'Overgrow', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} })}>
        send-to-bank
      </button>
      <button onClick={() => onTeamSaved([])}>clear-team</button>
    </div>
  ),
  slotStatus: (p: any) => {
    if (!p?.speciesId) return 'empty';
    if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
    return 'complete';
  },
}));
```

**Change 2 — add two new `it` blocks** inside `describe('PlayerProfileEditor', ...)`, after the last existing test:

```tsx
  it('SAVE is disabled when team has a pokemon with no moves', () => {
    const profile = {
      profileId: 'p1',
      displayName: 'Ash',
      createdAt: '2026-01-01T00:00:00Z',
      defaultTeam: {
        templateId: 't1',
        name: "Ash's Team",
        createdAt: '2026-01-01T00:00:00Z',
        pokemon: [{
          speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
          moves: ['', '', '', ''] as [string, string, string, string],
          ability: 'Static',
          evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 },
          ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
        }],
      },
    };
    render(<PlayerProfileEditor profile={profile} onBack={vi.fn()} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('SAVE is enabled when team has a pokemon with at least one move', () => {
    const profile = {
      profileId: 'p1',
      displayName: 'Ash',
      createdAt: '2026-01-01T00:00:00Z',
      defaultTeam: {
        templateId: 't1',
        name: "Ash's Team",
        createdAt: '2026-01-01T00:00:00Z',
        pokemon: [{
          speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
          moves: ['thunderbolt', '', '', ''] as [string, string, string, string],
          ability: 'Static',
          evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 },
          ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
        }],
      },
    };
    render(<PlayerProfileEditor profile={profile} onBack={vi.fn()} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });
```

- [ ] **Step 2: Run tests to confirm exactly one new test fails**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/PlayerProfileEditor.test.tsx
```

Expected: "SAVE is disabled when team has a pokemon with no moves" FAILS (SAVE currently enabled since `isValid` only checks name). "SAVE is enabled when team has at least one move" PASSES. All 5 existing tests still pass.

- [ ] **Step 3: Implement the fix in `PlayerProfileEditor.tsx`**

Open `packages/client/src/admin/PlayerProfileEditor.tsx`. Make two changes:

**Change 1 — update the import** (add `slotStatus`):

```tsx
import { TeamBuilder, slotStatus } from './TeamBuilder.js';
```

**Change 2 — update `isValid`** (replace the `isValid` line and add `teamComplete`):

```tsx
  const isNew = profile === null;
  const teamComplete = team.length === 0 || team.every((p) => slotStatus(p) === 'complete');
  const isValid = name.trim().length > 0 && teamComplete;
```

**Change 3 — update the error message** at the bottom of the JSX return (the `!isValid` block):

```tsx
        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0 ? 'Name is required.' : 'All Pokémon must have at least one move.'}
          </div>
        )}
```

- [ ] **Step 4: Run tests to confirm all 7 pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/PlayerProfileEditor.test.tsx
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx packages/client/src/admin/PlayerProfileEditor.tsx
git commit -m "feat(client): block SAVE in PlayerProfileEditor when pokemon have no moves"
```

---

### Task 3: SlotAssignmentStep — show non-blocking duplicate badge

**Files:**
- Modify: `packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx`
- Modify: `packages/client/src/admin/steps/SlotAssignmentStep.tsx`

- [ ] **Step 1: Add three failing tests for the duplicate badge**

Open `packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx`. Append this new `describe` block at the end of the file (after the closing `}` of the existing `describe`):

```tsx
describe('SlotAssignmentStep — duplicate slot warning', () => {
  it('shows ⚠ duplicate badge when the same NPC is selected in two slots', () => {
    render(<SlotAssignmentStep teamASlots={0} teamBSlots={2} onNext={vi.fn()} onBack={vi.fn()} />);

    act(() => {
      registryHandler?.({
        resource: 'npcs',
        data: [{ profileId: 'npc1', name: 'Blaine', team: { templateId: 't1', name: "Blaine's Team", pokemon: [], createdAt: '2026-01-01T00:00:00Z' }, createdAt: '2026-01-01T00:00:00Z' }],
      });
    });

    const selects = screen.getAllByRole('combobox');
    const npcSelects = selects.filter(
      (s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text.includes('Blaine'))
    );
    expect(npcSelects.length).toBe(2);
    fireEvent.change(npcSelects[0]!, { target: { value: 'Blaine' } });
    fireEvent.change(npcSelects[1]!, { target: { value: 'Blaine' } });

    const badges = screen.getAllByText('⚠ duplicate');
    expect(badges.length).toBe(2);
  });

  it('does not show duplicate badge when all slots have different names', () => {
    render(<SlotAssignmentStep teamASlots={0} teamBSlots={2} onNext={vi.fn()} onBack={vi.fn()} />);

    act(() => {
      registryHandler?.({
        resource: 'npcs',
        data: [
          { profileId: 'npc1', name: 'Blaine', team: { templateId: 't1', name: "Blaine's Team", pokemon: [], createdAt: '2026-01-01T00:00:00Z' }, createdAt: '2026-01-01T00:00:00Z' },
          { profileId: 'npc2', name: 'Misty', team: { templateId: 't2', name: "Misty's Team", pokemon: [], createdAt: '2026-01-01T00:00:00Z' }, createdAt: '2026-01-01T00:00:00Z' },
        ],
      });
    });

    const selects = screen.getAllByRole('combobox');
    const npcSelects = selects.filter(
      (s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text.includes('Blaine') || o.text.includes('Misty'))
    );
    fireEvent.change(npcSelects[0]!, { target: { value: 'Blaine' } });
    fireEvent.change(npcSelects[1]!, { target: { value: 'Misty' } });

    expect(screen.queryByText('⚠ duplicate')).toBeNull();
  });

  it('NEXT remains enabled despite duplicate selection', () => {
    render(<SlotAssignmentStep teamASlots={0} teamBSlots={2} onNext={vi.fn()} onBack={vi.fn()} />);

    act(() => {
      registryHandler?.({
        resource: 'npcs',
        data: [{ profileId: 'npc1', name: 'Blaine', team: { templateId: 't1', name: "Blaine's Team", pokemon: [], createdAt: '2026-01-01T00:00:00Z' }, createdAt: '2026-01-01T00:00:00Z' }],
      });
    });

    const selects = screen.getAllByRole('combobox');
    const npcSelects = selects.filter(
      (s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text.includes('Blaine'))
    );
    fireEvent.change(npcSelects[0]!, { target: { value: 'Blaine' } });
    fireEvent.change(npcSelects[1]!, { target: { value: 'Blaine' } });

    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm the three new tests fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx
```

Expected: "shows ⚠ duplicate badge..." FAILS (no badge in DOM). "does not show duplicate badge..." PASSES (no badge exists). "NEXT remains enabled despite duplicate..." PASSES (NEXT already enabled). The 2 existing tests still pass.

- [ ] **Step 3: Implement the fix in `SlotAssignmentStep.tsx`**

Replace the full contents of `packages/client/src/admin/steps/SlotAssignmentStep.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../../socket.js';

interface SlotConfig {
  slotId: string;
  type: 'player' | 'npc';
  displayName: string;
  profileId?: string;
  defaultTeam?: import('@poke-fighter/shared').PokemonSet[];
}

interface Props {
  teamASlots: number;
  teamBSlots: number;
  onNext: (slots: { teamA: SlotConfig[]; teamB: SlotConfig[] }) => void;
  onBack: () => void;
}

export function SlotAssignmentStep({ teamASlots, teamBSlots, onNext, onBack }: Props) {
  const [waitingPlayers, setWaitingPlayers] = useState<string[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<{ profileId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }[]>([]);
  const [savedNpcs, setSavedNpcs] = useState<{ profileId: string; name: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }[]>([]);
  const [slots, setSlots] = useState<SlotConfig[]>(() => [
    ...Array.from({ length: teamASlots }, (_, i) => ({ slotId: `a${i + 1}`, type: 'player' as const, displayName: '' })),
    ...Array.from({ length: teamBSlots }, (_, i) => ({ slotId: `b${i + 1}`, type: 'npc' as const, displayName: '' })),
  ]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'lobby:list', data: {} } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } } as any);

    socket.on('lobby:players' as any, (players: string[]) => {
      setWaitingPlayers(players);
    });

    socket.on('registry:data' as any, (payload: any) => {
      if (payload.resource === 'players') {
        setSavedPlayers(payload.data.map((p: any) => ({
          profileId: p.profileId,
          displayName: p.displayName,
          defaultTeam: p.defaultTeam?.pokemon,
        })));
      }
      if (payload.resource === 'npcs') setSavedNpcs(payload.data.map((n: any) => ({ profileId: n.profileId, name: n.name, defaultTeam: n.team?.pokemon })));
    });

    return () => {
      socket.off('lobby:players' as any);
      socket.off('registry:data' as any);
    };
  }, []);

  function updateSlot(index: number, update: Partial<SlotConfig>) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  }

  const allFilled = slots.every((s) => s.displayName.trim());

  const usedNames = slots.map((s) => s.displayName).filter(Boolean);
  const duplicateNames = new Set(
    usedNames.filter((name, i) => usedNames.indexOf(name) !== i)
  );

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
          duplicateNames={duplicateNames}
        />
        <TeamColumn
          label="Team B"
          slots={slots.filter((s) => s.slotId.startsWith('b'))}
          startIndex={teamASlots}
          onUpdate={updateSlot}
          waitingPlayers={waitingPlayers}
          savedPlayers={savedPlayers}
          savedNpcs={savedNpcs}
          duplicateNames={duplicateNames}
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

function TeamColumn({ label, slots, startIndex, onUpdate, waitingPlayers, savedPlayers, savedNpcs, duplicateNames }: any) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: '#aaa', fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>{label.toUpperCase()}</div>
      {slots.map((slot: any, i: number) => (
        <SlotRow key={slot.slotId} slot={slot} index={startIndex + i} onUpdate={onUpdate}
          waitingPlayers={waitingPlayers} savedPlayers={savedPlayers} savedNpcs={savedNpcs}
          duplicateNames={duplicateNames} />
      ))}
    </div>
  );
}

function SlotRow({ slot, index, onUpdate, waitingPlayers, savedPlayers, savedNpcs, duplicateNames }: any) {
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
          onChange={(e) => {
            const name = e.target.value;
            const player = savedPlayers.find((p: { profileId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }) => p.displayName === name);
            onUpdate(index, { displayName: name, defaultTeam: player?.defaultTeam });
          }}
          style={selectStyle}
        >
          <option value="">— select player —</option>
          {waitingPlayers.map((name: string) => <option key={name} value={name}>{name} (online)</option>)}
          {savedPlayers.map((p: any) => <option key={p.profileId} value={p.displayName}>{p.displayName} (saved)</option>)}
        </select>
      ) : (
        <select
          value={slot.displayName}
          onChange={(e) => {
            const name = e.target.value;
            const npc = savedNpcs.find((n: { profileId: string; name: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }) => n.name === name);
            onUpdate(index, { displayName: name, defaultTeam: npc?.defaultTeam });
          }}
          style={selectStyle}
        >
          <option value="">— select NPC —</option>
          {savedNpcs.map((n: any) => <option key={n.profileId} value={n.name}>{n.name}</option>)}
        </select>
      )}

      <span style={{ color: slot.displayName ? '#2ecc71' : '#555', fontSize: 12 }}>
        {slot.displayName ? '✓' : '○'}
      </span>
      {duplicateNames?.has(slot.displayName) && (
        <span style={{ color: '#f0c040', fontSize: 10 }}>⚠ duplicate</span>
      )}
    </div>
  );
}

const btnStyle = { color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
const selectStyle = { background: '#1a1a2e', color: '#fff', border: '1px solid #555', padding: '6px 8px', borderRadius: 4, fontFamily: 'inherit', flex: 1 };
```

- [ ] **Step 4: Run tests to confirm all 5 pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run full client test suite to check for regressions**

```
pnpm --filter @poke-fighter/client test
```

Expected: All tests PASS with no failures.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx packages/client/src/admin/steps/SlotAssignmentStep.tsx
git commit -m "feat(client): show duplicate badge in SlotAssignmentStep when same participant selected twice"
```

---

### Task 4: Mark tech-debt plan complete and move file

**Files:**
- Modify: `docs/tech-debt/battle-setup/setup-validation.md`
- Move to: `docs/completed-tech-debt/battle-setup/setup-validation.md`

- [ ] **Step 1: Update state to Complete**

Edit `docs/tech-debt/battle-setup/setup-validation.md` — change `## State` value from `InProgress` to `Complete`.

- [ ] **Step 2: Move file to completed-tech-debt**

```bash
mkdir -p docs/completed-tech-debt/battle-setup
mv docs/tech-debt/battle-setup/setup-validation.md docs/completed-tech-debt/battle-setup/setup-validation.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/tech-debt/battle-setup/setup-validation.md docs/completed-tech-debt/battle-setup/setup-validation.md
git commit -m "docs: mark setup-validation tech debt as complete"
```
