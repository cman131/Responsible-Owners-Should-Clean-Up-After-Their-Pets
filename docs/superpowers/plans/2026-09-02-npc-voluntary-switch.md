# NPC Voluntary Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the admin to optionally switch an NPC's active Pokémon instead of picking a move, mirroring the player switch flow.

**Architecture:** Two-part change: (1) the server's `buildNpcRequests()` currently hardcodes `canSwitch: false` — fix it to apply the same ingrain-aware logic as `buildPlayerRequests()`; (2) `NpcTabPanel` gets a `switchingSlotId` state that toggles between the move grid and a bench-Pokémon list with a Cancel button, matching the player's `MovePanel` → `SwitchPanel` flow.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, pnpm workspaces

---

### Task 1: Add failing client tests for the voluntary switch UI

**Files:**
- Modify: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`

- [ ] **Step 1: Add test helpers and 5 new test cases**

Open `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`. After the existing `makeRequest` helper (line 15), add a `makeSwitchableRequest` helper and a `stateWithBench` constant, then add a new `describe` block at the end of the file:

```ts
const makeSwitchableRequest = (slotId: string, legalTargets: string[], switchTargets: string[]): ActionRequestPayload => ({
  slotId,
  validMoves: [
    { index: 0, moveId: 'surf', pp: 15, disabled: false, targetType: 'normal', legalTargets },
    { index: 1, moveId: 'icebeam', pp: 10, disabled: false, targetType: 'normal', legalTargets },
    { index: 2, moveId: 'blizzard', pp: 5, disabled: false, targetType: 'allAdjacentFoes', legalTargets },
    { index: 3, moveId: 'flash', pp: 20, disabled: false, targetType: 'normal', legalTargets },
  ],
  canSwitch: true,
  switchTargets,
  canTerastallize: false,
});

const benchMon = {
  instanceId: 'bench1', speciesId: 7, speciesName: 'squirtle', nickname: 'Squirtle',
  level: 40, currentHp: 100, maxHp: 120,
  stats: { hp: 120, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
  ability: 'torrent',
  moves: [
    { moveId: 'watergun', currentPp: 25, maxPp: 25 },
    { moveId: 'tackle', currentPp: 35, maxPp: 35 },
    { moveId: 'tail-whip', currentPp: 30, maxPp: 30 },
    { moveId: 'bubble', currentPp: 30, maxPp: 30 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const stateWithBench: BattleState = {
  ...state,
  teams: [
    state.teams[0]!,
    {
      teamId: 'team-b',
      slots: [
        { ...state.teams[1]!.slots[0]!, party: [state.teams[1]!.slots[0]!.party[0]!, benchMon] },
        state.teams[1]!.slots[1]!,
      ],
    },
  ],
};

describe('NpcTabPanel — voluntary switch', () => {
  it('shows SWITCH POKÉMON button when canSwitch is true and moves are available', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    expect(screen.getByText('SWITCH POKÉMON')).toBeTruthy();
  });

  it('clicking SWITCH POKÉMON shows bench list and Cancel button', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    expect(screen.getByText('Squirtle')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.queryByText('surf')).toBeNull();
  });

  it('clicking a bench Pokémon submits the switch action and marks slot submitted', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('Squirtle'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'npc-action',
      data: { battleId: 'test', slotId: 'b1', action: { type: 'switch', targetInstanceId: 'bench1' } },
    });
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('clicking Cancel returns to the move grid without submitting', () => {
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: makeSwitchableRequest('b1', ['a1'], ['bench1']) }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('surf')).toBeTruthy();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('forced switch (no valid moves, canSwitch true) shows no Cancel button', () => {
    const forcedRequest: ActionRequestPayload = {
      slotId: 'b1', validMoves: [], canSwitch: true, switchTargets: ['bench1'], canTerastallize: false,
    };
    const requests = [{ slotId: 'b1', displayName: 'Blastoise', request: forcedRequest }];
    render(<NpcTabPanel battleId="test" npcRequests={requests} state={stateWithBench} />);
    expect(screen.getByText('Squirtle')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they all fail**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: 5 new tests FAIL. The existing tests should still pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/client/src/admin/__tests__/NpcTabPanel.test.tsx
git commit -m "test: add failing tests for NPC voluntary switch UI"
```

---

### Task 2: Implement the voluntary switch UI in NpcTabPanel

**Files:**
- Modify: `packages/client/src/admin/NpcTabPanel.tsx`

- [ ] **Step 1: Add `switchingSlotId` state and reset it on new rounds**

Open `packages/client/src/admin/NpcTabPanel.tsx`. After line 22 (existing `selectedTarget` state), add:

```ts
const [switchingSlotId, setSwitchingSlotId] = useState<string | null>(null);
```

In the existing `useEffect` (lines 24-29), add `setSwitchingSlotId(null)` alongside the other resets:

```ts
useEffect(() => {
  setSubmitted(new Set());
  setPendingMove(null);
  setSelectedTarget('');
  setSwitchingSlotId(null);
  if (npcRequests.length > 0) setActiveTab(npcRequests[0]!.slotId);
}, [npcRequests]);
```

- [ ] **Step 2: Replace the tab body rendering with the three-branch structure**

Find the `{activeRequest && (` block (line 113) and replace the entire `<div style={styles.tabBody}>` content with:

```tsx
<div style={styles.tabBody}>
  {switchingSlotId === activeRequest.slotId ? (
    <div>
      <div style={{ color: '#27ae60', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>SWITCH POKÉMON</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {activeRequest.request.switchTargets.map((instanceId) => {
          const mon = getBenchMon(activeRequest.slotId, instanceId);
          const done = submitted.has(activeRequest.slotId);
          return (
            <button
              key={instanceId}
              disabled={!mon || done}
              onClick={() => { submitNpcSwitch(activeRequest.slotId, instanceId); setSwitchingSlotId(null); }}
              style={{ ...styles.moveBtn, opacity: !mon || done ? 0.4 : 1, cursor: !mon || done ? 'not-allowed' : 'pointer', justifyContent: 'flex-start', gap: 8 }}
            >
              <span style={{ fontSize: 11 }}>{mon?.nickname ?? instanceId}</span>
              {mon && (
                <>
                  <span style={{ color: '#aaa', fontSize: 10 }}>Lv.{mon.level}</span>
                  <span style={{ color: '#aaa', fontSize: 10 }}>{mon.currentHp}/{mon.maxHp} HP</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <button onClick={() => setSwitchingSlotId(null)} style={{ ...styles.cancelBtn, marginTop: 8 }}>Cancel</button>
    </div>
  ) : activeRequest.request.validMoves.length === 0 && activeRequest.request.canSwitch ? (
    <div>
      <div style={{ color: '#e74c3c', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
        SWITCH REQUIRED
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {activeRequest.request.switchTargets.map((instanceId) => {
          const mon = getBenchMon(activeRequest.slotId, instanceId);
          const done = submitted.has(activeRequest.slotId);
          return (
            <button
              key={instanceId}
              disabled={!mon || done}
              onClick={() => submitNpcSwitch(activeRequest.slotId, instanceId)}
              style={{
                ...styles.moveBtn,
                opacity: !mon || done ? 0.4 : 1,
                cursor: !mon || done ? 'not-allowed' : 'pointer',
                justifyContent: 'flex-start',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11 }}>{mon?.nickname ?? instanceId}</span>
              {mon && (
                <>
                  <span style={{ color: '#aaa', fontSize: 10 }}>Lv.{mon.level}</span>
                  <span style={{ color: '#aaa', fontSize: 10 }}>{mon.currentHp}/{mon.maxHp} HP</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  ) : (
    <>
      {/* VS summary — unique targets across all moves */}
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

      {/* Move grid */}
      <div style={styles.moveGrid}>
        {activeRequest.request.validMoves.map((mv) => {
          const done = submitted.has(activeRequest.slotId);
          const disabled = mv.disabled || mv.pp === 0 || done;
          return (
            <button
              key={mv.index}
              disabled={disabled}
              onClick={() => handleMoveClick(activeRequest.slotId, mv)}
              style={{ ...styles.moveBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
            >
              <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{mv.moveId}</span>
              <span style={{ color: '#aaa', fontSize: 10 }}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>

      {/* Voluntary switch button */}
      {activeRequest.request.canSwitch && activeRequest.request.switchTargets.length > 0 && !submitted.has(activeRequest.slotId) && (
        <button
          onClick={() => setSwitchingSlotId(activeRequest.slotId)}
          style={{ ...styles.moveBtn, background: '#1a3a1a', borderColor: '#27ae60', marginTop: 4, width: '100%', justifyContent: 'center' }}
        >
          SWITCH POKÉMON
        </button>
      )}

      {/* Target selector — multi-target only */}
      {pendingMove?.slotId === activeRequest.slotId && (() => {
        const pendingMoveLegalTargets = activeRequest.request.validMoves.find((m) => m.index === pendingMove.moveIndex)?.legalTargets ?? [];
        return (
          <div style={styles.targetRow}>
            <span style={{ color: '#aaa', fontSize: 10 }}>Target:</span>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              style={styles.targetSelect}
            >
              {pendingMoveLegalTargets.map((t) => (
                <option key={t} value={t}>{getDisplayName(t)}</option>
              ))}
            </select>
            <button
              onClick={() => submitNpcAction(activeRequest.slotId, pendingMove.moveIndex, selectedTarget)}
              style={styles.confirmBtn}
            >
              Confirm
            </button>
            <button onClick={() => setPendingMove(null)} style={styles.cancelBtn}>✕</button>
          </div>
        );
      })()}
    </>
  )}
</div>
```

- [ ] **Step 3: Run the full client test suite and confirm all tests pass**

```
pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: All tests PASS (5 existing + 5 new = 10 total).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/admin/NpcTabPanel.tsx
git commit -m "feat: add voluntary switch option to admin NPC tab panel"
```

---

### Task 3: Enable canSwitch in server NPC requests

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`

- [ ] **Step 1: Update `buildNpcRequests()` to apply ingrain-aware switch logic**

Open `packages/server/src/socket/BattleRoom.ts`. Find `buildNpcRequests()` (around line 375). Replace the hardcoded `canSwitch: false, switchTargets: []` with the same ingrain check used in `buildPlayerRequests()`:

Current code (lines ~382-395):
```ts
result.push({
  slotId: slot.slotId,
  displayName: slot.displayName,
  request: {
    slotId: slot.slotId,
    validMoves: this.buildValidMoves(slot.slotId, active),
    canSwitch: false,
    switchTargets: [],
    canTerastallize: !active.hasTerastallized && !!active.teraType,
  },
});
```

Replace with:
```ts
const hasIngrain = active.volatileStatus.some(v => v.name === 'ingrain');
result.push({
  slotId: slot.slotId,
  displayName: slot.displayName,
  request: {
    slotId: slot.slotId,
    validMoves: this.buildValidMoves(slot.slotId, active),
    canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
    switchTargets: hasIngrain ? [] : slot.party
      .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
      .map((p) => p.instanceId),
    canTerastallize: !active.hasTerastallized && !!active.teraType,
  },
});
```

- [ ] **Step 2: Run the full server test suite**

```
pnpm --filter @poke-fighter/server test
```

Expected: All existing server tests PASS.

- [ ] **Step 3: Run the full client test suite**

```
pnpm --filter @poke-fighter/client test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts
git commit -m "feat: enable canSwitch in NPC action requests using ingrain-aware logic"
```
