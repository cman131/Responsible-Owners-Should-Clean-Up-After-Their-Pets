# Forced States + ActionPanel Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lockedReason` to action requests so the client can skip pointless move selection during recharge/sleep/freeze, and extract a shared `ActionPanel` component used by both `BattlePage` and `NpcTabPanel`.

**Architecture:** Server adds `lockedReason` to `ActionRequestPayload`. New `ActionPanel` component owns the full action-selection lifecycle (locked panel, move grid, target row, switch mode). `MovePanel` is retired. Both `BattlePage` and `NpcTabPanel` delegate to `ActionPanel` via `onSubmitMove`/`onSubmitSwitch` callbacks.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react, Socket.io

---

## File Map

| File | Action |
|------|--------|
| `packages/shared/src/types/events.ts` | Add `lockedReason?` to `ActionRequestPayload` |
| `packages/server/src/socket/BattleRoom.ts` | Add `getLockedReason` private method, wire into 3 request builders |
| `packages/server/src/socket/__tests__/BattleRoom.test.ts` | New describe block for `lockedReason` |
| `packages/client/src/battle/overlays/ActionPanel.tsx` | **New** — full action lifecycle component |
| `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx` | **New** |
| `packages/client/src/pages/BattlePage.tsx` | Remove inline targeting/switch state; use `ActionPanel` |
| `packages/client/src/pages/__tests__/BattlePage.test.tsx` | Add locked-state test, update imports |
| `packages/client/src/admin/NpcTabPanel.tsx` | Remove inline targeting/switch; use `ActionPanel` |
| `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx` | Update `[Cancel]` text, remove now-redundant internal-state tests |
| `packages/client/src/battle/overlays/MovePanel.tsx` | **Deleted** |
| `packages/client/src/battle/__tests__/MovePanel.test.tsx` | **Deleted** |

---

### Task 1: Add `lockedReason` to shared `ActionRequestPayload`

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add the field**

In `packages/shared/src/types/events.ts`, find `ActionRequestPayload` and add one field:

```typescript
export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{
    index: 0 | 1 | 2 | 3;
    moveId: string;
    pp: number;
    disabled: boolean;
    targetType: MoveTarget;
    legalTargets: string[];
  }>;
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
  lockedReason?: 'recharge' | 'sleep' | 'freeze';
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat: add lockedReason to ActionRequestPayload"
```

---

### Task 2: Server — detect and populate `lockedReason`

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Test: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the end of `BattleRoom.test.ts`:

```typescript
describe('getPendingActionRequest — lockedReason', () => {
  function makeHumanRoom(overrides: Partial<import('@poke-fighter/shared').PartyMember> = {}) {
    const state = make1v1State();
    Object.assign(state.teams[0]!.slots[0]!.party[0]!, overrides);
    return new BattleRoom({ initialState: state });
  }

  it('returns lockedReason "recharge" when active pokemon has recharge volatile', () => {
    const room = makeHumanRoom({ volatileStatus: [{ name: 'recharge' }] });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('recharge');
  });

  it('returns lockedReason "sleep" when active pokemon status is slp', () => {
    const room = makeHumanRoom({ status: 'slp', volatileStatus: [{ name: 'sleep', counter: 2 }] });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('sleep');
  });

  it('returns lockedReason "freeze" when active pokemon status is frz', () => {
    const room = makeHumanRoom({ status: 'frz' });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('freeze');
  });

  it('returns no lockedReason for a healthy pokemon', () => {
    const room = makeHumanRoom();
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/server test -- src/socket/__tests__/BattleRoom.test.ts
```

Expected: 4 new failures — `lockedReason` property does not exist.

- [ ] **Step 3: Add `getLockedReason` helper to BattleRoom**

In `BattleRoom.ts`, add this private method before `buildValidMoves`:

```typescript
private getLockedReason(active: PartyMember): 'recharge' | 'sleep' | 'freeze' | undefined {
  if (active.volatileStatus.some(v => v.name === 'recharge')) return 'recharge';
  if (active.status === 'slp') return 'sleep';
  if (active.status === 'frz') return 'freeze';
}
```

Then add `lockedReason: this.getLockedReason(active),` to the return object in all three request builders:

**`getPendingActionRequest`** (around line 163):
```typescript
return {
  slotId: slot.slotId,
  validMoves: this.buildValidMoves(slotId, active),
  canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
  switchTargets: hasIngrain ? [] : slot.party
    .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
    .map((p) => p.instanceId),
  canTerastallize: !active.hasTerastallized && !!active.teraType,
  lockedReason: this.getLockedReason(active),
};
```

Apply the same `lockedReason` addition to the return objects inside **`buildPlayerRequests`** (around line 411) and **`buildNpcRequests`** (around line 387).

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @poke-fighter/server test -- src/socket/__tests__/BattleRoom.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat: detect recharge/sleep/freeze and populate lockedReason in action requests"
```

---

### Task 3: ActionPanel — scaffolding + locked state (TDD)

**Files:**
- Create: `packages/client/src/battle/overlays/ActionPanel.tsx`
- Create: `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`

- [ ] **Step 1: Create the test file with locked-state tests**

Create `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionPanel } from '../ActionPanel.js';
import type { ActionRequestPayload, BattleState, PartyMember } from '@poke-fighter/shared';

const activeMon: PartyMember = {
  instanceId: 'active-1', speciesId: 6, speciesName: 'charizard', nickname: 'Charizard',
  level: 50, currentHp: 180, maxHp: 200,
  stats: { hp: 200, atk: 120, def: 100, spa: 130, spd: 100, spe: 110 },
  ability: 'blaze',
  moves: [
    { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
    { moveId: 'airslash', currentPp: 15, maxPp: 15 },
    { moveId: 'roost', currentPp: 10, maxPp: 10 },
    { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const benchMon: PartyMember = {
  instanceId: 'bench-1', speciesId: 9, speciesName: 'blastoise', nickname: 'Blastoise',
  level: 45, currentHp: 140, maxHp: 180,
  stats: { hp: 180, atk: 90, def: 110, spa: 90, spd: 100, spe: 80 },
  ability: 'torrent',
  moves: [
    { moveId: 'surf', currentPp: 15, maxPp: 15 },
    { moveId: 'icebeam', currentPp: 10, maxPp: 10 },
    { moveId: 'flashcannon', currentPp: 10, maxPp: 10 },
    { moveId: 'protect', currentPp: 10, maxPp: 10 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const mockState: BattleState = {
  battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
  teams: [
    {
      teamId: 'team-a',
      slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [activeMon, benchMon], activePokemonIndex: 0 }],
    },
    {
      teamId: 'team-b',
      slots: [{ slotId: 'b1', displayName: 'Bob', isNpc: true, isSpectator: false, party: [{ ...activeMon, instanceId: 'foe-1' }], activePokemonIndex: 0 }],
    },
  ],
  field: {
    trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0,
    mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0,
    sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
    ],
  },
};

const baseRequest: ActionRequestPayload = {
  slotId: 'a1',
  validMoves: [
    { index: 0, moveId: 'flamethrower', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
    { index: 1, moveId: 'airslash', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
    { index: 2, moveId: 'roost', pp: 10, disabled: false, targetType: 'self', legalTargets: ['a1'] },
    { index: 3, moveId: 'willowisp', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
  ],
  canSwitch: false,
  switchTargets: [],
  canTerastallize: false,
};

describe('ActionPanel — locked state', () => {
  it('shows MUST RECHARGE label when lockedReason is recharge', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('MUST RECHARGE')).toBeTruthy();
  });

  it('shows FAST ASLEEP label when lockedReason is sleep', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'sleep' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('FAST ASLEEP')).toBeTruthy();
  });

  it('shows FROZEN SOLID label when lockedReason is freeze', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'freeze' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('FROZEN SOLID')).toBeTruthy();
  });

  it('does not render move buttons when locked', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('flamethrower')).toBeNull();
  });

  it('Confirm on locked panel calls onSubmitMove(0)', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: fails — `ActionPanel` module not found.

- [ ] **Step 3: Create ActionPanel with locked state only**

Create `packages/client/src/battle/overlays/ActionPanel.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { classifyTarget, sortLegalTargets, getSlotDisplayName, formatTargetNames } from '../targeting.js';
import { SwitchPanel } from './SwitchPanel.js';
import type { ActionRequestPayload, BattleState, PartyMember } from '@poke-fighter/shared';

type ValidMove = ActionRequestPayload['validMoves'][number];

interface ActionPanelProps {
  request: ActionRequestPayload;
  slotId: string;
  state: BattleState;
  onSubmitMove: (moveIndex: 0|1|2|3, targetSlotId?: string, terastallize?: boolean) => void;
  onSubmitSwitch: (instanceId: string) => void;
  submitted?: boolean;
  theme?: 'player' | 'npc';
}

const LOCKED_LABELS: Record<NonNullable<ActionRequestPayload['lockedReason']>, string> = {
  recharge: 'MUST RECHARGE',
  sleep: 'FAST ASLEEP',
  freeze: 'FROZEN SOLID',
};

export function ActionPanel({
  request, slotId, state, onSubmitMove, onSubmitSwitch,
  submitted = false, theme = 'player',
}: ActionPanelProps) {
  const [targetingMove, setTargetingMove] = useState<ValidMove | null>(null);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [terastallize, setTerastallize] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);

  useEffect(() => {
    setTargetingMove(null);
    setSelectedTarget('');
    setTerastallize(false);
    setShowSwitch(false);
  }, [request]);

  const accent = theme === 'npc' ? '#e74c3c' : '#3498db';

  const slot = state.teams.flatMap(t => t.slots).find(s => s.slotId === slotId);
  const switchTargetMons: PartyMember[] = request.switchTargets
    .map(id => slot?.party.find(p => p.instanceId === id))
    .filter((p): p is PartyMember => !!p && !p.fainted);

  if (request.lockedReason) {
    return (
      <div style={{ background: '#0d0d1a', border: `2px solid ${accent}`, borderRadius: 8, padding: 16 }}>
        <div style={{ color: accent, fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>
          {LOCKED_LABELS[request.lockedReason]}
        </div>
        <button
          onClick={() => onSubmitMove(0)}
          style={{ background: accent, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          Confirm
        </button>
      </div>
    );
  }

  return <div />;
}
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: locked-state describe block passes (5 tests). Other describes don't exist yet.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/ActionPanel.tsx packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx
git commit -m "feat: add ActionPanel component with locked state rendering"
```

---

### Task 4: ActionPanel — move grid (TDD)

**Files:**
- Modify: `packages/client/src/battle/overlays/ActionPanel.tsx`
- Modify: `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`

- [ ] **Step 1: Add move-grid tests**

Append to `ActionPanel.test.tsx`:

```typescript
describe('ActionPanel — move grid', () => {
  it('renders all 4 move buttons', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('flamethrower')).toBeTruthy();
    expect(screen.getByText('airslash')).toBeTruthy();
    expect(screen.getByText('roost')).toBeTruthy();
    expect(screen.getByText('willowisp')).toBeTruthy();
  });

  it('disables a move with pp=0', () => {
    const req = { ...baseRequest, validMoves: [{ ...baseRequest.validMoves[0]!, pp: 0 }, ...baseRequest.validMoves.slice(1)] };
    render(<ActionPanel request={req} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables a move with disabled=true', () => {
    const req = { ...baseRequest, validMoves: [{ ...baseRequest.validMoves[0]!, disabled: true }, ...baseRequest.validMoves.slice(1)] };
    render(<ActionPanel request={req} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('auto-submits a self-targeting move immediately on click', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('roost'));
    expect(onSubmitMove).toHaveBeenCalledWith(2, 'a1', undefined);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('auto-submits a choose move with exactly one legal target immediately on click', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('flamethrower'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, 'b1', undefined);
  });

  it('does not show SWITCH POKÉMON button when canSwitch is false', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('SWITCH POKÉMON')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: move-grid tests fail (returns `<div />`).

- [ ] **Step 3: Implement move grid in ActionPanel**

Replace the `return <div />;` stub at the bottom of `ActionPanel` with the full move-grid render:

```typescript
  function handleMoveClick(mv: ValidMove) {
    if (submitted) return;
    const mode = classifyTarget(mv.targetType);
    if (mode === 'auto') {
      onSubmitMove(mv.index, mv.legalTargets[0], terastallize || undefined);
      setTerastallize(false);
    } else if (mode === 'choose' && mv.legalTargets.length === 1) {
      onSubmitMove(mv.index, mv.legalTargets[0], terastallize || undefined);
      setTerastallize(false);
    } else if (mode === 'choose') {
      const sorted = sortLegalTargets(mv.legalTargets, slotId, state);
      setTargetingMove(mv);
      setSelectedTarget(sorted[0] ?? '');
    } else if (mode === 'listed') {
      setTargetingMove(mv);
    } else {
      // labeled — target is game-determined, submit immediately
      onSubmitMove(mv.index, undefined, terastallize || undefined);
      setTerastallize(false);
    }
  }

  if (request.validMoves.length === 0 && request.canSwitch) {
    return (
      <SwitchPanel
        party={switchTargetMons}
        onSwitch={onSubmitSwitch}
        label="SWITCH REQUIRED"
      />
    );
  }

  if (showSwitch) {
    return (
      <SwitchPanel
        party={switchTargetMons}
        onSwitch={(id) => { onSubmitSwitch(id); setShowSwitch(false); }}
        onCancel={() => setShowSwitch(false)}
        label="CHOOSE POKÉMON"
      />
    );
  }

  return (
    <div style={{ background: '#0d0d1a', border: `2px solid ${accent}`, borderRadius: 8, padding: 16 }}>
      <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>CHOOSE A MOVE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {request.validMoves.map((mv) => {
          const disabled = mv.disabled || mv.pp === 0 || submitted;
          return (
            <button
              key={mv.index}
              disabled={disabled}
              onClick={() => handleMoveClick(mv)}
              style={{
                background: '#1a1a2e', border: `1px solid ${accent}`, color: '#fff',
                padding: '10px 12px', borderRadius: 4, fontFamily: 'inherit',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{mv.moveId}</span>
              <span style={{ fontSize: 11, color: '#aaa' }}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>

      {request.canSwitch && !submitted && (
        <button
          onClick={() => setShowSwitch(true)}
          style={{
            background: '#1a3a1a', border: '1px solid #27ae60', color: '#fff',
            padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit',
            marginTop: 8, width: '100%', cursor: 'pointer',
          }}
        >
          SWITCH POKÉMON
        </button>
      )}

      {request.canTerastallize && !submitted && (
        <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
          <label style={{ color: '#aaa', fontSize: 11 }}>
            <input
              type="checkbox"
              checked={terastallize}
              onChange={(e) => setTerastallize(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Terastallize this turn
          </label>
        </div>
      )}
    </div>
  );
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/ActionPanel.tsx packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx
git commit -m "feat: add move grid to ActionPanel with auto-submit logic"
```

---

### Task 5: ActionPanel — target selector (TDD)

**Files:**
- Modify: `packages/client/src/battle/overlays/ActionPanel.tsx`
- Modify: `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`

- [ ] **Step 1: Add target-selector tests**

Append to `ActionPanel.test.tsx`:

```typescript
describe('ActionPanel — target selector', () => {
  const multiTargetRequest: ActionRequestPayload = {
    ...baseRequest,
    validMoves: [
      { index: 0, moveId: 'earthquake', pp: 10, disabled: false, targetType: 'normal', legalTargets: ['b1', 'b2'] },
      ...baseRequest.validMoves.slice(1),
    ],
  };

  it('shows target dropdown when choose move has multiple legal targets', () => {
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('earthquake'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('clicking Confirm submits with the selected target', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('earthquake'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, 'b1', undefined);
  });

  it('clicking ✕ cancels target selection and returns to move grid', () => {
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('earthquake'));
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('earthquake')).toBeTruthy();
  });

  it('shows formatted names display (not dropdown) for listed moves', () => {
    const listedRequest: ActionRequestPayload = {
      ...baseRequest,
      validMoves: [
        { index: 0, moveId: 'surf', pp: 15, disabled: false, targetType: 'allAdjacentFoes', legalTargets: ['b1'] },
        ...baseRequest.validMoves.slice(1),
      ],
    };
    render(<ActionPanel request={listedRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('surf'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('Confirm on listed move calls onSubmitMove without targetSlotId', () => {
    const onSubmitMove = vi.fn();
    const listedRequest: ActionRequestPayload = {
      ...baseRequest,
      validMoves: [
        { index: 0, moveId: 'surf', pp: 15, disabled: false, targetType: 'allAdjacentFoes', legalTargets: ['b1'] },
        ...baseRequest.validMoves.slice(1),
      ],
    };
    render(<ActionPanel request={listedRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('surf'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, undefined, undefined);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: target-selector tests fail — no Confirm/dropdown/✕ rendered.

- [ ] **Step 3: Add target row to ActionPanel**

Inside the move-grid `return`, add the target row block after the move grid div and before the switch button:

```typescript
      {targetingMove && (() => {
        const mode = classifyTarget(targetingMove.targetType);
        return (
          <div style={{ marginTop: 8, background: '#0d0d1a', border: `1px solid ${accent}`, borderRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#aaa', fontSize: 11 }}>
              {mode === 'choose' ? 'Target:' : 'Targets:'}
            </span>
            {mode === 'choose' ? (
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                style={{ flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
              >
                {sortLegalTargets(targetingMove.legalTargets, slotId, state).map((t) => (
                  <option key={t} value={t}>{getSlotDisplayName(state, t)}</option>
                ))}
              </select>
            ) : (
              <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
                {formatTargetNames(targetingMove.legalTargets, state)}
              </span>
            )}
            <button
              onClick={() => {
                const m = classifyTarget(targetingMove.targetType);
                onSubmitMove(targetingMove.index, m === 'choose' ? selectedTarget : undefined, terastallize || undefined);
                setTargetingMove(null);
                setSelectedTarget('');
                setTerastallize(false);
              }}
              style={{ background: accent, color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
            >
              Confirm
            </button>
            <button
              onClick={() => { setTargetingMove(null); setSelectedTarget(''); }}
              style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        );
      })()}
```

- [ ] **Step 4: Run to verify pass**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/ActionPanel.tsx packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx
git commit -m "feat: add target selector row to ActionPanel"
```

---

### Task 6: ActionPanel — switch mode, tera checkbox, submitted prop (TDD)

**Files:**
- Modify: `packages/client/src/battle/overlays/ActionPanel.tsx` (already has the JSX; just needs tests)
- Modify: `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`

- [ ] **Step 1: Add switch/tera/submitted tests**

Append to `ActionPanel.test.tsx`:

```typescript
const switchableRequest: ActionRequestPayload = {
  ...baseRequest,
  canSwitch: true,
  switchTargets: ['bench-1'],
};

describe('ActionPanel — switch mode', () => {
  it('shows SWITCH POKÉMON button when canSwitch is true', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('SWITCH POKÉMON')).toBeTruthy();
  });

  it('clicking SWITCH POKÉMON shows SwitchPanel with bench members and [Cancel]', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    expect(screen.getByText('Blastoise L45')).toBeTruthy();
    expect(screen.getByText('[Cancel]')).toBeTruthy();
    expect(screen.queryByText('flamethrower')).toBeNull();
  });

  it('clicking [Cancel] returns to move grid without submitting', () => {
    const onSubmitSwitch = vi.fn();
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={onSubmitSwitch} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('[Cancel]'));
    expect(screen.getByText('flamethrower')).toBeTruthy();
    expect(onSubmitSwitch).not.toHaveBeenCalled();
  });

  it('selecting a bench Pokémon calls onSubmitSwitch and returns to grid', () => {
    const onSubmitSwitch = vi.fn();
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={onSubmitSwitch} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('Blastoise L45'));
    expect(onSubmitSwitch).toHaveBeenCalledWith('bench-1');
  });

  it('forced switch (no validMoves, canSwitch true) shows SwitchPanel without [Cancel]', () => {
    const forcedRequest: ActionRequestPayload = { ...baseRequest, validMoves: [], canSwitch: true, switchTargets: ['bench-1'] };
    render(<ActionPanel request={forcedRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Blastoise L45')).toBeTruthy();
    expect(screen.queryByText('[Cancel]')).toBeNull();
  });
});

describe('ActionPanel — tera checkbox', () => {
  it('does not show tera checkbox when canTerastallize is false', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('Terastallize this turn')).toBeNull();
  });

  it('shows tera checkbox when canTerastallize is true', () => {
    render(<ActionPanel request={{ ...baseRequest, canTerastallize: true }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Terastallize this turn')).toBeTruthy();
  });

  it('passes terastallize=true through to onSubmitMove when checked before clicking auto-submit move', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={{ ...baseRequest, canTerastallize: true }} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Terastallize this turn'));
    fireEvent.click(screen.getByText('roost'));
    expect(onSubmitMove).toHaveBeenCalledWith(2, 'a1', true);
  });
});

describe('ActionPanel — submitted prop', () => {
  it('disables all move buttons when submitted=true', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} submitted={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(true));
  });

  it('hides SWITCH POKÉMON button when submitted=true', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} submitted={true} />);
    expect(screen.queryByText('SWITCH POKÉMON')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: switch/tera/submitted tests fail (switch mode JSX already exists from Task 4 but tests are new).

- [ ] **Step 3: Run full test suite to check overall state**

```
pnpm --filter @poke-fighter/client test
```

Expected: only the new describe blocks fail. Fix any TypeScript errors if the `getByLabelText` on the checkbox doesn't find it — the checkbox must be wrapped in a `<label>` with the text adjacent (current implementation uses `<label>...<input/>Terastallize this turn</label>` which `getByLabelText` resolves via the label text).

- [ ] **Step 4: Run target tests to verify pass**

```
pnpm --filter @poke-fighter/client test -- src/battle/overlays/__tests__/ActionPanel.test.tsx
```

Expected: all ActionPanel tests pass. The switch/tera/submitted JSX was already added in Task 4's implementation.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx
git commit -m "test: add switch mode, tera, and submitted coverage for ActionPanel"
```

---

### Task 7: Refactor `BattlePage` to use `ActionPanel`; retire `MovePanel`

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx`
- Delete: `packages/client/src/battle/overlays/MovePanel.tsx`
- Delete: `packages/client/src/battle/__tests__/MovePanel.test.tsx`

- [ ] **Step 1: Add a locked-state test to BattlePage.test.tsx**

Add this test inside the existing `describe('BattlePage', ...)` block in `BattlePage.test.tsx`:

```typescript
  it('shows MUST RECHARGE panel when action request has lockedReason recharge', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    act(() => {
      onCall![1]({
        slotId: 'a1',
        validMoves: [{ index: 0, moveId: 'hyperbeam', pp: 5, disabled: false, targetType: 'normal', legalTargets: ['b1'] }],
        canSwitch: false, switchTargets: [], canTerastallize: false,
        lockedReason: 'recharge',
      });
    });
    expect(screen.getByText('MUST RECHARGE')).toBeTruthy();
    expect(screen.queryByText('hyperbeam')).toBeNull();
  });
```

- [ ] **Step 2: Run BattlePage tests to confirm the new test fails**

```
pnpm --filter @poke-fighter/client test -- src/pages/__tests__/BattlePage.test.tsx
```

Expected: new test fails — `MovePanel` is still rendered, no `MUST RECHARGE`.

- [ ] **Step 3: Rewrite BattlePage.tsx**

Replace the full content of `packages/client/src/pages/BattlePage.tsx` with:

```typescript
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { getSocket } from '../socket.js';
import { BattleScene } from '../battle/BattleScene.js';
import { ActionPanel } from '../battle/overlays/ActionPanel.js';
import { SwitchPanel } from '../battle/overlays/SwitchPanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { ExpBar } from '../battle/overlays/ExpBar.js';
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
import type { BattleState } from '@poke-fighter/shared';

export function BattlePage() {
  const location = useLocation();
  const initialState = (location.state as { battleState?: BattleState } | null)?.battleState ?? null;
  const mySlotId = sessionStorage.getItem('mySlotId') ?? 'a1';
  return (
    <BattleProvider mySlotId={mySlotId} initialState={initialState}>
      <BattleView />
    </BattleProvider>
  );
}

function BattleView() {
  const navigate = useNavigate();
  const { state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction } = useBattle();

  function handleGoHome() {
    getSocket().emit('player:leave');
    sessionStorage.removeItem('mySlotId');
    navigate('/');
  }

  function handleSwitch(instanceId: string) {
    submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
  }

  if (!state) {
    return (
      <div style={{ position: 'relative', padding: 48, textAlign: 'center', color: '#aaa' }}>
        <button
          onClick={handleGoHome}
          style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          ← Home
        </button>
        Waiting for battle to start...
      </div>
    );
  }

  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];
  const switchableParty = mySlot?.party.filter((p) => !p.fainted && p.instanceId !== myActiveMon?.instanceId) ?? [];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12, position: 'relative' }}>
      <button
        onClick={handleGoHome}
        style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
      >
        ← Home
      </button>

      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      <HpBarsRow
        label="ENEMY"
        variant="enemy"
        slots={foeTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        displayHp={displayHp}
      />

      <BattleScene state={state} mySlotId={mySlotId} animatingSlots={animatingSlots} />

      <HpBarsRow
        label="MY TEAM"
        variant="own"
        slots={myTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        highlightSlotId={mySlotId}
        displayHp={displayHp}
      />

      {myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} />}

      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {switchRequest !== null ? (
            <SwitchPanel
              party={switchableParty}
              onSwitch={handleSwitch}
              label="YOUR POKÉMON FAINTED — CHOOSE NEXT"
            />
          ) : actionRequest && !mySlot?.isSpectator ? (
            <ActionPanel
              request={actionRequest}
              slotId={mySlotId}
              state={state}
              onSubmitMove={(moveIndex, targetSlotId, tera) =>
                submitAction({
                  slotId: mySlotId,
                  action: {
                    type: 'move',
                    moveIndex,
                    ...(targetSlotId !== undefined ? { targetSlotId } : {}),
                    ...(tera ? { terastallize: tera } : {}),
                  },
                })
              }
              onSubmitSwitch={handleSwitch}
              theme="player"
            />
          ) : mySlot?.isSpectator ? (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Watching...</div>
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Waiting for others...</div>
          )}
        </div>
        <div style={{ width: 300 }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run BattlePage tests**

```
pnpm --filter @poke-fighter/client test -- src/pages/__tests__/BattlePage.test.tsx
```

Expected: all tests pass including the new locked-state test.

- [ ] **Step 5: Delete MovePanel files**

Delete `packages/client/src/battle/overlays/MovePanel.tsx` and `packages/client/src/battle/__tests__/MovePanel.test.tsx`.

- [ ] **Step 6: Run full client test suite**

```
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass. MovePanel tests are gone; no remaining imports of MovePanel.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git rm packages/client/src/battle/overlays/MovePanel.tsx packages/client/src/battle/__tests__/MovePanel.test.tsx
git commit -m "feat: use ActionPanel in BattlePage, retire MovePanel"
```

---

### Task 8: Refactor `NpcTabPanel` to use `ActionPanel`

**Files:**
- Modify: `packages/client/src/admin/NpcTabPanel.tsx`
- Modify: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`

- [ ] **Step 1: Update NpcTabPanel.test.tsx — fix Cancel → [Cancel] and add lockedReason**

In `NpcTabPanel.test.tsx`, make these changes:

1. Replace `getByText('Cancel')` → `getByText('[Cancel]')` in the voluntary switch describe block (two occurrences: the assertion and the fireEvent click).
2. Replace `queryByText('Cancel')` → `queryByText('[Cancel]')` in the forced-switch test.
3. Add `lockedReason` to the NpcTabPanel `makeRequest` return type so TypeScript accepts it. The field is optional so no change needed unless TypeScript reports an error.

Updated voluntary switch tests (replace the two tests that reference `Cancel`):

```typescript
  it('clicking SWITCH POKÉMON shows bench list and [Cancel] button', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    expect(screen.getByText('Squirtle')).toBeTruthy();
    expect(screen.getByText('[Cancel]')).toBeTruthy();
    expect(screen.queryByText('surf')).toBeNull();
  });

  it('clicking [Cancel] returns to the move grid without submitting', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('[Cancel]'));
    expect(screen.getByText('surf')).toBeTruthy();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
```

Updated forced-switch test (replace `queryByText('Cancel')` → `queryByText('[Cancel]')`):

```typescript
  it('forced switch (no valid moves, canSwitch true) shows no [Cancel] button', () => {
    const forcedRequest: ActionRequestPayload = {
      slotId: 'b1', validMoves: [], canSwitch: true, switchTargets: ['bench1'], canTerastallize: false,
    };
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: forcedRequest }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    expect(screen.getByText('Squirtle')).toBeTruthy();
    expect(screen.queryByText('[Cancel]')).toBeNull();
  });
```

- [ ] **Step 2: Run NpcTabPanel tests to confirm which currently fail**

```
pnpm --filter @poke-fighter/client test -- src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: the updated Cancel tests now expect `[Cancel]` — they will still pass or fail based on current rendering. Record which tests fail before the NpcTabPanel refactor.

- [ ] **Step 3: Rewrite NpcTabPanel.tsx**

Replace the full content of `packages/client/src/admin/NpcTabPanel.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { ActionPanel } from '../battle/overlays/ActionPanel.js';
import type { ActionRequestPayload, BattleState } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
  state: BattleState | null;
}

export function NpcTabPanel({ battleId, npcRequests, state }: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSubmitted(new Set());
    if (npcRequests.length > 0) setActiveTab(npcRequests[0]!.slotId);
  }, [npcRequests]);

  function getActiveMon(slotId: string) {
    if (!state) return null;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.party[slot.activePokemonIndex] ?? null;
    }
    return null;
  }

  function getDisplayName(slotId: string): string {
    if (!state) return slotId;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.displayName;
    }
    return slotId;
  }

  function submitNpcAction(slotId: string, moveIndex: 0 | 1 | 2 | 3, targetSlotId?: string) {
    const action = targetSlotId
      ? { type: 'move' as const, moveIndex, targetSlotId }
      : { type: 'move' as const, moveIndex };
    getSocket().emit('admin:action', { type: 'npc-action', data: { battleId, slotId, action } });
    setSubmitted((prev) => new Set([...prev, slotId]));
  }

  function submitNpcSwitch(slotId: string, targetInstanceId: string) {
    getSocket().emit('admin:action', {
      type: 'npc-action',
      data: { battleId, slotId, action: { type: 'switch', targetInstanceId } },
    });
    setSubmitted((prev) => new Set([...prev, slotId]));
  }

  if (npcRequests.length === 0) return null;

  const activeRequest = npcRequests.find((r) => r.slotId === activeTab);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>NPC ACTIONS — {submitted.size}/{npcRequests.length} submitted</div>

      <div style={styles.tabStrip}>
        {npcRequests.map((r) => (
          <button
            key={r.slotId}
            onClick={() => setActiveTab(r.slotId)}
            style={{
              ...styles.tab,
              background: activeTab === r.slotId ? '#e74c3c' : '#1a1a2e',
              color: submitted.has(r.slotId) ? '#555' : activeTab === r.slotId ? '#fff' : '#aaa',
              borderColor: activeTab === r.slotId ? '#e74c3c' : '#333',
            }}
          >
            {r.displayName}{submitted.has(r.slotId) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {activeRequest && state && (
        <div style={styles.tabBody}>
          {/* VS summary — admin-specific HP overview */}
          <div style={styles.vsSummary}>
            {[...new Set(activeRequest.request.validMoves.flatMap((m) => m.legalTargets))].map((targetSlotId) => {
              const mon = getActiveMon(targetSlotId);
              const pct = mon && !mon.fainted ? mon.currentHp / mon.maxHp : 0;
              const barColor = pct > 0.5 ? '#27ae60' : pct > 0.2 ? '#f39c12' : '#e74c3c';
              return (
                <div key={targetSlotId} style={styles.vsRow}>
                  <span style={{ color: '#e74c3c', fontSize: 9, width: 18 }}>VS</span>
                  <span style={{ color: '#fff', fontSize: 10, flex: 1 }}>{getDisplayName(targetSlotId)}</span>
                  {mon && !mon.fainted ? (
                    <>
                      <div style={{ width: 80, background: '#333', height: 4, borderRadius: 2 }}>
                        <div style={{ background: barColor, height: 4, borderRadius: 2, width: `${pct * 100}%` }} />
                      </div>
                      <span style={{ color: '#aaa', fontSize: 9, width: 50, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
                    </>
                  ) : (
                    <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
                  )}
                </div>
              );
            })}
          </div>

          <ActionPanel
            request={activeRequest.request}
            slotId={activeRequest.slotId}
            state={state}
            onSubmitMove={(moveIndex, targetSlotId) =>
              submitNpcAction(activeRequest.slotId, moveIndex, targetSlotId)
            }
            onSubmitSwitch={(instanceId) =>
              submitNpcSwitch(activeRequest.slotId, instanceId)
            }
            submitted={submitted.has(activeRequest.slotId)}
            theme="npc"
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 6, padding: 12 },
  header: { color: '#e74c3c', fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  tabStrip: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' as const },
  tab: { border: '1px solid #333', borderRadius: '3px 3px 0 0', padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  tabBody: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  vsSummary: { display: 'flex', flexDirection: 'column' as const, gap: 4, background: '#111', borderRadius: 3, padding: '4px 8px' },
  vsRow: { display: 'flex', alignItems: 'center', gap: 6 },
};
```

- [ ] **Step 4: Run NpcTabPanel tests**

```
pnpm --filter @poke-fighter/client test -- src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Run full client test suite**

```
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass.

- [ ] **Step 6: Run full server test suite**

```
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/admin/NpcTabPanel.tsx packages/client/src/admin/__tests__/NpcTabPanel.test.tsx
git commit -m "feat: use ActionPanel in NpcTabPanel, remove duplicated action control logic"
```

---

## Self-Review

**Spec coverage:**
- ✅ `lockedReason` field in `ActionRequestPayload` — Task 1
- ✅ Server detects recharge/sleep/freeze — Task 2
- ✅ Locked panel with label + Confirm — Task 3
- ✅ Move grid, auto-submit, choose-1-target auto-submit — Task 4
- ✅ Target dropdown (choose), listed display, ✕ cancel — Task 5
- ✅ Switch mode (voluntary + forced), tera checkbox, submitted prop — Task 6
- ✅ BattlePage simplified, MovePanel deleted — Task 7
- ✅ NpcTabPanel simplified — Task 8
- ✅ BattleRoom tests for lockedReason — Task 2
- ✅ ActionPanel test suite — Tasks 3–6
- ✅ BattlePage locked-state test — Task 7
- ✅ NpcTabPanel Cancel→[Cancel] updates — Task 8

**Placeholder scan:** No TBD/TODO. All code steps are complete.

**Type consistency:**
- `onSubmitMove(moveIndex: 0|1|2|3, targetSlotId?: string, terastallize?: boolean)` used consistently across Tasks 3–8.
- `switchTargetMons` derived the same way in ActionPanel throughout.
- `LOCKED_LABELS` keyed on `'recharge' | 'sleep' | 'freeze'` matches the shared type.
