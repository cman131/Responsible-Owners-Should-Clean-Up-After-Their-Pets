# Move Search Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four plain-text move ID inputs in TeamBuilder with searchable dropdown components that filter a Pokémon's learnset by default, prevent duplicate move selection, and optionally search all moves in the game via server-side text search.

**Architecture:** A new `MoveSearchDropdown` component fetches the species learnset once on mount and filters client-side. A per-slot checkbox switches to server-side all-moves text search (≥2 chars, top 30 results). The server `moves` handler is extended to support both call shapes. TeamBuilder wires up four independent instances. Duplicate detection uses `selectedMoves` prop comparison at render time.

**Tech Stack:** React 18, Vitest, @testing-library/react, Socket.IO client, TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/server/src/data/loader.ts` | Modify | Add `getAllMoves()` method |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Modify | Export `moveMatchesQuery`, extend `moves` case |
| `packages/server/src/socket/__tests__/adminHandlers.test.ts` | Modify | Tests for `moveMatchesQuery` |
| `packages/server/src/data/__tests__/loader.test.ts` | Modify | Test for `getAllMoves` |
| `packages/client/src/admin/MoveSearchDropdown.tsx` | Create | New search dropdown component |
| `packages/client/src/admin/__tests__/MoveSearchDropdown.test.tsx` | Create | Component tests |
| `packages/client/src/admin/TeamBuilder.tsx` | Modify | Wire in four `MoveSearchDropdown` instances |

---

## Task 1: Extend server — `getAllMoves`, `moveMatchesQuery`, updated handler

**Files:**
- Modify: `packages/server/src/data/loader.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/adminHandlers.test.ts`
- Modify: `packages/server/src/data/__tests__/loader.test.ts`

- [ ] **Step 1: Write failing tests for `moveMatchesQuery` and `getAllMoves`**

In `packages/server/src/socket/__tests__/adminHandlers.test.ts`, add after the existing import line:

```ts
import { pokemonMatchesQuery, moveMatchesQuery } from '../handlers/adminHandlers.js';
import type { Move } from '@poke-fighter/shared';

const makeMove = (overrides: Partial<Move> = {}): Move => ({
  id: 'flamethrower',
  name: 'Flamethrower',
  type: 'Fire',
  category: 'special',
  basePower: 90,
  accuracy: 100,
  pp: 15,
  priority: 0,
  target: 'normal',
  makesContact: false,
  ...overrides,
});

describe('moveMatchesQuery', () => {
  it('matches by move id (case-insensitive)', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'flame')).toBe(true);
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower' }), 'FLAME')).toBe(true);
  });

  it('matches by move name', () => {
    expect(moveMatchesQuery(makeMove({ name: 'Flamethrower' }), 'thrower')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(moveMatchesQuery(makeMove({ id: 'flamethrower', name: 'Flamethrower' }), 'tackle')).toBe(false);
  });
});
```

In `packages/server/src/data/__tests__/loader.test.ts`, add inside the existing `describe('DataLoader', ...)` block:

```ts
it('getAllMoves returns all loaded moves including flamethrower', () => {
  const loader = new DataLoader();
  const moves = loader.getAllMoves();
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.some((m) => m.id === 'flamethrower')).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `moveMatchesQuery` not exported, `getAllMoves` not defined.

- [ ] **Step 3: Add `getAllMoves` to DataLoader**

In `packages/server/src/data/loader.ts`, add after the `getAllSpecies()` method (after line 67):

```ts
getAllMoves(): Move[] {
  return Array.from(this.moves.values());
}
```

- [ ] **Step 4: Export `moveMatchesQuery` and update the `moves` handler**

In `packages/server/src/socket/handlers/adminHandlers.ts`:

**Add `Move` to the import** (update line 3):
```ts
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move,
} from '@poke-fighter/shared';
```

**Add `moveMatchesQuery` export** after `pokemonMatchesQuery` (after line 12):
```ts
export function moveMatchesQuery(m: Move, query: string): boolean {
  const q = query.toLowerCase();
  return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
}
```

**Replace the existing `case 'moves':` block** (lines 62–65):

Remove:
```ts
case 'moves': {
  const species = data.getSpecies(Number(query));
  results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
  break;
}
```

Replace with:
```ts
case 'moves': {
  const { speciesId, query: moveQuery } = payload.data as { resource: 'moves'; speciesId?: number; query?: string };
  if (speciesId !== undefined) {
    const species = data.getSpecies(speciesId);
    results = (species?.learnset ?? []).map((id) => data.getMove(id)).filter(Boolean);
  } else if (moveQuery) {
    results = data.getAllMoves().filter((m) => moveMatchesQuery(m, moveQuery)).slice(0, 30);
  } else {
    results = [];
  }
  break;
}
```

- [ ] **Step 5: Run tests and verify they pass**

```
pnpm --filter @poke-fighter/server test
```

Expected: All server tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/data/loader.ts packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts packages/server/src/data/__tests__/loader.test.ts
git commit -m "feat(server): add getAllMoves, moveMatchesQuery, extend moves handler for text search"
```

---

## Task 2: Build `MoveSearchDropdown` component

**Files:**
- Create: `packages/client/src/admin/__tests__/MoveSearchDropdown.test.tsx`
- Create: `packages/client/src/admin/MoveSearchDropdown.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/MoveSearchDropdown.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { MoveSearchDropdown } from '../MoveSearchDropdown.js';
import type { Move } from '@poke-fighter/shared';

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

const flamethrower: Move = {
  id: 'flamethrower', name: 'Flamethrower', type: 'Fire', category: 'special',
  basePower: 90, accuracy: 100, pp: 15, priority: 0, target: 'normal', makesContact: false,
};
const icebeam: Move = {
  id: 'icebeam', name: 'Ice Beam', type: 'Ice', category: 'special',
  basePower: 90, accuracy: 100, pp: 10, priority: 0, target: 'normal', makesContact: false,
};

const defaultProps = {
  speciesId: 6,
  value: '',
  selectedMoves: ['', '', '', ''],
  onChange: vi.fn(),
};

describe('MoveSearchDropdown', () => {
  it('emits data:query for the species learnset on mount', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', speciesId: 6 }) })
    );
  });

  it('shows all learnset results when the input is focused', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.getByText('Ice Beam')).toBeTruthy();
  });

  it('filters learnset client-side without emitting to the server', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search moves/i), { target: { value: 'flame' } });
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.queryByText('Ice Beam')).toBeNull();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('marks moves already in selectedMoves as unselectable with "already picked" label', () => {
    render(<MoveSearchDropdown {...defaultProps} selectedMoves={['flamethrower', '', '', '']} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    expect(screen.getByText('already picked')).toBeTruthy();
  });

  it('calls onChange with move id when a result is clicked', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    fireEvent.focus(screen.getByPlaceholderText(/search moves/i));
    fireEvent.click(screen.getByText('Flamethrower'));
    expect(onChange).toHaveBeenCalledWith('flamethrower');
  });

  it('shows selected-state summary row when value is non-empty and learnset loaded', () => {
    render(<MoveSearchDropdown {...defaultProps} value='flamethrower' />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search moves/i)).toBeNull();
  });

  it('clear button calls onChange with empty string', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} value='flamethrower' onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    fireEvent.click(screen.getByText('✕'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('emits server query in all-moves mode when 2+ chars typed', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [] }); });
    fireEvent.click(screen.getByRole('checkbox'));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search all moves/i), { target: { value: 'fl' } });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', query: 'fl' }) })
    );
  });

  it('does not emit in all-moves mode for fewer than 2 chars', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [] }); });
    fireEvent.click(screen.getByRole('checkbox'));
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/search all moves/i), { target: { value: 'f' } });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onChange = vi.fn();
    render(<MoveSearchDropdown {...defaultProps} onChange={onChange} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower, icebeam] }); });
    const input = screen.getByPlaceholderText(/search moves/i);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('icebeam');
  });

  it('closes dropdown on Escape', () => {
    render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    const input = screen.getByPlaceholderText(/search moves/i);
    fireEvent.focus(input);
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Flamethrower')).toBeNull();
  });

  it('re-fetches learnset when speciesId prop changes', () => {
    const { rerender } = render(<MoveSearchDropdown {...defaultProps} />);
    act(() => { dataResultsHandler?.({ resource: 'moves', results: [flamethrower] }); });
    rerender(<MoveSearchDropdown {...defaultProps} speciesId={9} />);
    expect(mockSocket.emit).toHaveBeenLastCalledWith(
      'admin:action',
      expect.objectContaining({ type: 'data:query', data: expect.objectContaining({ resource: 'moves', speciesId: 9 }) })
    );
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```
pnpm --filter @poke-fighter/client test -- MoveSearchDropdown
```

Expected: FAIL — module `MoveSearchDropdown.js` not found.

- [ ] **Step 3: Implement the component**

Create `packages/client/src/admin/MoveSearchDropdown.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../socket.js';
import type { Move } from '@poke-fighter/shared';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  speciesId: number;
  value: string;
  selectedMoves: string[];
  onChange: (moveId: string) => void;
}

const CAT: Record<string, string> = { physical: 'Ph', special: 'Sp', status: 'St' };
const CAT_COLOR: Record<string, string> = { physical: '#c03028', special: '#6890f0', status: '#888' };

export function MoveSearchDropdown({ speciesId, value, selectedMoves, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Move[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [allMovesMode, setAllMovesMode] = useState(false);
  const [learnsetCache, setLearnsetCache] = useState<Move[]>([]);
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [open, setOpen] = useState(false);
  const allModeRef = useRef(false);

  useEffect(() => { allModeRef.current = allMovesMode; }, [allMovesMode]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      if (payload.resource !== 'moves') return;
      const moves = payload.results as Move[];
      if (!allModeRef.current) setLearnsetCache(moves);
      setResults(moves);
      setHighlighted(0);
    };
    socket.on('data:results' as any, handler);
    return () => { socket.off('data:results' as any, handler); };
  }, []);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setLearnsetCache([]);
    setSelectedMove(null);
    setAllMovesMode(false);
    allModeRef.current = false;
    setOpen(false);
    getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'moves', speciesId } } as any);
  }, [speciesId]);

  function handleFocus() {
    if (!allMovesMode) { setResults(learnsetCache); setOpen(true); }
  }

  function handleChange(q: string) {
    setQuery(q);
    if (allMovesMode) {
      if (q.length >= 2) {
        getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'moves', query: q } } as any);
      } else {
        setResults([]);
      }
    } else {
      const lower = q.toLowerCase();
      setResults(q ? learnsetCache.filter((m) => m.id.includes(lower) || m.name.toLowerCase().includes(lower)) : learnsetCache);
      setOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const m = results[highlighted];
      if (m && !(m.id !== value && selectedMoves.includes(m.id))) pick(m);
    }
  }

  function pick(move: Move) {
    setSelectedMove(move);
    onChange(move.id);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function clear() {
    setSelectedMove(null);
    onChange('');
    setResults(learnsetCache);
    setOpen(false);
  }

  function toggleAllMovesMode(checked: boolean) {
    setAllMovesMode(checked);
    allModeRef.current = checked;
    setQuery('');
    setResults(checked ? [] : learnsetCache);
    setOpen(!checked);
  }

  const displayMove = selectedMove ?? learnsetCache.find((m) => m.id === value) ?? null;

  if (value && displayMove) {
    return (
      <div>
        <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: '#fff', flex: 1 }}>{displayMove.name}</span>
          <span style={{ background: TYPE_COLORS[displayMove.type] ?? '#555', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{displayMove.type}</span>
          <span style={{ background: CAT_COLOR[displayMove.category] ?? '#888', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{CAT[displayMove.category]}</span>
          <span style={{ color: '#aaa', fontSize: 10 }}>{displayMove.basePower > 0 ? displayMove.basePower : '—'}</span>
          <button onClick={clear} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <input type="checkbox" checked={false} onChange={() => {}} disabled />
          <span style={{ fontSize: 10, color: '#444' }}>Search all moves</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={allMovesMode ? 'Search all moves...' : 'Search moves...'}
        style={{ background: '#1a1a2e', border: `1px solid ${allMovesMode ? '#f0c040' : '#555'}`, color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
          {results.map((m, i) => {
            const alreadyPicked = m.id !== value && selectedMoves.includes(m.id);
            return (
              <div
                key={m.id}
                onClick={() => { if (!alreadyPicked) pick(m); }}
                style={{ padding: '5px 10px', cursor: alreadyPicked ? 'not-allowed' : 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: alreadyPicked ? '#555' : '#fff', borderBottom: '1px solid #1a1a2e' }}
              >
                <span style={{ flex: 1, textDecoration: alreadyPicked ? 'line-through' : 'none' }}>{m.name}</span>
                <span style={{ background: TYPE_COLORS[m.type] ?? '#555', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, opacity: alreadyPicked ? 0.4 : 1 }}>{m.type}</span>
                <span style={{ background: CAT_COLOR[m.category] ?? '#888', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, opacity: alreadyPicked ? 0.4 : 1 }}>{CAT[m.category]}</span>
                <span style={{ color: '#aaa', minWidth: 24, textAlign: 'right' }}>{m.basePower > 0 ? m.basePower : '—'}</span>
                <span style={{ color: '#555', minWidth: 30, textAlign: 'right' }}>{m.pp}pp</span>
                {alreadyPicked && <span style={{ fontSize: 9 }}>already picked</span>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <input type="checkbox" checked={allMovesMode} onChange={(e) => toggleAllMovesMode(e.target.checked)} />
        <span style={{ fontSize: 10, color: allMovesMode ? '#f0c040' : '#555' }}>Search all moves</span>
        {allMovesMode && <span style={{ fontSize: 10, color: '#444' }}>(type ≥ 2 chars)</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```
pnpm --filter @poke-fighter/client test -- MoveSearchDropdown
```

Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/MoveSearchDropdown.tsx packages/client/src/admin/__tests__/MoveSearchDropdown.test.tsx
git commit -m "feat(admin): add MoveSearchDropdown with learnset search, all-moves mode, duplicate prevention"
```

---

## Task 3: Wire `MoveSearchDropdown` into TeamBuilder

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`

- [ ] **Step 1: Add the import**

In `packages/client/src/admin/TeamBuilder.tsx`, add after line 4 (the existing imports):

```ts
import { MoveSearchDropdown } from './MoveSearchDropdown.js';
```

- [ ] **Step 2: Replace the four move text inputs**

In `TeamBuilder.tsx`, find and replace the moves section (lines 100–113):

**Remove:**
```tsx
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
```

**Replace with:**
```tsx
<div>
  <label style={lbl}>Moves</label>
  {[0, 1, 2, 3].map((mi) => (
    <div key={mi} style={{ marginBottom: 8 }}>
      <MoveSearchDropdown
        speciesId={team[selectedSlot]!.speciesId!}
        value={((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])[mi] ?? ''}
        selectedMoves={(team[selectedSlot]?.moves ?? ['', '', '', '']) as string[]}
        onChange={(moveId) => {
          const moves = [...((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])];
          moves[mi] = moveId;
          updateSlotField(selectedSlot, 'moves', moves as [string, string, string, string]);
        }}
      />
    </div>
  ))}
</div>
```

- [ ] **Step 3: Run full client test suite**

```
pnpm --filter @poke-fighter/client test
```

Expected: All tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/admin/TeamBuilder.tsx
git commit -m "feat(admin): replace move text inputs with MoveSearchDropdown in TeamBuilder"
```
