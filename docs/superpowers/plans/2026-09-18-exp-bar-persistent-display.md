# EXP Bar Persistent Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "EXP X%" text indicator to every own-team slot in the HP bars row, and name the Pokémon in the level-up overlay.

**Architecture:** Move `expForLevel` to `@poke-fighter/shared` so the client can compute EXP percentages. Add `growthRate: ExpGrowthCurve` to `PartyMember` (populated by `BattleConfigurator` from species data). `HpBarsRow` imports `expForLevel` from shared and renders "EXP X%" for own-variant rows. `ExpBar` gains a `nickname` prop so the level-up toast says "Charizard leveled up! Now Lv.51".

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`, `@poke-fighter/shared`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/src/utils/exp.ts` | Create | `expForLevel` + `EXP_TABLES` moved from server |
| `packages/shared/src/utils/__tests__/exp.test.ts` | Create | Unit tests for `expForLevel` in shared |
| `packages/shared/src/index.ts` | Modify | Export `expForLevel` |
| `packages/shared/src/types/battle.ts` | Modify | Add `growthRate: ExpGrowthCurve` to `PartyMember` |
| `packages/server/src/engine/exp.ts` | Modify | Remove `EXP_TABLES`/`expForLevel`; import from shared |
| `packages/server/src/engine/__tests__/exp.test.ts` | Modify | Update import + add `growthRate` to fixture |
| `packages/server/src/engine/__tests__/fixtures.ts` | Modify | Add `growthRate: 'MediumFast'` to `makePokemon` |
| `packages/server/src/setup/BattleConfigurator.ts` | Modify | Set `growthRate: species.expGrowth` on each member |
| `packages/server/src/setup/__tests__/BattleConfigurator.test.ts` | Modify | Add assertion for `growthRate` |
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Modify | Render "EXP X%" for own-variant rows |
| `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx` | Modify | Add `growthRate` to fixture + new EXP % tests |
| `packages/client/src/battle/overlays/ExpBar.tsx` | Modify | Add `nickname` prop; update level-up text |
| `packages/client/src/pages/BattlePage.tsx` | Modify | Pass `nickname` to `ExpBar` |

---

## Task 1: Create `expForLevel` in shared package

**Files:**
- Create: `packages/shared/src/utils/__tests__/exp.test.ts`
- Create: `packages/shared/src/utils/exp.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the test file**

```ts
// packages/shared/src/utils/__tests__/exp.test.ts
import { describe, it, expect } from 'vitest';
import { expForLevel } from '../exp.js';

describe('expForLevel', () => {
  it('MediumFast: level^3', () => {
    expect(expForLevel('MediumFast', 50)).toBe(125000);
  });

  it('Fast: floor(4 * level^3 / 5)', () => {
    expect(expForLevel('Fast', 50)).toBe(100000);
  });

  it('Slow: floor(5 * level^3 / 4)', () => {
    expect(expForLevel('Slow', 50)).toBe(156250);
  });

  it('Erratic applies formula for n <= 50', () => {
    const n = 50;
    expect(expForLevel('Erratic', n)).toBe(Math.floor((n ** 3) * (100 - n) / 50));
  });

  it('MediumSlow applies polynomial formula', () => {
    const n = 50;
    expect(expForLevel('MediumSlow', n)).toBe(
      Math.floor(6 * (n ** 3) / 5 - 15 * (n ** 2) + 100 * n - 140)
    );
  });

  it('Fluctuating applies formula for n <= 15', () => {
    const n = 10;
    expect(expForLevel('Fluctuating', n)).toBe(
      Math.floor((n ** 3) * (Math.floor((n + 1) / 3) + 24) / 50)
    );
  });

  it('clamps level to 100', () => {
    expect(expForLevel('MediumFast', 101)).toBe(expForLevel('MediumFast', 100));
  });

  it('level 100 MediumFast is 1000000', () => {
    expect(expForLevel('MediumFast', 100)).toBe(1000000);
  });

  it('unknown growth rate falls back to level^3', () => {
    expect(expForLevel('UnknownCurve', 10)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
pnpm --filter @poke-fighter/shared exec vitest run src/utils/__tests__/exp.test.ts
```

Expected: `Cannot find module '../exp.js'`

- [ ] **Step 3: Create the implementation**

```ts
// packages/shared/src/utils/exp.ts
const EXP_TABLES: Record<string, (level: number) => number> = {
  Erratic: (n) => {
    if (n <= 50) return Math.floor((n ** 3) * (100 - n) / 50);
    if (n <= 68) return Math.floor((n ** 3) * (150 - n) / 100);
    if (n <= 98) return Math.floor((n ** 3) * Math.floor((1911 - 10 * n) / 3) / 500);
    return Math.floor((n ** 3) * (160 - n) / 100);
  },
  Fast: (n) => Math.floor(4 * (n ** 3) / 5),
  MediumFast: (n) => n ** 3,
  MediumSlow: (n) => Math.floor(6 * (n ** 3) / 5 - 15 * (n ** 2) + 100 * n - 140),
  Slow: (n) => Math.floor(5 * (n ** 3) / 4),
  Fluctuating: (n) => {
    if (n <= 15) return Math.floor((n ** 3) * (Math.floor((n + 1) / 3) + 24) / 50);
    if (n <= 35) return Math.floor((n ** 3) * (n + 14) / 50);
    return Math.floor((n ** 3) * (Math.floor(n / 2) + 32) / 50);
  },
};

export function expForLevel(growth: string, level: number): number {
  const fn = EXP_TABLES[growth];
  if (!fn) return level ** 3;
  return fn(Math.min(100, Math.max(1, level)));
}
```

- [ ] **Step 4: Run test to confirm it passes**

```powershell
pnpm --filter @poke-fighter/shared exec vitest run src/utils/__tests__/exp.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Export from shared index**

Open `packages/shared/src/index.ts`. Add one line at the end:

```ts
export { expForLevel } from './utils/exp.js';
```

- [ ] **Step 6: Build shared**

```powershell
pnpm --filter @poke-fighter/shared build
```

Expected: `packages/shared/dist/` updated with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/utils/exp.ts packages/shared/src/utils/__tests__/exp.test.ts packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(shared): export expForLevel utility"
```

---

## Task 2: Migrate server exp.ts to import expForLevel from shared

**Files:**
- Modify: `packages/server/src/engine/exp.ts`
- Modify: `packages/server/src/engine/__tests__/exp.test.ts`

- [ ] **Step 1: Update server exp.ts**

Replace the entire file content:

```ts
// packages/server/src/engine/exp.ts
import type { PartyMember } from '@poke-fighter/shared';
import { expForLevel } from '@poke-fighter/shared';

export { expForLevel };

interface ExpYieldInput {
  baseExpYield: number;
  level: number;
}

export interface ExpAward {
  instanceId: string;
  amount: number;
  newTotal: number;
}

export function calcExpYield({ baseExpYield, level }: ExpYieldInput): number {
  return Math.max(1, Math.floor((baseExpYield * level) / 7));
}

interface DistributeInput {
  expYield: number;
  recipients: PartyMember[];
}

export function distributeExp({ expYield, recipients }: DistributeInput): ExpAward[] {
  return recipients
    .filter((mon) => !mon.fainted)
    .map((mon) => ({
      instanceId: mon.instanceId,
      amount: expYield,
      newTotal: mon.expTotal + expYield,
    }));
}

export interface LevelUpResult {
  instanceId: string;
  newLevel: number;
}

export function checkLevelUps(
  mon: PartyMember,
  newExpTotal: number,
  growth: string
): LevelUpResult | null {
  let level = mon.level;
  while (level < 100 && newExpTotal >= expForLevel(growth, level + 1)) {
    level++;
  }
  if (level > mon.level) return { instanceId: mon.instanceId, newLevel: level };
  return null;
}
```

- [ ] **Step 2: Update exp.test.ts imports and fixture**

In `packages/server/src/engine/__tests__/exp.test.ts`:

Change the first two import lines from:
```ts
import { describe, it, expect } from 'vitest';
import { calcExpYield, distributeExp, checkLevelUps, expForLevel } from '../exp.js';
```
To:
```ts
import { describe, it, expect } from 'vitest';
import { calcExpYield, distributeExp, checkLevelUps } from '../exp.js';
import { expForLevel } from '@poke-fighter/shared';
```

Also update the `makeMon` function in that file to add `growthRate`:
```ts
function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 6, speciesName: 'charizard', level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze', nickname: 'Test', moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    growthRate: 'MediumFast',
    ...overrides,
  };
}
```

- [ ] **Step 3: Run server exp tests to confirm they pass**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/engine/__tests__/exp.test.ts
```

Expected: all tests pass (same count as before).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/engine/exp.ts packages/server/src/engine/__tests__/exp.test.ts
git commit -m "refactor(server): import expForLevel from shared package"
```

---

## Task 3: Add `growthRate` to `PartyMember` and update BattleConfigurator

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/engine/__tests__/fixtures.ts`
- Modify: `packages/server/src/setup/BattleConfigurator.ts`
- Modify: `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`

- [ ] **Step 1: Write a failing test for growthRate in BattleConfigurator**

In `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`, add this test inside the existing `describe('BattleConfigurator', ...)` block:

```ts
it('sets growthRate from species data', () => {
  const config = new BattleConfigurator();
  const state = config.build({
    battleId: 'x', label: 'x',
    teams: [
      { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
      { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
    ],
  });
  const mon = state.teams[0]!.slots[0]!.party[0]!;
  const validGrowthRates = ['Erratic', 'Fast', 'MediumFast', 'MediumSlow', 'Slow', 'Fluctuating'];
  expect(validGrowthRates).toContain(mon.growthRate);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
pnpm --filter @poke-fighter/server exec vitest run src/setup/__tests__/BattleConfigurator.test.ts
```

Expected: TypeScript error or runtime failure because `growthRate` does not exist on `PartyMember` yet.

- [ ] **Step 3: Add growthRate to PartyMember**

In `packages/shared/src/types/battle.ts`, locate the `PartyMember` interface. Add `growthRate` after `expTotal`:

```ts
expTotal: number;
growthRate: string;
```

The full block around that section becomes:
```ts
  fainted: boolean;
  expTotal: number;
  growthRate: string;
  ivs?: Stats;
```

- [ ] **Step 4: Rebuild shared**

```powershell
pnpm --filter @poke-fighter/shared build
```

Expected: no errors.

- [ ] **Step 5: Update makePokemon in fixtures.ts**

In `packages/server/src/engine/__tests__/fixtures.ts`, add `growthRate: 'MediumFast'` to the default object in `makePokemon`:

```ts
export function makePokemon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: uuidv4(),
    speciesId: 6,
    speciesName: 'charizard',
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
    growthRate: 'MediumFast',
    ...overrides,
  };
}
```

- [ ] **Step 6: Update BattleConfigurator to set growthRate**

In `packages/server/src/setup/BattleConfigurator.ts`, inside `buildPartyMember`, add `growthRate` to the member object literal. The `member` object currently ends with `expTotal: 0,`. Add the new field directly after:

```ts
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
  growthRate: species.expGrowth,
};
```

- [ ] **Step 7: Run server tests**

```powershell
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass, including the new `growthRate` assertion.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/battle.ts packages/server/src/engine/__tests__/fixtures.ts packages/server/src/setup/BattleConfigurator.ts packages/server/src/setup/__tests__/BattleConfigurator.test.ts
git commit -m "feat(shared): add growthRate to PartyMember; set in BattleConfigurator"
```

---

## Task 4: HpBarsRow — show EXP % for own-team rows

**Files:**
- Modify: `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`
- Modify: `packages/client/src/battle/overlays/HpBarsRow.tsx`

- [ ] **Step 1: Add growthRate to the test fixture and write failing tests**

In `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`:

1. Add `growthRate: 'MediumFast'` to the `makeMon` default object:

```ts
function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 1, speciesName: 'bulbasaur', nickname: 'Bulbasaur',
    level: 50, currentHp: 100, maxHp: 200,
    stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'overgrow',
    moves: [
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'growl', currentPp: 40, maxPp: 40 },
      { moveId: 'vinewhip', currentPp: 25, maxPp: 25 },
      { moveId: 'leechseed', currentPp: 10, maxPp: 10 },
    ],
    volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    growthRate: 'MediumFast',
    ...overrides,
  };
}
```

2. Add these three tests inside the existing `describe('HpBarsRow', ...)` block:

```ts
it('shows EXP percentage for own-variant non-fainted Pokémon below level 100', () => {
  // MediumFast L50: expForLevel('MediumFast', 51) = 132651
  // expTotal 66325 → Math.round(66325/132651*100) = 50
  render(
    <HpBarsRow
      slots={[makeSlot('a1', { expTotal: 66325, level: 50, growthRate: 'MediumFast' })]}
      label="MY TEAM"
      variant="own"
    />
  );
  expect(screen.getByText('EXP 50%')).toBeTruthy();
});

it('does not show EXP percentage for enemy-variant rows', () => {
  render(
    <HpBarsRow
      slots={[makeSlot('b1', { expTotal: 66325, level: 50, growthRate: 'MediumFast' })]}
      label="ENEMY"
      variant="enemy"
    />
  );
  expect(screen.queryByText(/EXP \d+%/)).toBeNull();
});

it('does not show EXP percentage for level-100 Pokémon', () => {
  render(
    <HpBarsRow
      slots={[makeSlot('a1', { expTotal: 999999, level: 100, growthRate: 'MediumFast' })]}
      label="MY TEAM"
      variant="own"
    />
  );
  expect(screen.queryByText(/EXP \d+%/)).toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
pnpm --filter @poke-fighter/client exec vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: the three new tests fail; existing tests may fail due to missing `growthRate` on the fixture (TypeScript compile error).

- [ ] **Step 3: Implement EXP % in HpBarsRow.tsx**

Replace the full content of `packages/client/src/battle/overlays/HpBarsRow.tsx`:

```tsx
import type { SlotState } from '@poke-fighter/shared';
import { expForLevel } from '@poke-fighter/shared';
import { EffectsIndicator } from './EffectsIndicator.js';

interface Props {
  slots: SlotState[];
  label: string;
  variant: 'enemy' | 'own';
  highlightSlotId?: string;
  displayHp?: Map<string, number>;
}

function hpColor(current: number, max: number): string {
  if (max <= 0) return '#e74c3c';
  const pct = Math.min(1, current / max);
  if (pct > 0.5) return '#27ae60';
  if (pct > 0.2) return '#f39c12';
  return '#e74c3c';
}

export function HpBarsRow({ slots, label, variant, highlightSlotId, displayHp }: Props) {
  const borderColor = variant === 'enemy' ? '#555' : '#2980b9';
  const labelColor = variant === 'enemy' ? '#e74c3c' : '#3498db';

  return (
    <div style={{ width: 800, background: '#0d0d1a', border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ color: labelColor, fontSize: 9, letterSpacing: 1 }}>{label}</span>
      {slots.map((slot) => {
        const mon = slot.party[slot.activePokemonIndex];
        const isHighlighted = highlightSlotId !== undefined && slot.slotId === highlightSlotId;
        const nameColor = isHighlighted ? '#fff' : (highlightSlotId !== undefined ? '#aaa' : '#fff');
        const displayCurrent = displayHp?.get(slot.slotId) ?? mon?.currentHp ?? 0;

        let expPct: number | null = null;
        if (variant === 'own' && mon && !mon.fainted && mon.level < 100) {
          const nextThreshold = expForLevel(mon.growthRate, mon.level + 1);
          if (nextThreshold > 0) {
            expPct = Math.min(100, Math.round((mon.expTotal / nextThreshold) * 100));
          }
        }

        return (
          <div
            key={slot.slotId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: isHighlighted ? '#0d1a2e' : 'transparent', borderRadius: 2, padding: '2px 4px' }}
          >
            {highlightSlotId !== undefined && (
              <span style={{ color: '#f0c040', fontSize: 10, width: 14 }}>
                {isHighlighted ? '▶' : ''}
              </span>
            )}
            <span style={{ color: nameColor, fontSize: 10, width: 130 }}>
              {slot.displayName}{mon ? ` L${mon.level}` : ''}
            </span>
            {mon && (!mon.fainted || displayHp?.has(slot.slotId)) ? (
              <>
                <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
                  <div style={{
                    background: hpColor(displayCurrent, mon.maxHp),
                    height: 6,
                    borderRadius: 3,
                    width: `${mon.maxHp > 0 ? Math.min(100, (displayCurrent / mon.maxHp) * 100) : 0}%`,
                    transition: 'width 0.4s ease-out',
                  }} />
                </div>
                <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>
                  {displayCurrent}/{mon.maxHp}
                </span>
                <EffectsIndicator mon={mon} />
                {expPct !== null && (
                  <span style={{ color: '#9b59b6', fontSize: 9, whiteSpace: 'nowrap' }}>
                    EXP {expPct}%
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run HpBarsRow tests**

```powershell
pnpm --filter @poke-fighter/client exec vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/HpBarsRow.tsx packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx
git commit -m "feat(client): show EXP percentage in HP bars row for own team"
```

---

## Task 5: ExpBar — add nickname to level-up notification

**Files:**
- Modify: `packages/client/src/battle/overlays/ExpBar.tsx`
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Update ExpBar.tsx**

Replace the full content of `packages/client/src/battle/overlays/ExpBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getSocket } from '../../socket.js';
import type { ExpAwardPayload, LevelUpPayload } from '@poke-fighter/shared';

interface Props {
  instanceId: string;
  nickname: string;
}

export function ExpBar({ instanceId, nickname }: Props) {
  const [expGain, setExpGain] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onExpAward = (payload: ExpAwardPayload) => {
      const award = payload.awards.find((a) => a.instanceId === instanceId);
      if (award) {
        setExpGain(award.amount);
        setTimeout(() => setExpGain(null), 3000);
      }
    };

    const onLevelUp = (payload: LevelUpPayload) => {
      if (payload.instanceId === instanceId) {
        setLevelUp(payload.newLevel);
        setTimeout(() => setLevelUp(null), 4000);
      }
    };

    socket.on('exp:award', onExpAward);
    socket.on('level:up', onLevelUp);

    return () => {
      socket.off('exp:award', onExpAward);
      socket.off('level:up', onLevelUp);
    };
  }, [instanceId]);

  if (!expGain && !levelUp) return null;

  return (
    <div style={styles.container}>
      {levelUp && (
        <div style={styles.levelUp}>
          {nickname} leveled up! Now Lv.{levelUp}
        </div>
      )}
      {expGain && !levelUp && (
        <div style={styles.expGain}>
          +{expGain} EXP
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'absolute' as const, bottom: 220, left: 80, zIndex: 100, pointerEvents: 'none' as const },
  levelUp: { background: '#f0c040', color: '#000', padding: '6px 14px', borderRadius: 4, fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  expGain: { background: '#1a3a5c', color: '#3498db', border: '1px solid #3498db', padding: '4px 10px', borderRadius: 3, fontSize: 12, letterSpacing: 1 },
};
```

- [ ] **Step 2: Update BattlePage.tsx to pass nickname**

In `packages/client/src/pages/BattlePage.tsx`, change line 89 from:

```tsx
{myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} />}
```

to:

```tsx
{myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} nickname={myActiveMon.nickname} />}
```

- [ ] **Step 3: Run full client test suite and typecheck**

```powershell
pnpm --filter @poke-fighter/client test
pnpm --filter @poke-fighter/client typecheck
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Run full server test suite**

```powershell
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/ExpBar.tsx packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): show Pokémon name in level-up overlay"
```
