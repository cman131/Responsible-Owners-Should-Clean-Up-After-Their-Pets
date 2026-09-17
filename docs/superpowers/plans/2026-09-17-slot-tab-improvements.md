# TeamBuilder Slot Tab Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic slot count, reorder arrows, slot compaction on clear, and completeness color indicators to TeamBuilder's slot tab strip.

**Architecture:** All changes stay in `TeamBuilder.tsx` (inline approach). A `slotStatus` pure function drives border colors. `handleSlotChange` and `handleSendToBank` compact the array on clear. A new `handleSwap` swaps adjacent slots. `PokemonSlotEditor` gets a one-line no-moves warning.

**Tech Stack:** React (useState, useEffect), @testing-library/react, Vitest

---

## File Map

| File | Change |
|------|--------|
| `packages/client/src/admin/TeamBuilder.tsx` | Export `slotStatus`, add `handleSwap`, rewrite tab strip rendering, update compaction in handlers |
| `packages/client/src/admin/PokemonSlotEditor.tsx` | Add inline ⚠ warning when no moves set |
| `packages/client/src/admin/__tests__/TeamBuilder.test.tsx` | New test suites for slotStatus, tab strip, compaction, reorder |
| `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx` | Two new tests for the warning |

---

### Task 1: Export slotStatus and test it

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`
- Modify: `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`

- [ ] **Step 1: Add `slotStatus` as a named export in `TeamBuilder.tsx`**

  Insert this block after the imports and before `interface Props`:

  ```tsx
  export function slotStatus(p: Partial<PokemonSet> | undefined): 'empty' | 'incomplete' | 'complete' {
    if (!p?.speciesId) return 'empty';
    if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
    return 'complete';
  }
  ```

- [ ] **Step 2: Write tests in `TeamBuilder.test.tsx`**

  Add `slotStatus` to the existing import, and add a new describe block after the existing ones:

  ```tsx
  import { TeamBuilder, slotStatus } from '../TeamBuilder.js';
  ```

  ```tsx
  describe('slotStatus', () => {
    it('returns empty for undefined', () => {
      expect(slotStatus(undefined)).toBe('empty');
    });
    it('returns empty for slot with no speciesId', () => {
      expect(slotStatus({})).toBe('empty');
    });
    it('returns incomplete for slot with speciesId but no moves array', () => {
      expect(slotStatus({ speciesId: 6 })).toBe('incomplete');
    });
    it('returns incomplete for slot with speciesId and all-empty moves', () => {
      expect(slotStatus({ speciesId: 6, moves: ['', '', '', ''] })).toBe('incomplete');
    });
    it('returns complete for slot with speciesId and at least one non-empty move', () => {
      expect(slotStatus({ speciesId: 6, moves: ['flamethrower', '', '', ''] })).toBe('complete');
    });
  });
  ```

- [ ] **Step 3: Run tests and confirm they pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: all slotStatus tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/client/src/admin/TeamBuilder.tsx packages/client/src/admin/__tests__/TeamBuilder.test.tsx
  git commit -m "feat: export slotStatus helper for slot completeness"
  ```

---

### Task 2: Dynamic slot count and completeness borders

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`
- Modify: `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add this describe block to `TeamBuilder.test.tsx`:

  ```tsx
  describe('TeamBuilder tab strip', () => {
    it('shows only + Add tab when no initialTeam provided', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} />);
      expect(screen.getByText('+ Add')).toBeTruthy();
      expect(screen.queryByText('Slot 2')).toBeNull();
      expect(screen.queryByText('Slot 3')).toBeNull();
    });

    it('shows filled tab and + Add for a single-pokemon team', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
      expect(screen.getByText('Pikachu')).toBeTruthy();
      expect(screen.getByText('+ Add')).toBeTruthy();
      expect(screen.queryByText('Slot 3')).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm they fail**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: the two new tab strip tests fail (currently renders 6 fixed slots with "Slot N" labels).

- [ ] **Step 3: Add computed constants before the `return` in `TeamBuilder`**

  Insert these two lines directly above the `return (` in the `TeamBuilder` function body:

  ```tsx
  const filledCount = team.filter(s => !!s.speciesId).length;
  const visibleSlots = Math.min(filledCount + 1, 6);
  ```

- [ ] **Step 4: Replace the tab strip JSX**

  Replace the entire `<div style={{ display: 'flex', gap: 4 }}>` block that currently renders 6 fixed tab buttons with:

  ```tsx
  <div style={{ display: 'flex', gap: 4 }}>
    {Array.from({ length: visibleSlots }, (_, i) => {
      const status = slotStatus(team[i]);
      const isSelected = selectedSlot === i;
      const borderColor =
        status === 'complete'   ? '#27ae60' :
        status === 'incomplete' ? '#f0c040' :
        isSelected              ? '#3498db' : '#333';
      const label = team[i]?.speciesId
        ? (team[i]!.nickname ?? `#${team[i]!.speciesId}`)
        : i < visibleSlots - 1 ? `Slot ${i + 1}` : '+ Add';

      return (
        <button
          key={i}
          onClick={() => {
            setSelectedSlot(i);
            if (!team[i]) {
              const t = [...team];
              t[i] = {};
              setTeam(t);
            }
          }}
          style={{ background: isSelected ? '#2980b9' : '#1a1a2e', border: `1px solid ${borderColor}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
        >
          {label}
        </button>
      );
    })}
  </div>
  ```

- [ ] **Step 5: Run tests and confirm they pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: all tests pass including the new tab strip tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/client/src/admin/TeamBuilder.tsx packages/client/src/admin/__tests__/TeamBuilder.test.tsx
  git commit -m "feat: dynamic slot count and completeness border colors on tabs"
  ```

---

### Task 3: Compact on clear

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`
- Modify: `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`

- [ ] **Step 1: Add `charizard` fixture and write failing test**

  Add `charizard` as a module-level constant in `TeamBuilder.test.tsx` (after the `pikachu` constant):

  ```tsx
  const charizard: PokemonSet = {
    speciesId: 6,
    nickname: 'Charizard',
    level: 50,
    ability: 'Blaze',
    moves: ['flamethrower', '', '', ''],
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    nature: 'timid',
  };
  ```

  Add this describe block:

  ```tsx
  describe('TeamBuilder slot compaction', () => {
    it('collapses the gap when a slot is cleared from a multi-pokemon team', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
      // Slot 0 is selected by default — click clear to remove pikachu
      fireEvent.click(screen.getByText('✕ CLEAR'));
      // With compaction: team=[charizard], tabs are "Charizard" and "+ Add"
      // Without compaction: team=[{},charizard], tabs are "Slot 1" and "Charizard"
      expect(screen.queryByText('Slot 1')).toBeNull();
      expect(screen.getByText('Charizard')).toBeTruthy();
      expect(screen.getByText('+ Add')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm the new test fails**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: "collapses the gap" test fails — without compaction, "Slot 1" is visible.

- [ ] **Step 3: Replace `handleSlotChange` in `TeamBuilder.tsx`**

  Replace:
  ```tsx
  function handleSlotChange(updated: Partial<PokemonSet>) {
    const next = [...team];
    next[selectedSlot] = updated;
    setTeam(next);
  }
  ```

  With:
  ```tsx
  function handleSlotChange(updated: Partial<PokemonSet>) {
    if (!updated.speciesId) {
      const next = team.filter((_, i) => i !== selectedSlot);
      const safeTeam = next.length === 0 ? [{}] : next;
      setTeam(safeTeam);
      setSelectedSlot(Math.min(selectedSlot, safeTeam.length - 1));
    } else {
      const next = [...team];
      next[selectedSlot] = updated;
      setTeam(next);
    }
  }
  ```

- [ ] **Step 4: Replace `handleSendToBank` in `TeamBuilder.tsx`**

  Replace:
  ```tsx
  function handleSendToBank() {
    const pokemon = team[selectedSlot] as PokemonSet;
    onSendToBank!(pokemon);
    const next = [...team];
    next[selectedSlot] = {};
    setTeam(next);
  }
  ```

  With:
  ```tsx
  function handleSendToBank() {
    const pokemon = team[selectedSlot] as PokemonSet;
    onSendToBank!(pokemon);
    const next = team.filter((_, i) => i !== selectedSlot);
    const safeTeam = next.length === 0 ? [{}] : next;
    setTeam(safeTeam);
    setSelectedSlot(Math.min(selectedSlot, safeTeam.length - 1));
  }
  ```

- [ ] **Step 5: Run tests and confirm they pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/client/src/admin/TeamBuilder.tsx packages/client/src/admin/__tests__/TeamBuilder.test.tsx
  git commit -m "feat: compact team array on slot clear instead of leaving empty gap"
  ```

---

### Task 4: Reorder up/down arrows

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`
- Modify: `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add this describe block to `TeamBuilder.test.tsx` (`charizard` is already defined from Task 3):

  ```tsx
  describe('TeamBuilder slot reorder', () => {
    it('swaps slots when down arrow on first slot is clicked', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
      fireEvent.click(screen.getByLabelText('Move slot 1 down'));
      const tabButtons = screen.getAllByRole('button').filter(
        (b) => b.textContent === 'Pikachu' || b.textContent === 'Charizard'
      );
      expect(tabButtons[0]?.textContent).toBe('Charizard');
      expect(tabButtons[1]?.textContent).toBe('Pikachu');
    });

    it('up arrow on the first slot is disabled', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
      expect(screen.getByLabelText('Move slot 1 up')).toBeDisabled();
    });

    it('down arrow on the last filled slot is disabled', () => {
      render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu, charizard]} />);
      expect(screen.getByLabelText('Move slot 2 down')).toBeDisabled();
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm they fail**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: all three reorder tests fail — arrow buttons do not exist yet.

- [ ] **Step 3: Add `handleSwap` to `TeamBuilder.tsx`**

  Insert after `handleSendToBank`:

  ```tsx
  function handleSwap(i: number, direction: -1 | 1) {
    const j = i + direction;
    const next = [...team];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    setTeam(next);
    if (selectedSlot === i) setSelectedSlot(j);
    else if (selectedSlot === j) setSelectedSlot(i);
  }
  ```

- [ ] **Step 4: Update tab strip JSX to wrap each slot with arrow buttons**

  Inside the `Array.from` callback in the tab strip, replace the `return (` block. Add `const isFilled` and change the returned element from a bare `<button>` to a `<div>` containing the arrows and the button:

  Replace:
  ```tsx
      return (
        <button
          key={i}
          onClick={() => {
            setSelectedSlot(i);
            if (!team[i]) {
              const t = [...team];
              t[i] = {};
              setTeam(t);
            }
          }}
          style={{ background: isSelected ? '#2980b9' : '#1a1a2e', border: `1px solid ${borderColor}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
        >
          {label}
        </button>
      );
  ```

  With:
  ```tsx
      const isFilled = !!team[i]?.speciesId;
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isFilled && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleSwap(i, -1); }}
                disabled={i === 0}
                aria-label={`Move slot ${i + 1} up`}
                style={{ background: 'none', border: 'none', color: i === 0 ? '#444' : '#aaa', cursor: i === 0 ? 'default' : 'pointer', padding: '0 2px', fontSize: 9, lineHeight: 1 }}
              >▲</button>
              <button
                onClick={(e) => { e.stopPropagation(); handleSwap(i, 1); }}
                disabled={i === filledCount - 1}
                aria-label={`Move slot ${i + 1} down`}
                style={{ background: 'none', border: 'none', color: i === filledCount - 1 ? '#444' : '#aaa', cursor: i === filledCount - 1 ? 'default' : 'pointer', padding: '0 2px', fontSize: 9, lineHeight: 1 }}
              >▼</button>
            </div>
          )}
          <button
            onClick={() => {
              setSelectedSlot(i);
              if (!team[i]) {
                const t = [...team];
                t[i] = {};
                setTeam(t);
              }
            }}
            style={{ background: isSelected ? '#2980b9' : '#1a1a2e', border: `1px solid ${borderColor}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            {label}
          </button>
        </div>
      );
  ```

- [ ] **Step 5: Run tests and confirm they pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/TeamBuilder.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/client/src/admin/TeamBuilder.tsx packages/client/src/admin/__tests__/TeamBuilder.test.tsx
  git commit -m "feat: add up/down reorder arrows to filled slot tabs"
  ```

---

### Task 5: Inline no-moves warning in PokemonSlotEditor

**Files:**
- Modify: `packages/client/src/admin/PokemonSlotEditor.tsx`
- Modify: `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add two tests to the `describe('PokemonSlotEditor')` block in `PokemonSlotEditor.test.tsx`:

  ```tsx
  it('shows no-moves warning when speciesId is set but all moves are empty', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByText('⚠ No moves set')).toBeTruthy();
  });

  it('does not show no-moves warning when at least one move is set', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['flamethrower', '', '', ''], ability: 'Blaze', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.queryByText('⚠ No moves set')).toBeNull();
  });
  ```

- [ ] **Step 2: Run tests and confirm they fail**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/PokemonSlotEditor.test.tsx
  ```

  Expected: both new tests fail — warning element does not exist yet.

- [ ] **Step 3: Add the warning to `PokemonSlotEditor.tsx`**

  Inside the `{value.speciesId && (...)}` block, after the closing `</div>` of the species header row (the flex row containing the species name, `✕ CLEAR` button, and sprite), add:

  ```tsx
  {value.speciesId && !(value.moves ?? []).some(Boolean) && (
    <div style={{ color: '#f0c040', fontSize: 11 }}>⚠ No moves set</div>
  )}
  ```

  The species header row is:
  ```tsx
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    ...
  </div>
  ```
  Place the warning `div` immediately after the closing `</div>` of that row, before the Level `<div>`.

- [ ] **Step 4: Run tests and confirm they pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/PokemonSlotEditor.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Run the full client test suite to check for regressions**

  ```powershell
  pnpm --filter @poke-fighter/client test
  ```

  Expected: all client tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/client/src/admin/PokemonSlotEditor.tsx packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx
  git commit -m "feat: add no-moves warning to PokemonSlotEditor"
  ```
