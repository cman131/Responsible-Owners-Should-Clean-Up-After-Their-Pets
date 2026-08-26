# Status Effects Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact inline chip row to each HP bar row in the battle UI that shows active status/volatile/stat-boost effects, with a hover popover for full details.

**Architecture:** A single new `EffectsIndicator` component takes a `PartyMember` and manages its own hover state. It renders inline chips (up to 3 visible, rest collapsed to `+N`) and an absolutely-positioned popover above the row. Both enemy and own-team HP rows in `BattlePage` receive the component after their HP numbers span. The unused `StatusBadge` component is deleted.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, inline styles (no CSS-in-JS library)

---

## File Map

| Action | Path |
|--------|------|
| Create | `packages/client/src/battle/overlays/EffectsIndicator.tsx` |
| Create | `packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx` |
| Modify | `packages/client/src/pages/BattlePage.tsx` |
| Delete | `packages/client/src/battle/overlays/StatusBadge.tsx` |

---

## Task 1: EffectsIndicator — null cases

**Files:**
- Create: `packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx`
- Create: `packages/client/src/battle/overlays/EffectsIndicator.tsx`

- [ ] **Step 1: Write failing tests for null cases**

Create `packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EffectsIndicator } from '../EffectsIndicator.js';
import type { PartyMember, MoveSlot } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'test-id',
    speciesId: 6,
    speciesName: 'charizard',
    nickname: 'Charizard',
    level: 50,
    currentHp: 240,
    maxHp: 334,
    stats: { hp: 334, atk: 200, def: 150, spa: 220, spd: 160, spe: 210 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ] as [MoveSlot, MoveSlot, MoveSlot, MoveSlot],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false,
    fainted: false,
    expTotal: 0,
    ...overrides,
  };
}

describe('EffectsIndicator', () => {
  describe('null cases', () => {
    it('renders nothing when mon is fainted', () => {
      const { container } = render(<EffectsIndicator mon={makeMon({ fainted: true })} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when there are no effects', () => {
      const { container } = render(<EffectsIndicator mon={makeMon()} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/EffectsIndicator.test.tsx
```

Expected: FAIL with "Cannot find module '../EffectsIndicator.js'"

- [ ] **Step 3: Create minimal EffectsIndicator**

Create `packages/client/src/battle/overlays/EffectsIndicator.tsx`:

```tsx
import { useState } from 'react';
import type { PartyMember, StatBoosts, StatusCondition } from '@poke-fighter/shared';

const STATUS_LABELS: Record<StatusCondition, string> = {
  brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ',
  psn: 'PSN', tox: 'TOX', fnt: 'FNT',
};

const STATUS_COLORS: Record<StatusCondition, string> = {
  brn: '#e67e22', par: '#f0c040', slp: '#95a5a6', frz: '#a8d8ea',
  psn: '#9b59b6', tox: '#6c3483', fnt: '#555',
};

const VOLATILE_ABBREV: Record<string, string> = {
  confusion: 'CNF',
  leechseed: 'SEED',
  encore: 'ENC',
};

const STAT_LABELS: Array<{ key: keyof StatBoosts; label: string }> = [
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'spa', label: 'SP.ATK' },
  { key: 'spd', label: 'SP.DEF' },
  { key: 'spe', label: 'SPE' },
  { key: 'accuracy', label: 'ACC' },
  { key: 'evasion', label: 'EVA' },
];

interface Chip {
  label: string;
  color: string;
}

function abbrev(name: string): string {
  return VOLATILE_ABBREV[name] ?? name.slice(0, 3).toUpperCase();
}

function hasAnyBoost(boosts: StatBoosts): boolean {
  return Object.values(boosts).some((v) => v !== 0);
}

function buildChips(mon: PartyMember): Chip[] {
  const chips: Chip[] = [];
  if (mon.status) {
    chips.push({ label: STATUS_LABELS[mon.status], color: STATUS_COLORS[mon.status] });
  }
  for (const vs of mon.volatileStatus) {
    chips.push({ label: abbrev(vs.name), color: '#3498db' });
  }
  if (chips.length === 0 && hasAnyBoost(mon.statBoosts)) {
    chips.push({ label: '±', color: '#7f8c8d' });
  }
  return chips;
}

interface Props {
  mon: PartyMember;
}

export function EffectsIndicator({ mon }: Props) {
  const [hovered, setHovered] = useState(false);

  if (mon.fainted) return null;

  const chips = buildChips(mon);
  if (chips.length === 0) return null;

  const MAX_VISIBLE = 3;
  const visible = chips.slice(0, MAX_VISIBLE);
  const overflow = chips.length - MAX_VISIBLE;

  const nonZeroStats = STAT_LABELS.filter(({ key }) => mon.statBoosts[key] !== 0);
  const zeroStats = STAT_LABELS.filter(({ key }) => mon.statBoosts[key] === 0);
  const hasBoosts = nonZeroStats.length > 0;
  const hasEffects = mon.status !== undefined || mon.volatileStatus.length > 0;

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2, cursor: 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visible.map((chip, i) => (
        <span
          key={i}
          style={{
            background: chip.color,
            color: '#fff',
            fontSize: 8,
            padding: '1px 4px',
            borderRadius: 2,
            fontWeight: 'bold',
            letterSpacing: 0.5,
          }}
        >
          {chip.label}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{ color: '#888', fontSize: 8 }}>+{overflow}</span>
      )}

      {hovered && (
        <div
          data-testid="effects-popover"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            width: 190,
            background: '#111',
            border: '1px solid #444',
            borderRadius: 4,
            padding: 10,
            zIndex: 100,
          }}
        >
          {hasEffects && (
            <div style={{ marginBottom: hasBoosts ? 8 : 0, paddingBottom: hasBoosts ? 8 : 0, borderBottom: hasBoosts ? '1px solid #333' : 'none' }}>
              <div style={{ color: '#888', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>EFFECTS</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {mon.status && (
                  <span style={{ background: STATUS_COLORS[mon.status], color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 2, fontWeight: 'bold' }}>
                    {STATUS_LABELS[mon.status]}
                  </span>
                )}
                {mon.volatileStatus.map((vs, i) => (
                  <span key={i} style={{ background: '#3498db', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 2, fontWeight: 'bold' }}>
                    {abbrev(vs.name)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasBoosts && (
            <div>
              <div style={{ color: '#888', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>STAT STAGES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {nonZeroStats.map(({ key, label }) => {
                  const val = mon.statBoosts[key];
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#fff' }}>
                      <span>{label}</span>
                      <div style={{ display: 'flex', gap: 1 }}>
                        {Array.from({ length: Math.abs(val) }, (_, idx) => (
                          <span key={idx} style={{ color: val > 0 ? '#2ecc71' : '#e74c3c', fontSize: 11 }}>
                            {val > 0 ? '+' : '−'}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {zeroStats.length > 0 && (
                <div style={{ color: '#555', fontSize: 9, marginTop: 5 }}>
                  {zeroStats.map(({ label }) => label).join(' · ')} at 0
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/EffectsIndicator.test.tsx
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/EffectsIndicator.tsx packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx
git commit -m "feat(client): add EffectsIndicator component, null cases passing"
```

---

## Task 2: Chip display tests

**Files:**
- Modify: `packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx`

- [ ] **Step 1: Add chip display tests**

Append this `describe` block to the existing test file (after the `null cases` describe block, inside the outer `describe('EffectsIndicator', ...)`):

```tsx
  describe('chip display', () => {
    it('shows status chip text for status condition', () => {
      const { getByText } = render(<EffectsIndicator mon={makeMon({ status: 'brn' })} />);
      expect(getByText('BRN')).toBeTruthy();
    });

    it('shows PAR chip for paralysis', () => {
      const { getByText } = render(<EffectsIndicator mon={makeMon({ status: 'par' })} />);
      expect(getByText('PAR')).toBeTruthy();
    });

    it('abbreviates known volatile status names', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ volatileStatus: [{ name: 'confusion' }] })} />
      );
      expect(getByText('CNF')).toBeTruthy();
    });

    it('falls back to first 3 chars uppercased for unknown volatile names', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ volatileStatus: [{ name: 'perish' }] })} />
      );
      expect(getByText('PER')).toBeTruthy();
    });

    it('shows ± chip when only stat boosts are active', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } })} />
      );
      expect(getByText('±')).toBeTruthy();
    });

    it('does not show ± chip when status is also present', () => {
      const { queryByText } = render(
        <EffectsIndicator mon={makeMon({ status: 'brn', statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } })} />
      );
      expect(queryByText('±')).toBeNull();
    });

    it('collapses chips beyond 3 to +N overflow label', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({
          status: 'brn',
          volatileStatus: [{ name: 'confusion' }, { name: 'encore' }, { name: 'leechseed' }],
        })} />
      );
      expect(getByText('+1')).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/EffectsIndicator.test.tsx
```

Expected: PASS (all tests including new chip display tests)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx
git commit -m "test(client): add chip display tests for EffectsIndicator"
```

---

## Task 3: Popover tests

**Files:**
- Modify: `packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx`

- [ ] **Step 1: Add popover tests**

Add `fireEvent` to the import at the top of the test file:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```

Then append this `describe` block inside the outer `describe('EffectsIndicator', ...)`:

```tsx
  describe('popover', () => {
    it('does not show popover before hover', () => {
      render(<EffectsIndicator mon={makeMon({ status: 'brn' })} />);
      expect(screen.queryByTestId('effects-popover')).toBeNull();
    });

    it('shows popover on mouseenter and hides on mouseleave', () => {
      const { container } = render(<EffectsIndicator mon={makeMon({ status: 'brn' })} />);
      const wrapper = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      expect(screen.getByTestId('effects-popover')).toBeTruthy();
      fireEvent.mouseLeave(wrapper);
      expect(screen.queryByTestId('effects-popover')).toBeNull();
    });

    it('popover shows status chip in effects section', () => {
      const { container } = render(<EffectsIndicator mon={makeMon({ status: 'par' })} />);
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).toContain('PAR');
    });

    it('popover shows volatile status chip in effects section', () => {
      const { container } = render(
        <EffectsIndicator mon={makeMon({ volatileStatus: [{ name: 'confusion' }] })} />
      );
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).toContain('CNF');
    });

    it('popover shows ATK stat row when only ATK is boosted', () => {
      const { container } = render(
        <EffectsIndicator mon={makeMon({
          status: 'brn',
          statBoosts: { atk: -2, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
        })} />
      );
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).toContain('ATK');
      expect(popover.textContent).toContain('STAT STAGES');
    });

    it('popover footnote lists zero stats when some boosts are non-zero', () => {
      const { container } = render(
        <EffectsIndicator mon={makeMon({
          status: 'brn',
          statBoosts: { atk: 1, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
        })} />
      );
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).toContain('at 0');
      expect(popover.textContent).toContain('DEF');
    });

    it('popover omits stat section when all boosts are zero', () => {
      const { container } = render(<EffectsIndicator mon={makeMon({ status: 'slp' })} />);
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).not.toContain('STAT STAGES');
    });

    it('popover omits effects section when only stat boosts are active', () => {
      const { container } = render(
        <EffectsIndicator mon={makeMon({
          statBoosts: { atk: 0, def: 0, spa: 2, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
        })} />
      );
      fireEvent.mouseEnter(container.firstChild as HTMLElement);
      const popover = screen.getByTestId('effects-popover');
      expect(popover.textContent).not.toContain('EFFECTS');
      expect(popover.textContent).toContain('STAT STAGES');
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/EffectsIndicator.test.tsx
```

Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/battle/overlays/__tests__/EffectsIndicator.test.tsx
git commit -m "test(client): add popover tests for EffectsIndicator"
```

---

## Task 4: Wire into BattlePage and delete StatusBadge

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`
- Delete: `packages/client/src/battle/overlays/StatusBadge.tsx`

- [ ] **Step 1: Add import to BattlePage**

At the top of `packages/client/src/pages/BattlePage.tsx`, add:

```tsx
import { EffectsIndicator } from '../battle/overlays/EffectsIndicator.js';
```

- [ ] **Step 2: Add EffectsIndicator to enemy HP rows**

Find the enemy HP row render block (around line 118–133). It currently ends the live-mon branch with:

```tsx
<span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
```

Add `<EffectsIndicator mon={mon} />` immediately after that span, so the full branch becomes:

```tsx
{mon && !mon.fainted ? (
  <>
    <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
      <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
    </div>
    <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
    <EffectsIndicator mon={mon} />
  </>
) : (
  <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
)}
```

- [ ] **Step 3: Add EffectsIndicator to own-team HP rows**

Find the own-team HP row render block (around line 149–159). It has the same structure. Add `<EffectsIndicator mon={mon} />` after the HP numbers span in the same way:

```tsx
{mon && !mon.fainted ? (
  <>
    <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
      <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
    </div>
    <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
    <EffectsIndicator mon={mon} />
  </>
) : (
  <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
)}
```

- [ ] **Step 4: Delete StatusBadge.tsx**

```bash
git rm packages/client/src/battle/overlays/StatusBadge.tsx
```

- [ ] **Step 5: Run full client test suite**

```
cd packages/client && npx vitest run
```

Expected: All tests pass. If any tests import `StatusBadge`, fix those imports (there should be none — it was unused).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): wire EffectsIndicator into BattlePage HP rows, remove StatusBadge"
```
