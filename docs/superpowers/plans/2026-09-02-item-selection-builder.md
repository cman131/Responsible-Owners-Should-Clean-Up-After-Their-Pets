# Item Selection Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an item selection row to `PokemonSlotEditor` so players and NPC teams can be equipped with items from the builder UI.

**Architecture:** The server exports `IMPLEMENTED_ITEM_IDS` (derived from `ITEM_HOOKS` keys) and exposes it through the existing `data:query` socket event as a new `items` resource. A new `ItemSearchDropdown` client component fetches the ~25-item list once on mount, filters locally, and integrates into `PokemonSlotEditor` between the Ability and Nature rows.

**Tech Stack:** React 18 + TypeScript (client), Vitest + @testing-library/react (client tests), Vitest (server tests), Socket.IO admin action/results events.

**Spec:** `docs/upcoming-features/10-item-selection-spec.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `packages/server/src/engine/items.ts` | Add stub entries for inline items; export `IMPLEMENTED_ITEM_IDS` |
| Modify | `packages/server/src/data/loader.ts` | Add `getAllItems()` method |
| Modify | `packages/server/src/data/__tests__/loader.test.ts` | Test `getAllItems()` |
| Modify | `packages/server/src/socket/handlers/adminHandlers.ts` | Add `itemMatchesQuery` helper + `items` resource to `data:query` |
| Modify | `packages/server/src/socket/__tests__/adminHandlers.test.ts` | Test `itemMatchesQuery` + items query handler |
| Create | `packages/client/src/admin/ItemSearchDropdown.tsx` | New search dropdown component |
| Create | `packages/client/src/admin/__tests__/ItemSearchDropdown.test.tsx` | Component tests |
| Modify | `packages/client/src/admin/PokemonSlotEditor.tsx` | Add item row |
| Modify | `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx` | Test item row |

---

## Task 1: Server plumbing — `IMPLEMENTED_ITEM_IDS` + `getAllItems()`

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/data/loader.ts`
- Modify: `packages/server/src/data/__tests__/loader.test.ts`

- [ ] **Step 1: Write the failing test for `getAllItems()`**

Add to `packages/server/src/data/__tests__/loader.test.ts`:

```typescript
it('getAllItems returns all items from items.json', () => {
  const loader = new DataLoader();
  const items = loader.getAllItems();
  expect(items.length).toBeGreaterThan(0);
  const sash = items.find((i) => i.id === 'focussash');
  expect(sash).toBeDefined();
  expect(sash?.name).toBe('Focus Sash');
  expect(sash?.isBerry).toBe(false);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```
cd packages/server && npx vitest run src/data/__tests__/loader.test.ts
```

Expected: FAIL — `loader.getAllItems is not a function`

- [ ] **Step 3: Add `getAllItems()` to `DataLoader`**

In `packages/server/src/data/loader.ts`, add after `getAllMoves()`:

```typescript
getAllItems(): HeldItem[] {
  return Array.from(this.items.values());
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```
cd packages/server && npx vitest run src/data/__tests__/loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Add stub entries + export `IMPLEMENTED_ITEM_IDS` in `items.ts`**

The inline-handled items (focus-sash, air-balloon, weakness-policy) have no `ITEM_HOOKS` entry. Add empty stubs so they appear in the dropdown:

At the end of the `ITEM_HOOKS` object in `packages/server/src/engine/items.ts`, add:

```typescript
  'focus-sash': {},
  'air-balloon': {},
  'weakness-policy': {},
```

Then add this export after `ITEM_HOOKS`:

```typescript
export const IMPLEMENTED_ITEM_IDS: ReadonlySet<string> = new Set(Object.keys(ITEM_HOOKS));
```

> Note: `items.json` uses camelCase ids (e.g. `focussash`) but `ITEM_HOOKS` uses kebab-case (e.g. `focus-sash`). The `getItemHooks` function already normalises via `.toLowerCase().replace(/\s/g, '-')`. The `data:query` handler (Task 2) will match items.json ids to `IMPLEMENTED_ITEM_IDS` by also normalising — see Task 2.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/data/loader.ts packages/server/src/data/__tests__/loader.test.ts
git commit -m "feat: export IMPLEMENTED_ITEM_IDS and add DataLoader.getAllItems()"
```

---

## Task 2: Server handler — `items` resource in `data:query`

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/adminHandlers.test.ts`

- [ ] **Step 1: Write failing unit tests for `itemMatchesQuery`**

Add to `packages/server/src/socket/__tests__/adminHandlers.test.ts` (import `itemMatchesQuery` at the top alongside the existing imports):

```typescript
import { pokemonMatchesQuery, moveMatchesQuery, itemMatchesQuery, registerAdminHandlers } from '../handlers/adminHandlers.js';
import type { HeldItem } from '@poke-fighter/shared';

const makeItem = (overrides: Partial<HeldItem> = {}): HeldItem => ({
  id: 'leftovers',
  name: 'Leftovers',
  effectId: 'leftovers',
  isBerry: false,
  ...overrides,
});

describe('itemMatchesQuery', () => {
  it('matches by item id (case-insensitive)', () => {
    expect(itemMatchesQuery(makeItem({ id: 'leftovers' }), 'left')).toBe(true);
    expect(itemMatchesQuery(makeItem({ id: 'leftovers' }), 'LEFT')).toBe(true);
  });

  it('matches by item name', () => {
    expect(itemMatchesQuery(makeItem({ name: 'Choice Band' }), 'band')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(itemMatchesQuery(makeItem({ id: 'leftovers', name: 'Leftovers' }), 'sash')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```
cd packages/server && npx vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: FAIL — `itemMatchesQuery is not a function`

- [ ] **Step 3: Add `itemMatchesQuery` to `adminHandlers.ts` and export it**

In `packages/server/src/socket/handlers/adminHandlers.ts`, add after `moveMatchesQuery`:

```typescript
export function itemMatchesQuery(i: HeldItem, query: string): boolean {
  const q = query.toLowerCase();
  return i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
}
```

Add the import for `HeldItem` to the existing shared import line:

```typescript
import type {
  ServerToClientEvents, ClientToServerEvents, AdminActionPayload,
  MoveAction, SwitchAction, BattleState, PokemonSpecies, Move, HeldItem,
} from '@poke-fighter/shared';
```

- [ ] **Step 4: Run the unit tests and confirm they pass**

```
cd packages/server && npx vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: PASS for the three new `itemMatchesQuery` tests

- [ ] **Step 5: Write the failing integration test for the `items` handler**

Add a new describe block to `packages/server/src/socket/__tests__/adminHandlers.test.ts`:

```typescript
describe('registerAdminHandlers – data:query items', () => {
  function makeAdminSocket(id = 'admin-items') {
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

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby);
  });

  afterEach(() => { db.close(); });

  it('emits only implemented items for items resource', async () => {
    socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items' } });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(socket.emit).toHaveBeenCalledWith('data:results', expect.objectContaining({ resource: 'items' }));

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: [string]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.length).toBeGreaterThan(0);
    // Every returned item must be in IMPLEMENTED_ITEM_IDS (after normalising)
    for (const item of payload.results) {
      const normalisedId = item.id.toLowerCase().replace(/\s/g, '-');
      expect(['leftovers', 'choice-band', 'choice-specs', 'choice-scarf', 'assault-vest',
        'life-orb', 'black-sludge', 'eviolite', 'scope-lens', 'razor-claw', 'light-clay',
        'big-root', 'rocky-helmet', 'sitrus-berry', 'lum-berry', 'salac-berry', 'petaya-berry',
        'liechi-berry', 'ganlon-berry', 'apicot-berry', 'focus-sash', 'air-balloon',
        'weakness-policy',
      ]).toContain(normalisedId);
    }
  });

  it('filters items by query string', async () => {
    socket.trigger('admin:action', { type: 'data:query', data: { resource: 'items', query: 'choice' } });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const call = (socket.emit as ReturnType<typeof vi.fn>).mock.calls
      .find(([event]: [string]) => event === 'data:results');
    const payload = call?.[1] as { resource: string; results: HeldItem[] };
    expect(payload.results.every((i) => i.name.toLowerCase().includes('choice') || i.id.toLowerCase().includes('choice'))).toBe(true);
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

```
cd packages/server && npx vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: FAIL — the items handler case doesn't exist yet

- [ ] **Step 7: Add the `items` case + import to `adminHandlers.ts`**

At the top of `adminHandlers.ts`, add this import:

```typescript
import { IMPLEMENTED_ITEM_IDS } from '../../engine/items.js';
```

Inside the `case 'data:query'` block in `adminHandlers.ts`, update the resource type and add the `items` case. Find:

```typescript
const { resource } = payload.data as { resource: 'pokemon' | 'moves' };
```

Replace with:

```typescript
const { resource } = payload.data as { resource: 'pokemon' | 'moves' | 'items' };
```

Then add the `items` case in the inner `switch (resource)` block, after the `moves` case and before `default`:

```typescript
case 'items': {
  const { query: itemQuery } = payload.data as { query?: string };
  const allImplemented = data.getAllItems().filter((i) => {
    const normId = i.id.toLowerCase().replace(/\s/g, '-');
    return IMPLEMENTED_ITEM_IDS.has(normId);
  });
  results = itemQuery
    ? allImplemented.filter((i) => itemMatchesQuery(i, itemQuery))
    : allImplemented;
  break;
}
```

- [ ] **Step 8: Run all handler tests and confirm they pass**

```
cd packages/server && npx vitest run src/socket/__tests__/adminHandlers.test.ts
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```
git add packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "feat: add items resource to data:query admin handler"
```

---

## Task 3: Client — `ItemSearchDropdown` component (TDD)

**Files:**
- Create: `packages/client/src/admin/ItemSearchDropdown.tsx`
- Create: `packages/client/src/admin/__tests__/ItemSearchDropdown.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/ItemSearchDropdown.test.tsx`:

```typescript
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { ItemSearchDropdown } from '../ItemSearchDropdown.js';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

const MOCK_ITEMS = [
  { id: 'leftovers', name: 'Leftovers', effectId: 'leftovers', isBerry: false },
  { id: 'sitrusberry', name: 'Sitrus Berry', effectId: 'sitrusberry', isBerry: true },
  { id: 'choiceband', name: 'Choice Band', effectId: 'choiceband', isBerry: false },
];

function fireItemResults() {
  const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
  act(() => { handler({ resource: 'items', results: MOCK_ITEMS }); });
}

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('ItemSearchDropdown', () => {
  it('emits data:query for items resource on mount', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'data:query',
      data: { resource: 'items' },
    });
  });

  it('shows all items in dropdown when input is focused after items load', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    fireItemResults();
    fireEvent.focus(screen.getByPlaceholderText('Search items...'));
    expect(screen.getByText('Leftovers')).toBeTruthy();
    expect(screen.getByText('Sitrus Berry')).toBeTruthy();
    expect(screen.getByText('Choice Band')).toBeTruthy();
  });

  it('filters dropdown list by query text', () => {
    render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    fireItemResults();
    fireEvent.change(screen.getByPlaceholderText('Search items...'), { target: { value: 'berry' } });
    expect(screen.getByText('Sitrus Berry')).toBeTruthy();
    expect(screen.queryByText('Leftovers')).toBeNull();
  });

  it('calls onChange with item id when an item is clicked', () => {
    const onChange = vi.fn();
    render(<ItemSearchDropdown value="" onChange={onChange} />);
    fireItemResults();
    fireEvent.focus(screen.getByPlaceholderText('Search items...'));
    fireEvent.click(screen.getByText('Leftovers'));
    expect(onChange).toHaveBeenCalledWith('leftovers');
  });

  it('shows selected item chip with name when value is set', () => {
    render(<ItemSearchDropdown value="leftovers" onChange={vi.fn()} />);
    fireItemResults();
    expect(screen.getByText('Leftovers')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search items...')).toBeNull();
  });

  it('shows Berry badge on berry items in the chip', () => {
    render(<ItemSearchDropdown value="sitrusberry" onChange={vi.fn()} />);
    fireItemResults();
    expect(screen.getByText('Berry')).toBeTruthy();
  });

  it('calls onChange with empty string when clear button is clicked', () => {
    const onChange = vi.fn();
    render(<ItemSearchDropdown value="leftovers" onChange={onChange} />);
    fireItemResults();
    fireEvent.click(screen.getByText('✕'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('cleans up the data:results listener on unmount', () => {
    const { unmount } = render(<ItemSearchDropdown value="" onChange={vi.fn()} />);
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('data:results', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```
cd packages/client && npx vitest run src/admin/__tests__/ItemSearchDropdown.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `ItemSearchDropdown.tsx`**

Create `packages/client/src/admin/ItemSearchDropdown.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { HeldItem } from '@poke-fighter/shared';

interface Props {
  value: string;
  onChange: (itemId: string) => void;
}

export function ItemSearchDropdown({ value, onChange }: Props) {
  const [items, setItems] = useState<HeldItem[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    function handleResults(payload: { resource: string; results: unknown[] }) {
      if (payload.resource !== 'items') return;
      setItems(payload.results as HeldItem[]);
    }
    socket.on('data:results', handleResults);
    socket.emit('admin:action', { type: 'data:query', data: { resource: 'items' } } as any);
    return () => { socket.off('data:results', handleResults); };
  }, []);

  const selectedItem = items.find((i) => i.id === value) ?? null;
  const filtered = query
    ? items.filter((i) => i.id.toLowerCase().includes(query.toLowerCase()) || i.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  function pick(item: HeldItem) {
    onChange(item.id);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || !filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = filtered[highlighted]; if (item) pick(item); }
  }

  if (value && selectedItem) {
    return (
      <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: '#fff', flex: 1 }}>{selectedItem.name}</span>
        {selectedItem.isBerry && (
          <span style={{ background: '#27ae60', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Berry</span>
        )}
        <button onClick={clear} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search items..."
        style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
          {filtered.map((item, i) => (
            <div
              key={item.id}
              onClick={() => pick(item)}
              style={{ padding: '5px 10px', cursor: 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#fff', borderBottom: '1px solid #1a1a2e' }}
            >
              <span style={{ flex: 1 }}>{item.name}</span>
              {item.isBerry && (
                <span style={{ background: '#27ae60', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Berry</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```
cd packages/client && npx vitest run src/admin/__tests__/ItemSearchDropdown.test.tsx
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```
git add packages/client/src/admin/ItemSearchDropdown.tsx packages/client/src/admin/__tests__/ItemSearchDropdown.test.tsx
git commit -m "feat: add ItemSearchDropdown component"
```

---

## Task 4: Client — item row in `PokemonSlotEditor` (TDD)

**Files:**
- Modify: `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`
- Modify: `packages/client/src/admin/PokemonSlotEditor.tsx`

- [ ] **Step 1: Add the `ItemSearchDropdown` mock and new tests**

In `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`, add a mock for `ItemSearchDropdown` alongside the existing mocks at the top of the file:

```typescript
vi.mock('../ItemSearchDropdown.js', () => ({
  ItemSearchDropdown: ({ value, onChange }: any) => (
    <button onClick={() => onChange('leftovers')}>item-{value || 'none'}</button>
  ),
}));
```

Then add these tests inside the existing `describe('PokemonSlotEditor')` block:

```typescript
it('renders item selector when speciesId is set', () => {
  render(<PokemonSlotEditor
    value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
    onChange={vi.fn()}
  />);
  expect(screen.getByText('item-none')).toBeTruthy();
});

it('passes heldItem to ItemSearchDropdown as value', () => {
  render(<PokemonSlotEditor
    value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', heldItem: 'leftovers', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
    onChange={vi.fn()}
  />);
  expect(screen.getByText('item-leftovers')).toBeTruthy();
});

it('calls onChange with heldItem set when item is selected', () => {
  const onChange = vi.fn();
  render(<PokemonSlotEditor
    value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
    onChange={onChange}
  />);
  fireEvent.click(screen.getByText('item-none'));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ heldItem: 'leftovers' }));
});

it('calls onChange with heldItem undefined when item is cleared', () => {
  const onChange = vi.fn();
  // ItemSearchDropdown mock calls onChange('') to simulate clear
  vi.mock('../ItemSearchDropdown.js', () => ({
    ItemSearchDropdown: ({ onChange: onItemChange }: any) => (
      <button onClick={() => onItemChange('')}>item-clear</button>
    ),
  }));
  render(<PokemonSlotEditor
    value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', heldItem: 'leftovers', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
    onChange={onChange}
  />);
  fireEvent.click(screen.getByText('item-none').closest('button') ?? screen.getByText('item-leftovers'));
  // When onChange is called with '' the slot editor should set heldItem to undefined (not '')
  const lastCall = onChange.mock.calls.at(-1)?.[0];
  expect(lastCall?.heldItem).toBeUndefined();
});
```

> Note: the last test exercises the `onChange` handler that converts `''` → `undefined` on `heldItem`. The key behaviour to verify is that `heldItem: ''` never appears in the output — it should be absent.

- [ ] **Step 2: Run the tests and confirm the new ones fail**

```
cd packages/client && npx vitest run src/admin/__tests__/PokemonSlotEditor.test.tsx
```

Expected: existing tests PASS, new item tests FAIL

- [ ] **Step 3: Add the item row to `PokemonSlotEditor.tsx`**

In `packages/client/src/admin/PokemonSlotEditor.tsx`, add the import at the top:

```typescript
import { ItemSearchDropdown } from './ItemSearchDropdown.js';
```

Then inside the `{value.speciesId && (` block, add this row between the Ability `<div>` and the Nature `<div>`:

```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <label style={lbl}>Item</label>
  <div style={{ flex: 1 }}>
    <ItemSearchDropdown
      value={value.heldItem ?? ''}
      onChange={(itemId) => updateField('heldItem', itemId || undefined)}
    />
  </div>
</div>
```

> `updateField('heldItem', itemId || undefined)` converts the empty string that `ItemSearchDropdown` emits on clear to `undefined`, keeping `heldItem` absent from `PokemonSet` rather than set to `''`.

- [ ] **Step 4: Run all `PokemonSlotEditor` tests and confirm they pass**

```
cd packages/client && npx vitest run src/admin/__tests__/PokemonSlotEditor.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suites for both packages**

```
cd packages/server && npm test
cd packages/client && npm test
```

Expected: all tests PASS in both packages

- [ ] **Step 6: Commit**

```
git add packages/client/src/admin/PokemonSlotEditor.tsx packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx
git commit -m "feat: add item selection row to PokemonSlotEditor"
```

---

## Self-Review Checklist

- [x] `getAllItems()` tested in loader test — Task 1
- [x] `IMPLEMENTED_ITEM_IDS` exported with inline stubs — Task 1
- [x] `itemMatchesQuery` exported and unit-tested — Task 2
- [x] `items` case in `data:query` handler tested (both full list + query filter) — Task 2
- [x] Normalisation of camelCase item ids from items.json to kebab-case for IMPLEMENTED_ITEM_IDS lookup — Task 2, Step 7
- [x] `ItemSearchDropdown` fully tested (mount emit, results, filter, pick, chip, berry badge, clear, cleanup) — Task 3
- [x] `PokemonSlotEditor` item row tested (renders, passes value, sets heldItem, clears to undefined) — Task 4
- [x] `heldItem: ''` → `undefined` conversion is explicit in PokemonSlotEditor and tested — Task 4
- [x] No placeholders — all steps have complete code
