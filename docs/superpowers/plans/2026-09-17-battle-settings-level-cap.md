# Battle Settings — Level Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional level cap to the Battle Settings wizard step; when set, the server clamps every Pokémon's effective level (and thus all computed stats) to that cap during battle construction.

**Architecture:** The levelCap value flows from a new `<select>` in `BattleSettingsStep` through `SetupPanel.handleStart` into the `start-battle` socket payload, where `adminHandlers` forwards it to `BattleConfigurator.build()`, which passes it down to `buildPartyMember` and applies `Math.min(set.level, levelCap)` before calling `calcAllStats`. No shared type changes needed — `AdminActionPayload.data` is already `Record<string, unknown>`.

**Tech Stack:** TypeScript, React, Vitest, Socket.io, Node.js

---

## File Map

| File | Change |
|------|--------|
| `packages/server/src/setup/__tests__/BattleConfigurator.test.ts` | Add level cap test cases |
| `packages/server/src/setup/BattleConfigurator.ts` | Add `levelCap` to `BuildConfig`; thread through `buildTeam → buildSlot → buildPartyMember` |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Destructure and forward `levelCap` in `start-battle` case |
| `packages/client/src/admin/steps/BattleSettingsStep.tsx` | Add `levelCap` state + `<select>` element; widen `onStart` prop type |
| `packages/client/src/admin/SetupPanel.tsx` | Update `handleStart` to accept and pass `levelCap` in socket payload |

---

### Task 1: Failing tests for BattleConfigurator level cap

**Files:**
- Modify: `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`

- [ ] **Step 1: Add a level cap `describe` block with three failing tests**

Append to `packages/server/src/setup/__tests__/BattleConfigurator.test.ts` after the existing `describe` block:

```ts
describe('levelCap', () => {
  const level100Set: PokemonSet = {
    speciesId: 6, level: 100, ability: 'blaze',
    nickname: 'Charizard',
    moves: ['flamethrower', 'airslash', 'roost', 'willowisp'],
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    nature: 'hardy',
  };

  function buildWith(set: PokemonSet, levelCap?: number) {
    return new BattleConfigurator().build({
      battleId: 'x', label: 'x',
      levelCap,
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, party: [set] }] },
        { slots: [{ slotId: 'b1', displayName: 'B', isNpc: true, party: [set] }] },
      ],
    });
  }

  it('clamps level and stats when levelCap is below set level', () => {
    const state = buildWith(level100Set, 50);
    const member = state.teams[0]!.slots[0]!.party[0]!;
    expect(member.level).toBe(50);
    // Charizard base HP=78, L50, 0 EVs, 31 IVs: floor((2*78+31)*50/100)+50+10 = 153
    expect(member.maxHp).toBe(153);
    expect(member.currentHp).toBe(153);
  });

  it('does not upscale when levelCap is above set level', () => {
    const state = buildWith({ ...level100Set, level: 50 }, 100);
    const member = state.teams[0]!.slots[0]!.party[0]!;
    expect(member.level).toBe(50);
    expect(member.maxHp).toBe(153);
  });

  it('uses set level when no levelCap is given', () => {
    const state = buildWith(level100Set);
    const member = state.teams[0]!.slots[0]!.party[0]!;
    expect(member.level).toBe(100);
    // Charizard base HP=78, L100, 0 EVs, 31 IVs: floor((2*78+31)*100/100)+100+10 = 297
    expect(member.maxHp).toBe(297);
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```
pnpm --filter @poke-fighter/server exec vitest run src/setup/__tests__/BattleConfigurator.test.ts --reporter=verbose
```

Expected: the three new `levelCap` tests fail (TypeScript will complain that `levelCap` is not a known property on `BuildConfig`, or the assertions fail). The two existing tests should still pass.

---

### Task 2: Implement level cap in BattleConfigurator

**Files:**
- Modify: `packages/server/src/setup/BattleConfigurator.ts`

- [ ] **Step 1: Add `levelCap` to `BuildConfig` and thread it through the call chain**

Replace the existing `BuildConfig` interface and `build`, `buildTeam`, `buildSlot`, `buildPartyMember` methods with the versions below. All other code in the file is unchanged.

```ts
interface BuildConfig {
  battleId: string;
  label: string;
  teams: [TeamConfig, TeamConfig];
  levelCap?: number;
}
```

In `build()`, pass `config.levelCap` to `buildTeam`:
```ts
build(config: BuildConfig): BattleState {
  const teams = config.teams.map((teamConfig, teamIdx) =>
    this.buildTeam(teamConfig, teamIdx, config.levelCap)
  ) as [TeamState, TeamState];

  return {
    battleId: config.battleId,
    label: config.label,
    turnNumber: 1,
    phase: 'action',
    teams,
    field: defaultField(),
  };
}
```

Update `buildTeam` to accept and forward `levelCap`:
```ts
private buildTeam(teamConfig: TeamConfig, teamIdx: number, levelCap?: number): TeamState {
  return {
    teamId: `team-${teamIdx === 0 ? 'a' : 'b'}`,
    slots: teamConfig.slots.map((slotConfig) => this.buildSlot(slotConfig, levelCap)),
  };
}
```

Update `buildSlot` to accept and forward `levelCap`:
```ts
private buildSlot(slotConfig: SlotConfig, levelCap?: number): SlotState {
  return {
    slotId: slotConfig.slotId,
    displayName: slotConfig.displayName,
    isNpc: slotConfig.isNpc,
    isSpectator: false,
    party: slotConfig.party.map((set) => this.buildPartyMember(set, levelCap)),
    activePokemonIndex: 0,
  };
}
```

Update `buildPartyMember` to apply the cap:
```ts
private buildPartyMember(set: PokemonSet, levelCap?: number): PartyMember {
  const species = this.data.getSpecies(set.speciesId);
  if (!species) throw new Error(`Unknown species id: ${set.speciesId}`);

  const effectiveLevel = levelCap !== undefined ? Math.min(set.level, levelCap) : set.level;

  const stats = calcAllStats({
    baseStats: species.baseStats,
    ivs: set.ivs,
    evs: set.evs,
    level: effectiveLevel,
    nature: set.nature,
  });

  const member: PartyMember = {
    instanceId: uuidv4(),
    speciesId: set.speciesId,
    speciesName: species.name,
    level: effectiveLevel,
    currentHp: stats.hp,
    maxHp: stats.hp,
    stats,
    ability: set.ability,
    nickname: set.nickname ?? species.displayName,
    moves: set.moves.map((moveId) => ({
      moveId,
      currentPp: this.data.getMove(moveId)?.pp ?? 0,
      maxPp: this.data.getMove(moveId)?.pp ?? 0,
    })) as PartyMember['moves'],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false,
    fainted: false,
    expTotal: 0,
  };

  if (set.heldItem !== undefined) member.heldItem = set.heldItem;
  if (set.teraType !== undefined) member.teraType = set.teraType;
  member.isEvioliteEligible = species.evolutionStage < 3;
  member.ivs = set.ivs;
  member.evs = set.evs;
  member.nature = set.nature;

  return member;
}
```

- [ ] **Step 2: Run tests and confirm all pass**

```
pnpm --filter @poke-fighter/server exec vitest run src/setup/__tests__/BattleConfigurator.test.ts --reporter=verbose
```

Expected: all 5 tests pass (2 existing + 3 new level cap tests).

- [ ] **Step 3: Run typecheck**

```
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add packages/server/src/setup/BattleConfigurator.ts packages/server/src/setup/__tests__/BattleConfigurator.test.ts
git commit -m "feat(server): add levelCap support to BattleConfigurator"
```

---

### Task 3: Forward levelCap through adminHandlers

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts:43-53`

- [ ] **Step 1: Destructure and forward `levelCap` in the `start-battle` case**

Find the `case 'start-battle':` block (lines 43–53). Replace the destructuring and `configurator.build()` call:

```ts
case 'start-battle': {
  const { battleId, label, teams, levelCap } = payload.data as {
    battleId: string; label: string; levelCap?: number;
    teams: [{ slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }, { slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }];
  };
  const { BattleConfigurator } = await import('../../setup/BattleConfigurator.js');
  const configurator = new BattleConfigurator();
  const state = configurator.build({ battleId, label, teams, levelCap });
  db.battles.insert(state);
  startBattle(state);
  break;
}
```

- [ ] **Step 2: Run typecheck**

```
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add packages/server/src/socket/handlers/adminHandlers.ts
git commit -m "feat(server): forward levelCap from start-battle payload to BattleConfigurator"
```

---

### Task 4: Add level cap select to BattleSettingsStep

**Files:**
- Modify: `packages/client/src/admin/steps/BattleSettingsStep.tsx`

- [ ] **Step 1: Replace the full file content**

```tsx
import { useState } from 'react';

interface Props {
  onStart: (settings: { label: string; levelCap?: number }) => void;
  onBack: () => void;
}

export function BattleSettingsStep({ onStart, onBack }: Props) {
  const [label, setLabel] = useState('Battle 1');
  const [levelCap, setLevelCap] = useState(0);

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
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>LEVEL CAP</label>
        <select
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16 }}
          value={levelCap}
          onChange={(e) => setLevelCap(Number(e.target.value))}
        >
          <option value={0}>None (use as-is)</option>
          <option value={50}>Level 50</option>
          <option value={100}>Level 100</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => onStart({ label, levelCap: levelCap > 0 ? levelCap : undefined })}
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

- [ ] **Step 2: Run typecheck**

```
pnpm --filter @poke-fighter/client typecheck
```

Expected: TypeScript will error on `SetupPanel.tsx` because `handleStart` still expects `{ label: string }`. That is intentional — we fix it in Task 5.

- [ ] **Step 3: Do not commit yet** — wait for Task 5 to restore typecheck green.

---

### Task 5: Update SetupPanel to forward levelCap

**Files:**
- Modify: `packages/client/src/admin/SetupPanel.tsx:45-73`

- [ ] **Step 1: Update `handleStart` and the socket payload**

Replace the `handleStart` function (lines 45–73):

```ts
function handleStart({ label, levelCap }: { label: string; levelCap?: number }) {
  const socket = getSocket();
  const id = uuidv4();
  setBattleId(id);

  function buildSlotsWithTeams(slots: any[]) {
    return slots.map((slot: any) => {
      const teamData = slotTeams.find((st) => st.slotId === slot.slotId);
      return {
        slotId: slot.slotId,
        displayName: slot.displayName,
        isNpc: slot.type === 'npc',
        party: teamData?.team ?? [],
      };
    });
  }

  socket.emit('admin:action', {
    type: 'start-battle',
    data: {
      battleId: id,
      label,
      levelCap,
      teams: [
        { slots: buildSlotsWithTeams(slotAssignment!.teamA) },
        { slots: buildSlotsWithTeams(slotAssignment!.teamB) },
      ],
    },
  } as any);
  setStep('started');
}
```

- [ ] **Step 2: Run typecheck**

```
pnpm --filter @poke-fighter/client typecheck
```

Expected: no errors.

- [ ] **Step 3: Run client tests**

```
pnpm --filter @poke-fighter/client test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```
git add packages/client/src/admin/steps/BattleSettingsStep.tsx packages/client/src/admin/SetupPanel.tsx
git commit -m "feat(client): add level cap select to battle settings wizard"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run all tests**

```
pnpm test
```

Expected: all packages pass.

- [ ] **Step 2: Run full typecheck**

```
pnpm typecheck
```

Expected: no errors across all packages.

- [ ] **Step 3: Start the dev server and verify manually**

```
pnpm --filter @poke-fighter/server dev
pnpm --filter @poke-fighter/client dev
```

1. Open the admin panel and start a new battle setup.
2. On Step 4 (Battle Settings), confirm the **LEVEL CAP** select appears with options *None (use as-is)*, *Level 50*, *Level 100*.
3. Set a team with a level-100 Pokémon, choose **Level 50**, and start the battle.
4. In the battle view / battle log, confirm the Pokémon's HP matches the level-50 calculation, not level-100.
5. Repeat with **None** — confirm stats are unchanged from the set level.
