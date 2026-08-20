# Pokemon Name Field + Move Validation Relaxation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PokemonSet.nickname` a required field defaulting to the species display name, show it throughout battles, and relax the move-validity check to require only 1 move per Pokémon instead of 4.

**Architecture:** Change the shared type first so TypeScript surfaces every downstream gap. Fix server then client in dependency order. BattleEngine emits `attackerName` on `move-used` events; client reads it in the turn log and SwitchPanel reads `mon.nickname` directly from `PartyMember`.

**Tech Stack:** TypeScript, React 18, Socket.IO, Vitest, pnpm workspaces

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/types/registry.ts` | `nickname?: string` → `nickname: string` on `PokemonSet` |
| `packages/shared/src/types/battle.ts` | `nickname?: string` → `nickname: string` on `PartyMember` |
| `packages/server/src/setup/BattleConfigurator.ts` | Remove optional guard, assign unconditionally |
| `packages/server/src/setup/__tests__/BattleConfigurator.test.ts` | Add `nickname` to `mockSet` |
| `packages/server/src/engine/__tests__/fixtures.ts` | Add `nickname: 'Charizard'` to `makePokemon` |
| `packages/server/src/engine/BattleEngine.ts` | Add `attackerName` to `move-used` event emit |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Add test for `attackerName` |
| `packages/client/src/admin/__tests__/ProfileEditor.test.tsx` | Add `nickname` to all inline `PokemonSet` literals |
| `packages/client/src/admin/TeamBuilder.tsx` | Set `nickname: species.displayName` on pick; add NAME input |
| `packages/client/src/admin/ProfileEditor.tsx` | Relax validation; update error message |
| `packages/client/src/battle/overlays/SwitchPanel.tsx` | Show `mon.nickname` instead of `Species #N` |
| `packages/client/src/battle/BattleContext.tsx` | Use `attackerName` in `eventToText` |

---

### Task 1: Make `nickname` required on shared types

**Files:**
- Modify: `packages/shared/src/types/registry.ts`
- Modify: `packages/shared/src/types/battle.ts`

- [ ] **Step 1: Update `PokemonSet`**

In `packages/shared/src/types/registry.ts`, change line 5:

```typescript
export interface PokemonSet {
  speciesId: number;
  nickname: string;          // was: nickname?: string
  level: number;
  ability: string;
  heldItem?: string;
  moves: [string, string, string, string];
  teraType?: PokemonType;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  ivs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  nature: string;
}
```

- [ ] **Step 2: Update `PartyMember`**

In `packages/shared/src/types/battle.ts`, change the `nickname` line:

```typescript
export interface PartyMember {
  instanceId: string;
  speciesId: number;
  nickname: string;          // was: nickname?: string
  level: number;
  currentHp: number;
  maxHp: number;
  stats: Stats;
  ability: string;
  heldItem?: string;
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
  status?: StatusCondition;
  volatileStatus: string[];
  statBoosts: StatBoosts;
  teraType?: PokemonType;
  hasTerastallized: boolean;
  fainted: boolean;
  expTotal: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/registry.ts packages/shared/src/types/battle.ts
git commit -m "feat(shared): make PokemonSet and PartyMember nickname required"
```

---

### Task 2: Fix server — BattleConfigurator and test fixtures

**Files:**
- Modify: `packages/server/src/setup/BattleConfigurator.ts:68-106`
- Modify: `packages/server/src/setup/__tests__/BattleConfigurator.test.ts:5-11`
- Modify: `packages/server/src/engine/__tests__/fixtures.ts:12-31`

- [ ] **Step 1: Update `BattleConfigurator.ts` — assign nickname unconditionally**

Replace lines 99–103 in `packages/server/src/setup/BattleConfigurator.ts`:

```typescript
    // Only set optional fields if defined (exactOptionalPropertyTypes)
    member.nickname = set.nickname;                          // required — always present
    if (set.heldItem !== undefined) member.heldItem = set.heldItem;
    if (set.teraType !== undefined) member.teraType = set.teraType;
```

(Remove the old `if (set.nickname !== undefined)` guard entirely.)

- [ ] **Step 2: Add `nickname` to `mockSet` in BattleConfigurator test**

In `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`, update `mockSet`:

```typescript
const mockSet: PokemonSet = {
  speciesId: 6, level: 50, ability: 'blaze',
  nickname: 'Charizard',
  moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  nature: 'timid',
};
```

- [ ] **Step 3: Add `nickname` to `makePokemon` fixture**

In `packages/server/src/engine/__tests__/fixtures.ts`, update `makePokemon`:

```typescript
export function makePokemon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: uuidv4(),
    speciesId: 6,
    nickname: 'Charizard',
    level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash',     currentPp: 15, maxPp: 15 },
      { moveId: 'roost',        currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp',    currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}
```

- [ ] **Step 4: Run server tests**

```bash
pnpm --filter server test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/setup/BattleConfigurator.ts packages/server/src/setup/__tests__/BattleConfigurator.test.ts packages/server/src/engine/__tests__/fixtures.ts
git commit -m "fix(server): update BattleConfigurator and fixtures for required nickname"
```

---

### Task 3: BattleEngine — emit `attackerName` on `move-used` event (TDD)

**Files:**
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts:132`

- [ ] **Step 1: Write the failing test**

Add this test to `packages/server/src/engine/__tests__/BattleEngine.test.ts` inside the existing `describe` block:

```typescript
  it('includes attackerName in move-used event', () => {
    const state = make1v1State();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const moveUsed = events.find(
      (e) => e.type === 'move-used' && e.data['attackerSlotId'] === 'slot-a1'
    );
    expect(moveUsed).toBeDefined();
    expect(moveUsed!.data['attackerName']).toBe('Charizard');
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter server test
```

Expected: FAIL — `moveUsed!.data['attackerName']` is `undefined`.

- [ ] **Step 3: Add `attackerName` to the `move-used` emit**

In `packages/server/src/engine/BattleEngine.ts`, find line 132 and update it:

```typescript
    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, moveId: move.id, moveName: move.name } });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter server test
```

Expected: all tests pass including the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): include attackerName in move-used event"
```

---

### Task 4: Fix client test fixtures — add `nickname` to inline `PokemonSet` literals

**Files:**
- Modify: `packages/client/src/admin/__tests__/ProfileEditor.test.tsx:12,31,37`

- [ ] **Step 1: Add `nickname` to the mock TeamBuilder's emitted PokemonSet**

In `packages/client/src/admin/__tests__/ProfileEditor.test.tsx`, update the mock at lines 7–16. The `PokemonSet` literal inside the `onTeamSaved` call needs `nickname`:

```typescript
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, initialTeam }: any) => (
    <div>
      <span>team-builder-initial-{initialTeam?.length ?? 0}</span>
      <button onClick={() => onTeamSaved([
        { speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' },
      ])}>save-team</button>
    </div>
  ),
}));
```

- [ ] **Step 2: Add `nickname` to `existingNpc` pokemon literal**

Update the `existingNpc` constant (lines 29–33):

```typescript
const existingNpc: NpcProfile = {
  profileId: 'npc-1', name: 'Gym Leader Misty',
  team: { templateId: 't1', name: "Misty's Team", pokemon: [{ speciesId: 54, nickname: 'Psyduck', level: 50, ability: 'Damp', moves: ['surf', 'psychic', 'icebeam', 'encore'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'modest' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};
```

- [ ] **Step 3: Add `nickname` to `existingPlayer` pokemon literal**

Update `existingPlayer` (lines 35–39):

```typescript
const existingPlayer: PlayerProfile = {
  profileId: 'player-1', displayName: 'Ash Ketchum',
  defaultTeam: { templateId: 't2', name: "Ash's Team", pokemon: [{ speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};
```

- [ ] **Step 4: Run client tests**

```bash
pnpm --filter client test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/__tests__/ProfileEditor.test.tsx
git commit -m "fix(client-tests): add required nickname field to inline PokemonSet literals"
```

---

### Task 5: TeamBuilder — set default nickname on species pick, add NAME input

**Files:**
- Modify: `packages/client/src/admin/TeamBuilder.tsx`

- [ ] **Step 1: Default `nickname` in `pickPokemon`**

In `packages/client/src/admin/TeamBuilder.tsx`, update the `pickPokemon` function (lines 18–33):

```typescript
  function pickPokemon(species: PokemonSpecies) {
    const updated = [...team];
    updated[selectedSlot] = {
      speciesId: species.id,
      nickname: species.displayName,
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
```

- [ ] **Step 2: Add NAME input to the slot editor**

In `packages/client/src/admin/TeamBuilder.tsx`, inside the slot editor `div` (after the `<div style={{ color: '#aaa', fontSize: 11 }}>Species #...` line and before the Level row), add:

```tsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Name</label>
            <input
              value={team[selectedSlot]?.nickname ?? ''}
              onChange={(e) => updateSlotField(selectedSlot, 'nickname', e.target.value.slice(0, 20))}
              maxLength={20}
              style={{ ...inp, width: 160 }}
            />
          </div>
```

The full slot editor section (lines 86–119) should look like:

```tsx
      {team[selectedSlot]?.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#aaa', fontSize: 11 }}>Species #{team[selectedSlot]!.speciesId} — slot {selectedSlot + 1}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Name</label>
            <input
              value={team[selectedSlot]?.nickname ?? ''}
              onChange={(e) => updateSlotField(selectedSlot, 'nickname', e.target.value.slice(0, 20))}
              maxLength={20}
              style={{ ...inp, width: 160 }}
            />
          </div>
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
        </div>
      )}
```

- [ ] **Step 3: Run client tests**

```bash
pnpm --filter client test
```

Expected: all tests pass (ProfileEditor tests mock TeamBuilder so they're unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/admin/TeamBuilder.tsx
git commit -m "feat(admin): default pokemon nickname to species name, add NAME input in TeamBuilder"
```

---

### Task 6: ProfileEditor — relax move validation

**Files:**
- Modify: `packages/client/src/admin/ProfileEditor.tsx:26-27`

- [ ] **Step 1: Change `every` to `some` in `teamIsValid`**

In `packages/client/src/admin/ProfileEditor.tsx`, replace the two validation lines:

```typescript
  const teamIsValid = team.length > 0 && team.every((s) => s.moves.some(Boolean));
  const isValid = name.trim().length > 0 && teamIsValid;
```

- [ ] **Step 2: Update the error message**

In the same file, find the error message JSX (around line 82):

```tsx
        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0 ? 'Name is required.' : 'Add at least 1 Pokémon with at least 1 move.'}
          </div>
        )}
```

- [ ] **Step 3: Run client tests**

```bash
pnpm --filter client test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/admin/ProfileEditor.tsx
git commit -m "feat(admin): relax move validation to require at least 1 move per pokemon"
```

---

### Task 7: SwitchPanel — show `mon.nickname`

**Files:**
- Modify: `packages/client/src/battle/overlays/SwitchPanel.tsx:33`

- [ ] **Step 1: Replace species number display with nickname**

In `packages/client/src/battle/overlays/SwitchPanel.tsx`, replace line 33:

```tsx
            <span>{mon.nickname} L{mon.level}</span>
```

(Previously: `` <span>Species #{mon.speciesId} L{mon.level}</span> ``)

- [ ] **Step 2: Run client tests**

```bash
pnpm --filter client test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/battle/overlays/SwitchPanel.tsx
git commit -m "feat(battle): show pokemon nickname in SwitchPanel instead of species number"
```

---

### Task 8: BattleContext — use `attackerName` in turn log

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx:93`

- [ ] **Step 1: Update `eventToText` for `move-used`**

In `packages/client/src/battle/BattleContext.tsx`, update the `move-used` case in `eventToText`:

```typescript
    case 'move-used': return `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`;
```

(Previously used `event.data['attackerSlotId']` which was the trainer slot ID, not the Pokémon's name.)

- [ ] **Step 2: Run client tests**

```bash
pnpm --filter client test
```

Expected: all tests pass.

- [ ] **Step 3: Run server tests too (full regression)**

```bash
pnpm --filter server test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx
git commit -m "feat(battle): use pokemon nickname in turn log move-used messages"
```
