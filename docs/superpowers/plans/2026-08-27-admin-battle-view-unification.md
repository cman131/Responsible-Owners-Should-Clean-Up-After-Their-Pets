# Admin Battle View Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin battle view (`ControlPanel`) visually match the player battle view (`BattleView`) by extracting a shared `HpBarsRow` component and rewriting the admin layout to use a centered-column structure with NpcTabPanel in the action slot.

**Architecture:** Extract HP bar rendering into a new `HpBarsRow` component that both views share. Rewrite `ControlPanel` to use the same 800px centered-column layout as `BattleView`, with forfeit buttons in the header row and `NpcTabPanel` replacing `MovePanel` in the bottom-left action slot.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, inline styles (existing pattern)

---

## File Map

| File | Action |
|------|--------|
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Create |
| `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx` | Create |
| `packages/client/src/pages/BattlePage.tsx` | Modify — use HpBarsRow, remove inline HP bars and hpColor |
| `packages/client/src/admin/ControlPanel.tsx` | Modify — rewrite layout |
| `packages/client/src/admin/__tests__/ControlPanel.test.tsx` | Create |

---

## Task 1: Create HpBarsRow component (TDD)

**Files:**
- Create: `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`
- Create: `packages/client/src/battle/overlays/HpBarsRow.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HpBarsRow } from '../HpBarsRow.js';
import type { SlotState, PartyMember } from '@poke-fighter/shared';

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
    ...overrides,
  };
}

function makeSlot(slotId: string, overrides: Partial<PartyMember> = {}): SlotState {
  return {
    slotId, displayName: slotId, isNpc: false, isSpectator: false,
    party: [makeMon(overrides)], activePokemonIndex: 0,
  };
}

describe('HpBarsRow', () => {
  it('renders the label text', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('ENEMY')).toBeTruthy();
  });

  it('renders slot display name and level', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('a1 L50')).toBeTruthy();
  });

  it('renders HP numbers', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('100/200')).toBeTruthy();
  });

  it('shows FAINTED for a fainted pokemon', () => {
    render(<HpBarsRow slots={[makeSlot('a1', { fainted: true })]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('FAINTED')).toBeTruthy();
  });

  it('renders highlight indicator for highlightSlotId', () => {
    render(
      <HpBarsRow
        slots={[makeSlot('a1'), makeSlot('a2')]}
        label="MY TEAM"
        variant="own"
        highlightSlotId="a1"
      />
    );
    expect(screen.getByText('▶')).toBeTruthy();
  });

  it('does not render highlight indicator when highlightSlotId is not provided', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.queryByText('▶')).toBeNull();
  });

  it('renders multiple slots', () => {
    render(
      <HpBarsRow slots={[makeSlot('a1'), makeSlot('a2')]} label="MY TEAM" variant="own" />
    );
    expect(screen.getByText('a1 L50')).toBeTruthy();
    expect(screen.getByText('a2 L50')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/client && npx vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: FAIL — `Cannot find module '../HpBarsRow.js'`

- [ ] **Step 3: Implement HpBarsRow**

Create `packages/client/src/battle/overlays/HpBarsRow.tsx`:

```tsx
import type { SlotState } from '@poke-fighter/shared';
import { EffectsIndicator } from './EffectsIndicator.js';

interface Props {
  slots: SlotState[];
  label: string;
  variant: 'enemy' | 'own';
  highlightSlotId?: string;
}

function hpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct > 0.5) return '#27ae60';
  if (pct > 0.2) return '#f39c12';
  return '#e74c3c';
}

export function HpBarsRow({ slots, label, variant, highlightSlotId }: Props) {
  const borderColor = variant === 'enemy' ? '#555' : '#2980b9';
  const labelColor = variant === 'enemy' ? '#e74c3c' : '#3498db';

  return (
    <div style={{ width: 800, background: '#0d0d1a', border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ color: labelColor, fontSize: 9, letterSpacing: 1 }}>{label}</span>
      {slots.map((slot) => {
        const mon = slot.party[slot.activePokemonIndex];
        const isHighlighted = highlightSlotId !== undefined && slot.slotId === highlightSlotId;
        const nameColor = isHighlighted ? '#fff' : (highlightSlotId !== undefined ? '#aaa' : '#fff');
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
            {mon && !mon.fainted ? (
              <>
                <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
                  <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
                </div>
                <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>
                  {mon.currentHp}/{mon.maxHp}
                </span>
                <EffectsIndicator mon={mon} />
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/client && npx vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/HpBarsRow.tsx packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx
git commit -m "feat(client): extract HpBarsRow component from BattleView"
```

---

## Task 2: Update BattleView to use HpBarsRow

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Replace imports and remove hpColor**

In `packages/client/src/pages/BattlePage.tsx`, make these changes:

**Add** `HpBarsRow` to the imports (after line 7, `import { EffectsIndicator }...`):
```tsx
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
```

**Remove** the `EffectsIndicator` import (line 11) — it's no longer used directly in BattlePage:
```tsx
// DELETE this line:
import { EffectsIndicator } from '../battle/overlays/EffectsIndicator.js';
```

**Remove** the `hpColor` function (lines 26–31):
```tsx
// DELETE these lines:
function hpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct > 0.5) return '#27ae60';
  if (pct > 0.2) return '#f39c12';
  return '#e74c3c';
}
```

- [ ] **Step 2: Replace the enemy HP bars block**

Find this block in `BattleView` (the `{/* Enemy HP bars */}` comment section, lines 113–135):

```tsx
      {/* Enemy HP bars */}
      <div style={{ width: 800, background: '#0d0d1a', border: '1px solid #555', borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ color: '#e74c3c', fontSize: 9, letterSpacing: 1 }}>ENEMY</span>
        {foeTeam?.slots.filter((s) => !s.isSpectator).map((slot) => {
          const mon = slot.party[slot.activePokemonIndex];
          return (
            <div key={slot.slotId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#fff', fontSize: 10, width: 130 }}>{slot.displayName}{mon ? ` L${mon.level}` : ''}</span>
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
            </div>
          );
        })}
      </div>
```

Replace it with:

```tsx
      <HpBarsRow
        label="ENEMY"
        variant="enemy"
        slots={foeTeam?.slots.filter((s) => !s.isSpectator) ?? []}
      />
```

- [ ] **Step 3: Replace the own-team HP bars block**

Find the `{/* Own team HP bars */}` comment section (lines 141–164):

```tsx
      {/* Own team HP bars */}
      <div style={{ width: 800, background: '#0d0d1a', border: '1px solid #2980b9', borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ color: '#3498db', fontSize: 9, letterSpacing: 1 }}>MY TEAM</span>
        {myTeam?.slots.filter((s) => !s.isSpectator).map((slot) => {
          const mon = slot.party[slot.activePokemonIndex];
          const isSelf = slot.slotId === mySlotId;
          return (
            <div key={slot.slotId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isSelf ? '#0d1a2e' : 'transparent', borderRadius: 2, padding: '2px 4px' }}>
              <span style={{ color: '#f0c040', fontSize: 10, width: 14 }}>{isSelf ? '▶' : ''}</span>
              <span style={{ color: isSelf ? '#fff' : '#aaa', fontSize: 10, width: 130 }}>{slot.displayName}{mon ? ` L${mon.level}` : ''}</span>
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
            </div>
          );
        })}
      </div>
```

Replace it with:

```tsx
      <HpBarsRow
        label="MY TEAM"
        variant="own"
        slots={myTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        highlightSlotId={mySlotId}
      />
```

- [ ] **Step 4: Run BattlePage tests to confirm they still pass**

```bash
cd packages/client && npx vitest run src/pages/__tests__/BattlePage.test.tsx
```

Expected: All tests PASS (text content like "Charizard L50", "Alice L50", "▶" still renders via HpBarsRow)

- [ ] **Step 5: Run full client test suite**

```bash
cd packages/client && npm test
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx
git commit -m "refactor(client): use HpBarsRow in BattleView, remove inline HP bars"
```

---

## Task 3: Rewrite ControlPanel layout (TDD)

**Files:**
- Create: `packages/client/src/admin/__tests__/ControlPanel.test.tsx`
- Modify: `packages/client/src/admin/ControlPanel.tsx`

- [ ] **Step 1: Write the failing ControlPanel tests**

Create `packages/client/src/admin/__tests__/ControlPanel.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';

vi.mock('../../battle/BattleScene.js', () => ({
  BattleScene: () => <div data-testid="battle-scene" />,
}));
vi.mock('../NpcTabPanel.js', () => ({
  NpcTabPanel: ({ npcRequests }: { npcRequests: unknown[] }) =>
    <div data-testid="npc-tab-panel" data-count={npcRequests.length} />,
}));
vi.mock('../../battle/overlays/TurnLog.js', () => ({
  TurnLog: () => <div data-testid="turn-log" />,
}));
vi.mock('../../battle/overlays/HpBarsRow.js', () => ({
  HpBarsRow: ({ label }: { label: string }) =>
    <div data-testid={`hp-bars-${label.toLowerCase().replace(' ', '-')}`} />,
}));

import { ControlPanel } from '../ControlPanel.js';
import type { BattleState, PartyMember } from '@poke-fighter/shared';

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
    ...overrides,
  };
}

function makeState(): BattleState {
  return {
    battleId: 'b1', label: 'Battle 1', turnNumber: 3, phase: 'action',
    teams: [
      { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [makeMon()], activePokemonIndex: 0 }] },
      { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Blastoise', isNpc: true, isSpectator: false, party: [makeMon({ speciesName: 'blastoise' })], activePokemonIndex: 0 }] },
    ],
    field: { trickroom: 0, gravity: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ]},
  };
}

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.mocked(mockSocket.on).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('ControlPanel', () => {
  it('renders the back button', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('← BATTLES')).toBeTruthy();
  });

  it('renders ADMIN VIEW badge', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('ADMIN VIEW')).toBeTruthy();
  });

  it('renders forfeit buttons', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('FORFEIT TEAM A')).toBeTruthy();
    expect(screen.getByText('FORFEIT TEAM B')).toBeTruthy();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<ControlPanel battleId="b1" onBack={onBack} />);
    fireEvent.click(screen.getByText('← BATTLES'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders HP bars and BattleScene when state:sync arrives', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const stateCall = mockSocket.on.mock.calls.find((c) => c[0] === 'state:sync');
    act(() => { stateCall![1](makeState()); });
    expect(screen.getByTestId('hp-bars-team-b')).toBeTruthy();
    expect(screen.getByTestId('hp-bars-team-a')).toBeTruthy();
    expect(screen.getByTestId('battle-scene')).toBeTruthy();
  });

  it('shows placeholder when no NPC requests are pending', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    expect(screen.getByText('No pending NPC actions')).toBeTruthy();
  });

  it('shows NpcTabPanel when NPC requests arrive', () => {
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const npcCall = mockSocket.on.mock.calls.find((c) => c[0] === 'npc:action-request');
    act(() => {
      npcCall![1]({
        battleId: 'b1',
        slots: [{ slotId: 'b1', displayName: 'Blastoise', request: { slotId: 'b1', validMoves: [], canSwitch: false, switchTargets: [], canTerastallize: false } }],
      });
    });
    expect(screen.getByTestId('npc-tab-panel')).toBeTruthy();
    expect(screen.queryByText('No pending NPC actions')).toBeNull();
  });

  it('emits forfeit action when forfeit button is clicked and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('FORFEIT TEAM A'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'forfeit',
      data: { battleId: 'b1', teamId: 'team-a' },
    });
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/client && npx vitest run src/admin/__tests__/ControlPanel.test.tsx
```

Expected: FAIL — tests fail because ControlPanel still uses old layout (no "← BATTLES" in new test structure, no "No pending NPC actions", no HP bar testids)

- [ ] **Step 3: Rewrite ControlPanel**

Replace the entire contents of `packages/client/src/admin/ControlPanel.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleScene } from '../battle/BattleScene.js';
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { NpcTabPanel } from './NpcTabPanel.js';
import type { ActionRequestPayload, AdminActionPayload } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props { battleId: string; onBack: () => void }

function ControlPanelInner({ battleId, onBack }: Props) {
  const { state, turnLog } = useBattle();
  const [npcRequests, setNpcRequests] = useState<NpcSlotRequest[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onNpcRequest = (payload: { battleId: string; slots: NpcSlotRequest[] }) => {
      if (payload.battleId === battleId) setNpcRequests(payload.slots);
    };
    const onTurnResolve = () => setNpcRequests([]);

    socket.on('npc:action-request', onNpcRequest);
    socket.on('turn:resolve', onTurnResolve);

    return () => {
      socket.off('npc:action-request', onNpcRequest);
      socket.off('turn:resolve', onTurnResolve);
    };
  }, [battleId]);

  function sendAdminAction(type: AdminActionPayload['type'], data: Record<string, unknown>) {
    getSocket().emit('admin:action', { type, data: { battleId, ...data } });
  }

  function handleForfeit(teamId: string) {
    if (confirm(`Forfeit ${teamId}?`)) {
      sendAdminAction('forfeit', { teamId });
    }
  }

  const teamASlots = state?.teams[0]?.slots.filter((s) => !s.isSpectator) ?? [];
  const teamBSlots = state?.teams[1]?.slots.filter((s) => !s.isSpectator) ?? [];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 800 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
        >
          ← BATTLES
        </button>
        {state && (
          <span style={{ color: '#f0c040', fontSize: 12, letterSpacing: 1 }}>
            {state.label} Turn {state.turnNumber}
          </span>
        )}
        <span style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => handleForfeit('team-a')} style={btnStyle}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={btnStyle}>FORFEIT TEAM B</button>
        </div>
      </div>

      {state && (
        <>
          <HpBarsRow label="TEAM B" variant="enemy" slots={teamBSlots} />
          <BattleScene state={state} mySlotId="__admin__" />
          <HpBarsRow label="TEAM A" variant="own" slots={teamASlots} />
        </>
      )}

      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {npcRequests.length > 0 ? (
            <NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>
              No pending NPC actions
            </div>
          )}
        </div>
        <div style={{ width: 300 }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}

export function ControlPanel({ battleId, onBack }: Props) {
  return (
    <BattleProvider mySlotId="__admin__">
      <ControlPanelInner battleId={battleId} onBack={onBack} />
    </BattleProvider>
  );
}

const btnStyle = {
  color: '#fff',
  border: 'none',
  padding: '6px 14px',
  fontSize: 11,
  letterSpacing: 1,
  cursor: 'pointer',
  borderRadius: 3,
  fontFamily: 'inherit',
  background: '#555',
};
```

- [ ] **Step 4: Run ControlPanel tests to verify they pass**

```bash
cd packages/client && npx vitest run src/admin/__tests__/ControlPanel.test.tsx
```

Expected: All 8 tests PASS

- [ ] **Step 5: Run full client test suite**

```bash
cd packages/client && npm test
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/admin/ControlPanel.tsx packages/client/src/admin/__tests__/ControlPanel.test.tsx
git commit -m "feat(client): rewrite ControlPanel to match player battle view layout"
```
