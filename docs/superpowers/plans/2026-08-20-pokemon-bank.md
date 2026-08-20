# Pokemon Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unlimited per-player Pokemon bank with a tabbed Team/Bank editor in the Registry, and auto-load a saved player's active team during battle setup.

**Architecture:** Extract `PokemonSlotEditor` from `TeamBuilder` (reused by both team editing and bank modal), create `BankTab` (sprite grid + popup actions), and `PlayerProfileEditor` (tabs: Team via existing `TeamBuilder`, Bank via `BankTab`). `ProfileEditor` becomes a thin router. Battle setup threads `defaultTeam` through slot config so `TeamBuilderStep` can pre-fill.

**Tech Stack:** React 18, TypeScript, Vitest + React Testing Library, Socket.io, shared `@poke-fighter/shared` types.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `packages/shared/src/types/registry.ts` | Add `bank?: PokemonSet[]` to `PlayerProfile` |
| Create | `packages/client/src/admin/PokemonSlotEditor.tsx` | Single-pokemon editor extracted from TeamBuilder |
| Create | `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx` | Tests |
| Modify | `packages/client/src/admin/TeamBuilder.tsx` | Use `PokemonSlotEditor`; add `onSendToBank?` prop |
| Create | `packages/client/src/admin/BankTab.tsx` | Sprite grid, popup, add/edit modal |
| Create | `packages/client/src/admin/__tests__/BankTab.test.tsx` | Tests |
| Create | `packages/client/src/admin/PlayerProfileEditor.tsx` | Name + Team/Bank tabs; emits save |
| Create | `packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx` | Tests |
| Modify | `packages/client/src/admin/ProfileEditor.tsx` | Route to `PlayerProfileEditor` for players |
| Modify | `packages/client/src/admin/steps/SlotAssignmentStep.tsx` | Thread `defaultTeam` through `SlotConfig` |
| Modify | `packages/client/src/admin/steps/TeamBuilderStep.tsx` | Seed `initialTeam` from `slot.defaultTeam` |
| Create | `packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx` | Tests |
| Create | `packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx` | Tests |

---

## Task 1: Add `bank` to PlayerProfile

**Files:**
- Modify: `packages/shared/src/types/registry.ts`

- [ ] **Step 1: Add the field**

In `packages/shared/src/types/registry.ts`, change `PlayerProfile` to:

```ts
export interface PlayerProfile {
  profileId: string;
  displayName: string;
  defaultTeam?: TeamTemplate;
  bank?: PokemonSet[];
  createdAt: string;
}
```

- [ ] **Step 2: Rebuild shared and verify no type errors**

```bash
cd packages/shared && npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/registry.ts
git commit -m "feat(shared): add bank field to PlayerProfile"
```

---

## Task 2: Create PokemonSlotEditor

**Files:**
- Create: `packages/client/src/admin/PokemonSlotEditor.tsx`
- Create: `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../PokemonSearchDropdown.js', () => ({
  PokemonSearchDropdown: ({ onSelect }: any) => (
    <button onClick={() => onSelect({
      id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'],
      baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
      abilities: { 0: 'Blaze', H: 'Solar Power' },
      baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3,
    })}>pick-charizard</button>
  ),
}));
vi.mock('../MoveSearchDropdown.js', () => ({
  MoveSearchDropdown: ({ onChange, value }: any) => (
    <button onClick={() => onChange('flamethrower')}>move-{value || 'empty'}</button>
  ),
}));

import { PokemonSlotEditor } from '../PokemonSlotEditor.js';

describe('PokemonSlotEditor', () => {
  it('renders the species search', () => {
    render(<PokemonSlotEditor value={{}} onChange={vi.fn()} />);
    expect(screen.getByText('pick-charizard')).toBeTruthy();
  });

  it('shows editing fields when value has speciesId', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    expect(screen.getByDisplayValue('Charizard')).toBeTruthy();
    expect(screen.getByDisplayValue('50')).toBeTruthy();
  });

  it('calls onChange with updated nickname', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    fireEvent.change(screen.getByDisplayValue('Charizard'), { target: { value: 'Firewing' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Firewing' }));
  });

  it('calls onChange with full defaults when a species is picked', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText('pick-charizard'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      speciesId: 6,
      nickname: 'Charizard',
      level: 50,
      nature: 'hardy',
    }));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/client && npm test -- PokemonSlotEditor
```

Expected: fails with "Cannot find module '../PokemonSlotEditor.js'"

- [ ] **Step 3: Create PokemonSlotEditor.tsx**

Create `packages/client/src/admin/PokemonSlotEditor.tsx`:

```tsx
import { useState } from 'react';
import type { PokemonSpecies, PokemonSet } from '@poke-fighter/shared';
import { PokemonSearchDropdown } from './PokemonSearchDropdown.js';
import { MoveSearchDropdown } from './MoveSearchDropdown.js';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  value: Partial<PokemonSet>;
  onChange: (updated: Partial<PokemonSet>) => void;
}

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

export function PokemonSlotEditor({ value, onChange }: Props) {
  const [currentSpecies, setCurrentSpecies] = useState<PokemonSpecies | null>(null);

  function pickPokemon(species: PokemonSpecies) {
    setCurrentSpecies(species);
    onChange({
      speciesId: species.id,
      nickname: species.displayName,
      level: value.level ?? 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: value.moves ?? ['', '', '', ''],
      evs: value.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: value.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: value.nature ?? 'hardy',
    });
  }

  function updateField(field: keyof PokemonSet, v: unknown) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PokemonSearchDropdown onSelect={pickPokemon} />

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

      {value.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#aaa', fontSize: 11 }}>
              {currentSpecies?.displayName ?? value.nickname ?? `#${value.speciesId}`}
            </div>
            <img
              src={currentSpecies
                ? `https://play.pokemonshowdown.com/sprites/ani/${currentSpecies.name}.gif`
                : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${value.speciesId}.png`}
              alt=""
              style={{ imageRendering: 'pixelated', width: 80, height: 80 }}
              loading="lazy"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Name</label>
            <input
              value={value.nickname ?? ''}
              onChange={(e) => updateField('nickname', e.target.value.slice(0, 20))}
              maxLength={20}
              style={{ ...inp, width: 160 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Level</label>
            <input
              type="number" min={1} max={100}
              value={value.level ?? 50}
              onChange={(e) => updateField('level', Number(e.target.value))}
              style={{ ...inp, width: 60 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Nature</label>
            <select
              value={value.nature ?? 'hardy'}
              onChange={(e) => updateField('nature', e.target.value)}
              style={{ ...inp, width: 200 }}
            >
              {NATURES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id.charAt(0).toUpperCase() + n.id.slice(1)}
                  {n.boost ? ` (+${n.boost} / -${n.drop})` : ' (neutral)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Moves</label>
            {[0, 1, 2, 3].map((mi) => (
              <div key={mi} style={{ marginBottom: 8 }}>
                <MoveSearchDropdown
                  speciesId={value.speciesId!}
                  value={((value.moves ?? ['', '', '', '']) as string[])[mi] ?? ''}
                  selectedMoves={(value.moves ?? ['', '', '', '']) as string[]}
                  onChange={(moveId) => {
                    const moves = [...((value.moves ?? ['', '', '', '']) as string[])];
                    moves[mi] = moveId;
                    updateField('moves', moves as [string, string, string, string]);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 52 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/client && npm test -- PokemonSlotEditor
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/PokemonSlotEditor.tsx packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx
git commit -m "feat(admin): add PokemonSlotEditor component"
```

---

## Task 3: Refactor TeamBuilder to use PokemonSlotEditor + add onSendToBank

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`

- [ ] **Step 1: Replace TeamBuilder internals**

Rewrite `packages/client/src/admin/TeamBuilder.tsx` in full:

```tsx
import { useState, useEffect } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { PokemonSlotEditor } from './PokemonSlotEditor.js';

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
  onSendToBank?: (pokemon: PokemonSet) => void;
}

export function TeamBuilder({ onTeamSaved, initialTeam = [], onSendToBank }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [selectedSlot, setSelectedSlot] = useState(0);

  function handleSlotChange(updated: Partial<PokemonSet>) {
    const next = [...team];
    next[selectedSlot] = updated;
    setTeam(next);
  }

  function handleSendToBank() {
    const pokemon = team[selectedSlot] as PokemonSet;
    onSendToBank!(pokemon);
    const next = [...team];
    next[selectedSlot] = {};
    setTeam(next);
  }

  useEffect(() => {
    onTeamSaved(team.filter((s): s is PokemonSet => !!s.speciesId));
  }, [team, onTeamSaved]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
            style={{ background: selectedSlot === i ? '#2980b9' : '#1a1a2e', border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            {team[i]?.speciesId ? (team[i]!.nickname ?? `#${team[i]!.speciesId}`) : `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      <PokemonSlotEditor
        value={team[selectedSlot] ?? {}}
        onChange={handleSlotChange}
      />

      {onSendToBank && team[selectedSlot]?.speciesId && (
        <button
          onClick={handleSendToBank}
          style={{ background: '#c0392b', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1, alignSelf: 'flex-start' }}
        >
          → SEND TO BANK
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all client tests — expect PASS**

```bash
cd packages/client && npm test
```

Expected: all existing tests pass (the external interface of `TeamBuilder` is unchanged).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/admin/TeamBuilder.tsx
git commit -m "refactor(admin): use PokemonSlotEditor in TeamBuilder, add onSendToBank prop"
```

---

## Task 4: Create BankTab

**Files:**
- Create: `packages/client/src/admin/BankTab.tsx`
- Create: `packages/client/src/admin/__tests__/BankTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/BankTab.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../PokemonSlotEditor.js', () => ({
  PokemonSlotEditor: ({ onChange }: any) => (
    <button onClick={() => onChange({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['', '', '', ''], ability: 'Overgrow', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } })}>
      pick-bulbasaur
    </button>
  ),
}));

import { BankTab } from '../BankTab.js';
import type { PokemonSet } from '@poke-fighter/shared';

const charizard: PokemonSet = {
  speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid',
  moves: ['', '', '', ''], ability: 'Blaze',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
};

beforeEach(() => { vi.clearAllMocks(); });

describe('BankTab', () => {
  it('renders empty state when bank is empty', () => {
    render(<BankTab bank={[]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    expect(screen.getByText(/no pokemon/i)).toBeTruthy();
  });

  it('renders a card for each bank pokemon', () => {
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    expect(screen.getByText('Charizard')).toBeTruthy();
  });

  it('shows popup actions when a card is clicked', () => {
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    expect(screen.getByText(/move to team/i)).toBeTruthy();
    expect(screen.getByText(/edit/i)).toBeTruthy();
    expect(screen.getByText(/remove/i)).toBeTruthy();
  });

  it('disables Move to Team when team is full', () => {
    render(<BankTab bank={[charizard]} teamSize={6} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    expect(screen.getByText(/move to team/i).closest('button')).toBeDisabled();
  });

  it('calls onBankChange without the removed pokemon on Remove', () => {
    const onBankChange = vi.fn();
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText('Charizard'));
    fireEvent.click(screen.getByText(/remove/i));
    expect(onBankChange).toHaveBeenCalledWith([]);
  });

  it('calls onMoveToTeam and removes from bank on Move to Team', () => {
    const onMoveToTeam = vi.fn();
    const onBankChange = vi.fn();
    render(<BankTab bank={[charizard]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={onMoveToTeam} />);
    fireEvent.click(screen.getByText('Charizard'));
    fireEvent.click(screen.getByText(/move to team/i));
    expect(onMoveToTeam).toHaveBeenCalledWith(charizard);
    expect(onBankChange).toHaveBeenCalledWith([]);
  });

  it('opens the add modal when + ADD TO BANK is clicked', () => {
    render(<BankTab bank={[]} teamSize={0} onBankChange={vi.fn()} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText(/add to bank/i));
    expect(screen.getByText(/add to bank/i, { selector: '[data-modal-title]' })).toBeTruthy();
  });

  it('calls onBankChange with new pokemon when modal is saved', () => {
    const onBankChange = vi.fn();
    render(<BankTab bank={[]} teamSize={0} onBankChange={onBankChange} onMoveToTeam={vi.fn()} />);
    fireEvent.click(screen.getByText(/add to bank/i));
    fireEvent.click(screen.getByText('pick-bulbasaur'));
    fireEvent.click(screen.getByText(/^save$/i));
    expect(onBankChange).toHaveBeenCalledWith([expect.objectContaining({ speciesId: 1, nickname: 'Bulbasaur' })]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/client && npm test -- BankTab
```

Expected: fails with "Cannot find module '../BankTab.js'"

- [ ] **Step 3: Create BankTab.tsx**

Create `packages/client/src/admin/BankTab.tsx`:

```tsx
import { useState } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { PokemonSlotEditor } from './PokemonSlotEditor.js';

interface Props {
  bank: PokemonSet[];
  teamSize: number;
  onBankChange: (bank: PokemonSet[]) => void;
  onMoveToTeam: (pokemon: PokemonSet) => void;
}

type ModalState = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; index: number };

export function BankTab({ bank, teamSize, onBankChange, onMoveToTeam }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [draft, setDraft] = useState<Partial<PokemonSet>>({});

  const teamFull = teamSize >= 6;

  function openAdd() {
    setDraft({});
    setModal({ kind: 'add' });
  }

  function openEdit(index: number) {
    setDraft(bank[index]);
    setModal({ kind: 'edit', index });
    setSelectedIndex(null);
  }

  function handleModalSave() {
    if (!draft.speciesId) return;
    if (modal.kind === 'add') {
      onBankChange([...bank, draft as PokemonSet]);
    } else if (modal.kind === 'edit') {
      const next = [...bank];
      next[modal.index] = draft as PokemonSet;
      onBankChange(next);
    }
    setModal({ kind: 'closed' });
  }

  function handleRemove(index: number) {
    onBankChange(bank.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  function handleMoveToTeam(pokemon: PokemonSet, index: number) {
    onMoveToTeam(pokemon);
    onBankChange(bank.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#27ae60', fontSize: 11, letterSpacing: 2 }}>BANK — {bank.length} Pokémon</span>
        <button onClick={openAdd} style={addBtn}>+ ADD TO BANK</button>
      </div>

      {bank.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
          No pokemon in bank. Click + ADD TO BANK to add one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {bank.map((pokemon, index) => (
            <div key={index} style={{ position: 'relative' }}>
              <div
                onClick={() => setSelectedIndex(index === selectedIndex ? null : index)}
                style={{ background: '#111', border: `1px solid ${selectedIndex === index ? '#3498db' : '#333'}`, borderRadius: 6, padding: 8, width: 80, textAlign: 'center', cursor: 'pointer' }}
              >
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`}
                  style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
                  alt=""
                />
                <div style={{ color: '#fff', fontSize: 9, marginTop: 2 }}>{pokemon.nickname}</div>
                <div style={{ color: '#aaa', fontSize: 8 }}>Lv.{pokemon.level}</div>
              </div>

              {selectedIndex === index && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setSelectedIndex(null)} />
                  <div style={{ position: 'absolute', top: 0, left: 90, background: '#1a1a2e', border: '1px solid #3498db', borderRadius: 5, padding: 6, width: 130, zIndex: 10 }}>
                    <div style={{ color: '#3498db', fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>{pokemon.nickname.toUpperCase()}</div>
                    <button onClick={() => openEdit(index)} style={popBtn('#2980b9')}>✏ EDIT</button>
                    <button
                      onClick={() => !teamFull && handleMoveToTeam(pokemon, index)}
                      disabled={teamFull}
                      style={popBtn(teamFull ? '#333' : '#27ae60')}
                    >→ MOVE TO TEAM</button>
                    <button onClick={() => handleRemove(index)} style={popBtn('#c0392b')}>✕ REMOVE</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {modal.kind !== 'closed' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, width: 520, maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ background: '#111', borderBottom: '1px solid #333', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span data-modal-title style={{ color: '#3498db', fontSize: 11, letterSpacing: 2 }}>
                {modal.kind === 'add' ? 'ADD TO BANK' : 'EDIT POKÉMON'}
              </span>
              <button onClick={() => setModal({ kind: 'closed' })} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <PokemonSlotEditor value={draft} onChange={setDraft} />
            </div>
            <div style={{ padding: '8px 16px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal({ kind: 'closed' })} style={{ background: '#333', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>CANCEL</button>
              <button
                onClick={handleModalSave}
                disabled={!draft.speciesId}
                style={{ background: draft.speciesId ? '#2980b9' : '#555', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, cursor: draft.speciesId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 11 }}
              >SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const addBtn: React.CSSProperties = { background: '#27ae60', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 };
function popBtn(bg: string): React.CSSProperties {
  return { display: 'block', width: '100%', background: bg, border: 'none', color: '#fff', padding: '4px 0', borderRadius: 3, fontSize: 9, cursor: bg === '#333' ? 'not-allowed' : 'pointer', marginBottom: 3, letterSpacing: 1, fontFamily: 'inherit' };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/client && npm test -- BankTab
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/BankTab.tsx packages/client/src/admin/__tests__/BankTab.test.tsx
git commit -m "feat(admin): add BankTab component with sprite grid and popup actions"
```

---

## Task 5: Create PlayerProfileEditor

**Files:**
- Create: `packages/client/src/admin/PlayerProfileEditor.tsx`
- Create: `packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, onSendToBank }: any) => (
    <div>
      <span>team-builder</span>
      <button onClick={() => onSendToBank?.({ speciesId: 1, nickname: 'Bulbasaur', level: 5, nature: 'hardy', moves: ['','','',''], ability: 'Overgrow', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} })}>
        send-to-bank
      </button>
      <button onClick={() => onTeamSaved([])}>clear-team</button>
    </div>
  ),
}));
vi.mock('../BankTab.js', () => ({
  BankTab: ({ bank, onMoveToTeam }: any) => (
    <div>
      <span>bank-tab-{bank.length}</span>
      <button onClick={() => onMoveToTeam({ speciesId: 2, nickname: 'Ivysaur', level: 16, nature: 'bold', moves: ['','','',''], ability: 'Overgrow', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} })}>
        move-to-team
      </button>
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { PlayerProfileEditor } from '../PlayerProfileEditor.js';

const mockSocket = { emit: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('PlayerProfileEditor', () => {
  it('renders name field and TEAM / BANK tabs', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/ash ketchum/i)).toBeTruthy();
    expect(screen.getByText(/team/i)).toBeTruthy();
    expect(screen.getByText(/bank/i)).toBeTruthy();
  });

  it('shows bank tab content when BANK tab is clicked', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-0')).toBeTruthy();
  });

  it('SAVE is disabled when name is empty', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('emits registry:save-player with displayName and bank on SAVE', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/ash ketchum/i), { target: { value: 'Ash' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-player',
      data: expect.objectContaining({
        profile: expect.objectContaining({ displayName: 'Ash', bank: [] }),
      }),
    }));
  });

  it('bank count increases when a pokemon is sent to bank', () => {
    render(<PlayerProfileEditor profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('send-to-bank'));
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-1')).toBeTruthy();
  });

  it('pre-fills name and bank from existing profile', () => {
    const profile = {
      profileId: 'p1', displayName: 'Misty', createdAt: '2026-01-01T00:00:00Z',
      bank: [{ speciesId: 120, nickname: 'Staryu', level: 30, nature: 'bold', moves: ['','','',''], ability: 'Illuminate', evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31} }],
    };
    render(<PlayerProfileEditor profile={profile} onBack={vi.fn()} />);
    expect(screen.getByDisplayValue('Misty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^bank/i }));
    expect(screen.getByText('bank-tab-1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/client && npm test -- PlayerProfileEditor
```

Expected: fails with "Cannot find module '../PlayerProfileEditor.js'"

- [ ] **Step 3: Create PlayerProfileEditor.tsx**

Create `packages/client/src/admin/PlayerProfileEditor.tsx`:

```tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamBuilder } from './TeamBuilder.js';
import { BankTab } from './BankTab.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

interface Props {
  profile: PlayerProfile | null;
  onBack: () => void;
}

export function PlayerProfileEditor({ profile, onBack }: Props) {
  const [name, setName] = useState(profile?.displayName ?? '');
  const [team, setTeam] = useState<PokemonSet[]>(profile?.defaultTeam?.pokemon ?? []);
  const [bank, setBank] = useState<PokemonSet[]>(profile?.bank ?? []);
  const [tab, setTab] = useState<'team' | 'bank'>('team');
  const [teamKey, setTeamKey] = useState(0);

  const isNew = profile === null;
  const isValid = name.trim().length > 0;

  function handleSendToBank(pokemon: PokemonSet) {
    setBank((prev) => [...prev, pokemon]);
  }

  function handleMoveToTeam(pokemon: PokemonSet) {
    if (team.length >= 6) return;
    const next = [...team, pokemon];
    setTeam(next);
    setBank((prev) => prev.filter((p) => p !== pokemon));
    setTeamKey((k) => k + 1);
  }

  function handleSave() {
    const socket = getSocket();
    const now = new Date().toISOString();
    const playerProfile: PlayerProfile = {
      profileId: profile?.profileId ?? uuidv4(),
      displayName: name.trim(),
      defaultTeam: team.length > 0
        ? {
            templateId: profile?.defaultTeam?.templateId ?? uuidv4(),
            name: `${name.trim()}'s Team`,
            pokemon: team,
            createdAt: profile?.defaultTeam?.createdAt ?? now,
          }
        : undefined,
      bank,
      createdAt: profile?.createdAt ?? now,
    };
    socket.emit('admin:action', { type: 'registry:save-player', data: { profile: playerProfile } } as any);
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← Back to Players</button>
          <span style={{ color: '#f0c040', fontSize: 14, letterSpacing: 2 }}>{isNew ? 'NEW' : 'EDIT'} PLAYER</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...actionBtn, background: '#c0392b' }}>DISCARD</button>
            <button onClick={handleSave} disabled={!isValid} style={{ ...actionBtn, background: isValid ? '#27ae60' : '#555', cursor: isValid ? 'pointer' : 'not-allowed' }}>SAVE</button>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>DISPLAY NAME</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ash Ketchum"
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
          {(['team', 'bank'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: '8px 20px', background: tab === t ? (t === 'team' ? '#2980b9' : '#27ae60') : '#1a1a2e', color: tab === t ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 2 }}
            >
              {t === 'team' ? `TEAM (${team.length}/6)` : `BANK (${bank.length})`}
            </button>
          ))}
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
          <div style={{ display: tab === 'team' ? 'block' : 'none' }}>
            <TeamBuilder
              key={teamKey}
              initialTeam={team}
              onTeamSaved={setTeam}
              onSendToBank={handleSendToBank}
            />
          </div>
          <div style={{ display: tab === 'bank' ? 'block' : 'none', padding: 16 }}>
            <BankTab
              bank={bank}
              teamSize={team.length}
              onBankChange={setBank}
              onMoveToTeam={handleMoveToTeam}
            />
          </div>
        </div>

        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>Name is required.</div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/client && npm test -- PlayerProfileEditor
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/PlayerProfileEditor.tsx packages/client/src/admin/__tests__/PlayerProfileEditor.test.tsx
git commit -m "feat(admin): add PlayerProfileEditor with Team/Bank tabs"
```

---

## Task 6: Wire ProfileEditor to route to PlayerProfileEditor

**Files:**
- Modify: `packages/client/src/admin/ProfileEditor.tsx`

- [ ] **Step 1: Replace ProfileEditor with a router**

Rewrite `packages/client/src/admin/ProfileEditor.tsx` in full:

```tsx
import { PlayerProfileEditor } from './PlayerProfileEditor.js';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { useState } from 'react';
import { TeamBuilder } from './TeamBuilder.js';
import type { NpcProfile, PlayerProfile, PokemonSet } from '@poke-fighter/shared';

interface Props {
  type: 'npc' | 'player';
  profile: NpcProfile | PlayerProfile | null;
  onBack: () => void;
}

export function ProfileEditor({ type, profile, onBack }: Props) {
  if (type === 'player') {
    return <PlayerProfileEditor profile={profile as PlayerProfile | null} onBack={onBack} />;
  }
  return <NpcEditor profile={profile as NpcProfile | null} onBack={onBack} />;
}

function NpcEditor({ profile, onBack }: { profile: NpcProfile | null; onBack: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [team, setTeam] = useState<PokemonSet[]>(profile?.team.pokemon ?? []);

  const isNew = profile === null;
  const teamIsValid = team.length > 0 && team.every((s) => s.moves.some(Boolean));
  const isValid = name.trim().length > 0 && teamIsValid;

  function handleSave() {
    const socket = getSocket();
    const now = new Date().toISOString();
    const npcProfile: NpcProfile = {
      profileId: profile?.profileId ?? uuidv4(),
      name: name.trim(),
      team: { templateId: uuidv4(), name: `${name.trim()}'s Team`, pokemon: team, createdAt: now },
      createdAt: profile?.createdAt ?? now,
    };
    socket.emit('admin:action', { type: 'registry:save-npc', data: { profile: npcProfile } } as any);
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← Back to NPCs</button>
          <span style={{ color: '#f0c040', fontSize: 14, letterSpacing: 2 }}>{isNew ? 'NEW' : 'EDIT'} NPC</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...actionBtn, background: '#c0392b' }}>DISCARD</button>
            <button onClick={handleSave} disabled={!isValid} style={{ ...actionBtn, background: isValid ? '#27ae60' : '#555', cursor: isValid ? 'pointer' : 'not-allowed' }}>SAVE</button>
          </div>
        </div>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>NAME</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gym Leader Misty"
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4 }}>
          <TeamBuilder initialTeam={team} onTeamSaved={setTeam} />
        </div>
        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0 ? 'Name is required.' : 'Add at least 1 Pokémon with at least 1 move.'}
          </div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };
```

- [ ] **Step 2: Run all client tests — expect PASS**

```bash
cd packages/client && npm test
```

Expected: all tests pass. The existing `ProfileEditor` tests (if any) still pass because the external interface is identical.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/admin/ProfileEditor.tsx
git commit -m "refactor(admin): ProfileEditor routes to PlayerProfileEditor for players"
```

---

## Task 7: Thread defaultTeam through SlotAssignmentStep

**Files:**
- Modify: `packages/client/src/admin/steps/SlotAssignmentStep.tsx`
- Create: `packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));

import { getSocket } from '../../socket.js';
import { SlotAssignmentStep } from '../steps/SlotAssignmentStep.js';
import type { PokemonSet } from '@poke-fighter/shared';

const staryu: PokemonSet = {
  speciesId: 120, nickname: 'Staryu', level: 30, nature: 'bold',
  moves: ['watergun', '', '', ''], ability: 'Illuminate',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
};

let registryHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'registry:data') registryHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  registryHandler = null;
  vi.clearAllMocks();
});

describe('SlotAssignmentStep — defaultTeam threading', () => {
  it('passes defaultTeam through onNext when a saved player with a team is selected', () => {
    const onNext = vi.fn();
    render(<SlotAssignmentStep teamASlots={1} teamBSlots={1} onNext={onNext} onBack={vi.fn()} />);

    act(() => {
      registryHandler?.({
        resource: 'players',
        data: [{
          profileId: 'p1',
          displayName: 'Misty',
          defaultTeam: { templateId: 't1', name: "Misty's Team", pokemon: [staryu], createdAt: '2026-01-01T00:00:00Z' },
          createdAt: '2026-01-01T00:00:00Z',
        }],
      });
    });

    const selects = screen.getAllByRole('combobox');
    const playerTypeSelect = selects[0];
    fireEvent.change(playerTypeSelect, { target: { value: 'player' } });

    const playerNameSelects = screen.getAllByRole('combobox');
    const playerNameSelect = playerNameSelects.find(
      (s: HTMLSelectElement) => Array.from(s.options).some((o) => o.text.includes('Misty'))
    )!;
    fireEvent.change(playerNameSelect, { target: { value: 'Misty' } });

    fireEvent.click(screen.getByText(/next/i));
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        teamA: expect.arrayContaining([
          expect.objectContaining({ displayName: 'Misty', defaultTeam: [staryu] }),
        ]),
      })
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd packages/client && npm test -- SlotAssignmentDefaultTeam
```

Expected: fails because `SlotConfig` doesn't have `defaultTeam` and it isn't threaded.

- [ ] **Step 3: Update SlotAssignmentStep.tsx**

In `packages/client/src/admin/steps/SlotAssignmentStep.tsx`, make these changes:

**a) Update the `SlotConfig` interface** (add `defaultTeam`):
```tsx
interface SlotConfig {
  slotId: string;
  type: 'player' | 'npc';
  displayName: string;
  profileId?: string;
  defaultTeam?: import('@poke-fighter/shared').PokemonSet[];
}
```

**b) Update the `savedPlayers` state** to store the full profile shape needed:
```tsx
const [savedPlayers, setSavedPlayers] = useState<{ profileId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }[]>([]);
```

**c) Update the `registry:data` handler** to map `defaultTeam`:
```tsx
if (payload.resource === 'players') {
  setSavedPlayers(payload.data.map((p: any) => ({
    profileId: p.profileId,
    displayName: p.displayName,
    defaultTeam: p.defaultTeam?.pokemon,
  })));
}
```

**d) Update `SlotRow`** — in the player `<select>` onChange, look up the player and include `defaultTeam`:
```tsx
onChange={(e) => {
  const name = e.target.value;
  const player = savedPlayers.find((p) => p.displayName === name);
  onUpdate(index, { displayName: name, defaultTeam: player?.defaultTeam });
}}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd packages/client && npm test -- SlotAssignmentDefaultTeam
```

Expected: 1 test passes.

- [ ] **Step 5: Run all client tests — expect PASS**

```bash
cd packages/client && npm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/steps/SlotAssignmentStep.tsx packages/client/src/admin/__tests__/SlotAssignmentDefaultTeam.test.tsx
git commit -m "feat(admin): thread player defaultTeam through SlotAssignmentStep"
```

---

## Task 8: Pre-fill TeamBuilderStep from defaultTeam

**Files:**
- Modify: `packages/client/src/admin/steps/TeamBuilderStep.tsx`
- Create: `packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ initialTeam }: any) => (
    <div>team-size-{initialTeam?.length ?? 0}</div>
  ),
}));

import { TeamBuilderStep } from '../steps/TeamBuilderStep.js';
import type { PokemonSet } from '@poke-fighter/shared';

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
  moves: ['thunderbolt', '', '', ''], ability: 'Static',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
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
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd packages/client && npm test -- TeamBuilderStepPrefill
```

Expected: fails because `SlotInfo` has no `defaultTeam` and `initialTeam` is not seeded from it.

- [ ] **Step 3: Update TeamBuilderStep.tsx**

In `packages/client/src/admin/steps/TeamBuilderStep.tsx`, make these changes:

**a) Update `SlotInfo`** to include `defaultTeam`:
```tsx
interface SlotInfo { slotId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }
```

**b) Initialize `teams` state** with pre-fills from `defaultTeam`:
```tsx
const [teams, setTeams] = useState<Record<string, PokemonSet[]>>(() => {
  const initial: Record<string, PokemonSet[]> = {};
  allSlots.forEach((slot) => {
    if (slot.defaultTeam && slot.defaultTeam.length > 0) {
      initial[slot.slotId] = slot.defaultTeam;
    }
  });
  return initial;
});
```

Replace the existing `const [teams, setTeams] = useState<Record<string, PokemonSet[]>>({});` line with the above.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/client && npm test -- TeamBuilderStepPrefill
```

Expected: 2 tests pass.

- [ ] **Step 5: Run all client tests — expect PASS**

```bash
cd packages/client && npm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/steps/TeamBuilderStep.tsx packages/client/src/admin/__tests__/TeamBuilderStepPrefill.test.tsx
git commit -m "feat(admin): pre-fill battle team from saved player defaultTeam in TeamBuilderStep"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `bank?: PokemonSet[]` added to `PlayerProfile` — Task 1
- ✅ `PokemonSlotEditor` extracted, reused by TeamBuilder and bank modal — Tasks 2, 3
- ✅ `BankTab` with sprite grid, popup (Edit/Move to Team/Remove), modal — Task 4
- ✅ `PlayerProfileEditor` with Team/Bank tabs, name field, batched SAVE — Task 5
- ✅ `ProfileEditor` routes to `PlayerProfileEditor` for players — Task 6
- ✅ `onSendToBank` on TeamBuilder, clears slot — Task 3
- ✅ `defaultTeam` threaded through `SlotAssignmentStep` — Task 7
- ✅ `TeamBuilderStep` pre-fills from `defaultTeam` — Task 8
- ✅ Move to Team disabled when team full — Task 4 (test: "disables Move to Team when team is full")
- ✅ Save flow: all changes batched, single emit — Task 5 (`PlayerProfileEditor.handleSave`)
- ✅ NPC editor behaviour preserved — Task 6 (`NpcEditor` in `ProfileEditor.tsx`)
