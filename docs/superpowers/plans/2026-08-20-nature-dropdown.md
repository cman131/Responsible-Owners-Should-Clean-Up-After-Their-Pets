# Nature Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text nature input in TeamBuilder with a styled `<select>` showing all 25 valid natures with a stat-effect shorthand in each option label.

**Architecture:** A `NATURES` constant array (defined at the top of `TeamBuilder.tsx`) drives the options. The `<input>` for nature becomes a `<select>` bound to the same `updateSlotField` handler. No new files, no new shared types.

**Tech Stack:** React, TypeScript, Vitest + React Testing Library

---

### Task 1: Add tests for the nature dropdown and swap the input for a select

**Files:**
- Create: `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`
- Modify: `packages/client/src/admin/TeamBuilder.tsx` (lines 121–124 — the nature input)

#### Step 1: Write the failing tests

Create `packages/client/src/admin/__tests__/TeamBuilder.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { TeamBuilder } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const pikachu: PokemonSet = {
  speciesId: 25,
  nickname: 'Pikachu',
  level: 50,
  ability: 'Static',
  moves: ['thunderbolt', '', '', ''],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};

describe('TeamBuilder nature field', () => {
  it('renders nature as a select/combobox, not a text input', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('has all 25 natures as options', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.options.length).toBe(25);
  });

  it('labels non-neutral natures with stat shorthand', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByText('Adamant (+Atk / -SpA)')).toBeTruthy();
  });

  it('labels neutral natures with (neutral)', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    expect(screen.getByText('Hardy (neutral)')).toBeTruthy();
  });

  it('pre-selects the current nature value', () => {
    render(<TeamBuilder onTeamSaved={vi.fn()} initialTeam={[pikachu]} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('timid');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @poke-fighter/client test --run src/admin/__tests__/TeamBuilder.test.tsx
```

Expected: 5 failures — `combobox` not found, option counts wrong, option text not found.

- [ ] **Step 3: Add the NATURES constant to TeamBuilder.tsx**

At the top of `packages/client/src/admin/TeamBuilder.tsx`, after the existing imports and before the component, add:

```ts
const NATURES = [
  { id: 'hardy',   boost: null,  drop: null  },
  { id: 'lonely',  boost: 'Atk', drop: 'Def' },
  { id: 'brave',   boost: 'Atk', drop: 'Spe' },
  { id: 'adamant', boost: 'Atk', drop: 'SpA' },
  { id: 'naughty', boost: 'Atk', drop: 'SpD' },
  { id: 'bold',    boost: 'Def', drop: 'Atk' },
  { id: 'relaxed', boost: 'Def', drop: 'Spe' },
  { id: 'impish',  boost: 'Def', drop: 'SpA' },
  { id: 'lax',     boost: 'Def', drop: 'SpD' },
  { id: 'timid',   boost: 'Spe', drop: 'Atk' },
  { id: 'hasty',   boost: 'Spe', drop: 'Def' },
  { id: 'jolly',   boost: 'Spe', drop: 'SpA' },
  { id: 'naive',   boost: 'Spe', drop: 'SpD' },
  { id: 'modest',  boost: 'SpA', drop: 'Atk' },
  { id: 'mild',    boost: 'SpA', drop: 'Def' },
  { id: 'quiet',   boost: 'SpA', drop: 'Spe' },
  { id: 'rash',    boost: 'SpA', drop: 'SpD' },
  { id: 'calm',    boost: 'SpD', drop: 'Atk' },
  { id: 'gentle',  boost: 'SpD', drop: 'Def' },
  { id: 'sassy',   boost: 'SpD', drop: 'Spe' },
  { id: 'careful', boost: 'SpD', drop: 'SpA' },
  { id: 'docile',  boost: null,  drop: null  },
  { id: 'serious', boost: null,  drop: null  },
  { id: 'bashful', boost: null,  drop: null  },
  { id: 'quirky',  boost: null,  drop: null  },
] as const;
```

- [ ] **Step 4: Replace the nature `<input>` with a `<select>` in TeamBuilder.tsx**

Find lines 121–124 (the nature field):

```tsx
<label style={lbl}>Nature</label>
<input value={team[selectedSlot]?.nature ?? 'hardy'}
  onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
  style={{ ...inp, width: 100 }} />
```

Replace with:

```tsx
<label style={lbl}>Nature</label>
<select
  value={team[selectedSlot]?.nature ?? 'hardy'}
  onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
  style={{ ...inp, width: 160 }}
>
  {NATURES.map((n) => (
    <option key={n.id} value={n.id}>
      {n.id.charAt(0).toUpperCase() + n.id.slice(1)}
      {n.boost ? ` (+${n.boost} / -${n.drop})` : ' (neutral)'}
    </option>
  ))}
</select>
```

- [ ] **Step 5: Run all tests and confirm they pass**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: `69 passed` (64 existing + 5 new).

- [ ] **Step 6: Commit**

```
git add packages/client/src/admin/__tests__/TeamBuilder.test.tsx packages/client/src/admin/TeamBuilder.tsx
git commit -m "feat(admin): replace nature text input with dropdown showing stat shorthands"
```
