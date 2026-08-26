# Ability Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ability `<select>` dropdown to `PokemonSlotEditor` so admins can pick from all available species abilities when building NPC and player teams.

**Architecture:** A single new "Ability" row is inserted between the Level and Nature rows in `PokemonSlotEditor`. When `currentSpecies` is loaded it renders a full select; while the socket fetch is still in flight it renders a disabled select showing the current value. No new components or types are needed.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react

---

## File Map

| File | Change |
|---|---|
| `packages/client/src/admin/PokemonSlotEditor.tsx` | Add Ability row between Level and Nature rows |
| `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx` | Add 3 new test cases |

---

### Task 1: Write failing tests for the ability dropdown

**Files:**
- Modify: `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`

- [ ] **Step 1: Add three failing tests at the bottom of the `describe` block**

Append inside `describe('PokemonSlotEditor', () => { ... })` after the last existing test (line 86):

```tsx
  it('shows ability dropdown with all species abilities when species is loaded', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
    act(() => {
      handler({ resource: 'pokemon', results: [{ id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'], baseStats: { hp:78,atk:84,def:78,spa:109,spd:85,spe:100 }, abilities: { 0: 'Blaze', 1: 'Drought', H: 'Solar Power' }, baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3 }] });
    });
    const select = screen.getByDisplayValue('Blaze') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['Blaze', 'Drought', 'Solar Power']);
  });

  it('calls onChange with the new ability when a different ability is selected', () => {
    const onChange = vi.fn();
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={onChange}
    />);
    const handler = mockSocket.on.mock.calls.find(([e]: [string]) => e === 'data:results')?.[1];
    act(() => {
      handler({ resource: 'pokemon', results: [{ id: 6, name: 'charizard', displayName: 'Charizard', types: ['Fire', 'Flying'], baseStats: { hp:78,atk:84,def:78,spa:109,spd:85,spe:100 }, abilities: { 0: 'Blaze', H: 'Solar Power' }, baseExpYield: 240, expGrowth: 'MediumSlow', learnset: [], evolutionStage: 3 }] });
    });
    fireEvent.change(screen.getByDisplayValue('Blaze'), { target: { value: 'Solar Power' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ability: 'Solar Power' }));
  });

  it('shows ability as disabled select while currentSpecies is still loading', () => {
    render(<PokemonSlotEditor
      value={{ speciesId: 6, nickname: 'Charizard', level: 50, nature: 'timid', moves: ['', '', '', ''], ability: 'Blaze', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 } }}
      onChange={vi.fn()}
    />);
    // Do NOT fire socket response — currentSpecies remains null
    const select = screen.getByDisplayValue('Blaze') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```
cd packages/client && pnpm test -- --reporter=verbose 2>&1 | grep -A3 "ability"
```

Expected: 3 failures — the ability select does not exist yet.

---

### Task 2: Implement the ability dropdown

**Files:**
- Modify: `packages/client/src/admin/PokemonSlotEditor.tsx:140-163`

- [ ] **Step 3: Insert the Ability row between the Level row and Nature row**

In `PokemonSlotEditor.tsx`, find the Level row (ends around line 148) and the Nature row (starts around line 149). Insert this block between them:

```tsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Ability</label>
            {currentSpecies ? (
              <select
                value={value.ability ?? ''}
                onChange={(e) => updateField('ability', e.target.value)}
                style={{ ...inp, width: 200 }}
              >
                {Object.values(currentSpecies.abilities).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <select disabled value={value.ability ?? ''} style={{ ...inp, width: 200 }}>
                <option value={value.ability ?? ''}>{value.ability ?? ''}</option>
              </select>
            )}
          </div>
```

The resulting section should read: Name → Level → **Ability** → Nature → Moves.

- [ ] **Step 4: Run the tests to confirm all three new tests pass**

```
cd packages/client && pnpm test -- --reporter=verbose
```

Expected: all existing tests still pass, plus the 3 new ability tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/PokemonSlotEditor.tsx packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx
git commit -m "feat(admin): add ability dropdown to PokemonSlotEditor"
```
