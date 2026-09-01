# Battle Playback Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant turn-resolve rendering with a sequential playback queue: log messages appear one at a time with per-entry delays, HP bars drain smoothly, and the action panel is gated until the full sequence finishes.

**Architecture:** `BattleContext` gains a `PlaybackEntry[]` queue, a `displayHp` map, and pending state/request holders. When `turn:resolve` arrives, events are converted to queue entries; a drain `useEffect` fires one `setTimeout` per entry; a release `useEffect` applies the new game state and pending action requests when the queue empties. `HpBarsRow` accepts an optional `displayHp` prop and uses it in place of `mon.currentHp` for bar rendering.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, socket.io-client

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `packages/client/src/battle/BattleContext.tsx` | Modify | Add `PlaybackEntry` type, `eventsToPlaybackEntries` export, queue state, drain/release effects, `displayHp` in context value, updated socket handlers |
| `packages/client/src/battle/__tests__/BattleContext.test.ts` | Create | Unit tests for `eventsToPlaybackEntries` pure function |
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Modify | Add `displayHp?: Map<string, number>` prop, use it for bar width and HP numbers, add CSS transition |
| `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx` | Modify | Add tests for `displayHp` prop behaviour |
| `packages/client/src/pages/BattlePage.tsx` | Modify | Read `displayHp` from `useBattle()`, pass to both `HpBarsRow` instances |
| `packages/client/src/pages/__tests__/BattlePage.test.tsx` | Modify | Add integration test verifying action panel is gated until queue drains |

---

## Task 1: Add `PlaybackEntry` type and `eventsToPlaybackEntries` pure function

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`
- Create: `packages/client/src/battle/__tests__/BattleContext.test.ts`

- [ ] **Step 1: Write failing tests for `eventsToPlaybackEntries`**

Create `packages/client/src/battle/__tests__/BattleContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eventsToPlaybackEntries } from '../BattleContext.js';
import type { TurnResolveEvent } from '@poke-fighter/shared';

describe('eventsToPlaybackEntries', () => {
  it('converts move-used to a single 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'Bulbasaur used Tackle!', delay: 600 });
  });

  it('converts neutral damage-dealt to one entry with hpDelta', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 30, moveId: 'tackle', effectiveness: 1 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      text: 'Dealt 30 damage to b1.',
      hpDelta: { slotId: 'b1', delta: 30 },
      delay: 600,
    });
  });

  it('converts super effective damage to two entries', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 60, moveId: 'ember', effectiveness: 2 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      text: 'Dealt 60 damage to b1.',
      hpDelta: { slotId: 'b1', delta: 60 },
      delay: 600,
    });
    expect(entries[1]).toEqual({ text: "It's super effective!", delay: 300 });
  });

  it('converts not-very-effective damage to two entries', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 15, moveId: 'ember', effectiveness: 0.5 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({ text: "It's not very effective...", delay: 300 });
  });

  it('converts damage-dealt with no moveId to one entry without effectiveness text', () => {
    const events: TurnResolveEvent[] = [
      { type: 'damage-dealt', data: { slotId: 'b1', damage: 10 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Dealt 10 damage to b1.');
  });

  it('converts crit to a 300ms entry', () => {
    const events: TurnResolveEvent[] = [{ type: 'crit', data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: 'A critical hit!', delay: 300 });
  });

  it('converts faint to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'faint', data: { slotId: 'b1' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ text: "b1's Pokémon fainted!", delay: 600 });
  });

  it('converts sleep wake-up to a 600ms entry', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status: 'slp', pokemonName: 'Snorlax' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Snorlax woke up!');
  });

  it('omits status-cured with non-sleep status', () => {
    const events: TurnResolveEvent[] = [
      { type: 'status-cured', data: { slotId: 'a1', status: 'brn', pokemonName: 'Charizard' } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(0);
  });

  it('omits unknown event types', () => {
    const events: TurnResolveEvent[] = [{ type: 'unknown-type' as any, data: {} }];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(0);
  });

  it('converts multiple events in sequence', () => {
    const events: TurnResolveEvent[] = [
      { type: 'move-used', data: { attackerName: 'Pikachu', moveName: 'Thunderbolt' } },
      { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 45, moveId: 'thunderbolt', effectiveness: 2 } },
    ];
    const entries = eventsToPlaybackEntries(events);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.text).toBe('Pikachu used Thunderbolt!');
    expect(entries[1]!.hpDelta).toEqual({ slotId: 'b1', delta: 45 });
    expect(entries[2]!.text).toBe("It's super effective!");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL with import error**

```
cd packages/client && npx vitest run src/battle/__tests__/BattleContext.test.ts
```

Expected: FAIL — `eventsToPlaybackEntries` is not exported from `BattleContext.js`.

- [ ] **Step 3: Add `PlaybackEntry` type and `eventsToPlaybackEntries` to BattleContext.tsx**

Add after the existing `LogEntry` type export at line 7 of `packages/client/src/battle/BattleContext.tsx`:

```ts
export type PlaybackEntry = {
  text?: string;
  hpDelta?: { slotId: string; delta: number };
  delay: number;
};

export function eventsToPlaybackEntries(events: TurnResolveEvent[]): PlaybackEntry[] {
  const entries: PlaybackEntry[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'move-used':
        entries.push({
          text: `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`,
          delay: 600,
        });
        break;
      case 'damage-dealt': {
        const target = String(event.data['targetSlotId'] ?? event.data['slotId']);
        const damage = Number(event.data['damage']);
        const hpDelta = { slotId: target, delta: damage };
        const dmgText = `Dealt ${damage} damage to ${target}.`;
        const eff = event.data['moveId'] ? (event.data['effectiveness'] as number) : 1;
        entries.push({ text: dmgText, hpDelta, delay: 600 });
        if (eff > 1) entries.push({ text: "It's super effective!", delay: 300 });
        else if (eff < 1) entries.push({ text: "It's not very effective...", delay: 300 });
        break;
      }
      case 'crit':
        entries.push({ text: 'A critical hit!', delay: 300 });
        break;
      case 'faint':
        entries.push({ text: `${String(event.data['slotId'])}'s Pokémon fainted!`, delay: 600 });
        break;
      case 'heal':
        entries.push({ text: `${String(event.data['slotId'])} restored HP.`, delay: 600 });
        break;
      case 'status-applied':
        entries.push({ text: `${String(event.data['pokemonName'])} was ${String(event.data['status'])}!`, delay: 600 });
        break;
      case 'status-cured': {
        const text = event.data['status'] === 'slp'
          ? `${String(event.data['pokemonName'] ?? event.data['slotId'])} woke up!`
          : '';
        if (text) entries.push({ text, delay: 600 });
        break;
      }
      case 'terastallize':
        entries.push({ text: `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`, delay: 600 });
        break;
      case 'pokemon-switched':
        entries.push({ text: `${String(event.data['slotId'])}'s Pokémon was switched out!`, delay: 600 });
        break;
      default:
        break;
    }
  }
  return entries;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd packages/client && npx vitest run src/battle/__tests__/BattleContext.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.ts
git commit -m "feat: add PlaybackEntry type and eventsToPlaybackEntries to BattleContext"
```

---

## Task 2: Rewrite `BattleProvider` with playback queue state and socket handlers

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`

This task rewrites the internals of `BattleProvider` only. The exported interface stays backward-compatible except for adding `displayHp` to the context value.

- [ ] **Step 1: Write a failing integration test for the gate behaviour**

Add to `packages/client/src/pages/__tests__/BattlePage.test.tsx` (at the bottom of the `describe('BattlePage')` block):

```tsx
it('gates action panel behind turn:resolve playback queue', async () => {
  vi.useFakeTimers();
  renderBattlePage(makeState());

  const turnResolveCall = mockSocket.on.mock.calls.find((c) => c[0] === 'turn:resolve');
  const actionRequestCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
  expect(turnResolveCall).toBeTruthy();
  expect(actionRequestCall).toBeTruthy();

  // Simulate turn:resolve with one move-used event (600ms delay)
  act(() => {
    turnResolveCall![1]({
      turnNumber: 2,
      events: [{ type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } }],
      state: makeState(),
    });
  });

  // action:request arrives right after (as it does on the server)
  act(() => {
    actionRequestCall![1]({
      slotId: 'a1',
      validMoves: [{ index: 0, moveId: 'watergun', pp: 25, disabled: false, targetType: 'normal', legalTargets: ['b1'] }],
      canSwitch: false, switchTargets: [], canTerastallize: false,
    });
  });

  // Move panel must NOT be visible — queue is still draining
  expect(screen.queryByText('watergun')).toBeNull();

  // Advance past the 600ms delay
  await act(async () => { vi.advanceTimersByTime(700); });

  // Now the queue is empty → pending action released → move panel visible
  expect(screen.getByText('watergun')).toBeTruthy();

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the new test — expect FAIL**

```
cd packages/client && npx vitest run src/pages/__tests__/BattlePage.test.tsx
```

Expected: the new `gates action panel` test FAILs because currently `action:request` is applied immediately regardless of the queue.

- [ ] **Step 3: Replace `BattleProvider` internals**

Replace the entire `BattleProvider` function in `packages/client/src/battle/BattleContext.tsx`. The function signature and JSX at the bottom stay the same; only the body changes. Also add `useRef` to the React import at the top.

**Updated import line (line 1):**
```ts
import { createContext, useContext, useEffect, useRef, useState } from 'react';
```

**Updated `BattleContextValue` interface** — add `displayHp`:
```ts
interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: LogEntry[];
  displayHp: Map<string, number>;
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
}
```

**Full replacement of `BattleProvider`:**
```tsx
export function BattleProvider({ mySlotId, initialState, children }: Props) {
  const [state, setState] = useState<BattleState | null>(initialState ?? null);
  const stateRef = useRef<BattleState | null>(initialState ?? null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<LogEntry[]>([]);
  const [displayHp, setDisplayHp] = useState<Map<string, number>>(new Map());
  const [eventQueue, _setEventQueue] = useState<PlaybackEntry[]>([]);
  const eventQueueRef = useRef<PlaybackEntry[]>([]);
  const [pendingState, setPendingState] = useState<BattleState | null>(null);
  const [pendingActionRequest, setPendingActionRequest] = useState<ActionRequestPayload | null>(null);
  const [pendingSwitchRequest, setPendingSwitchRequest] = useState<SwitchRequestPayload | null>(null);

  function setEventQueue(value: PlaybackEntry[]) {
    eventQueueRef.current = value;
    _setEventQueue(value);
  }

  useEffect(() => { stateRef.current = state; }, [state]);

  // Drain one entry per tick
  useEffect(() => {
    if (eventQueue.length === 0) return;
    const entry = eventQueue[0]!;
    const timer = setTimeout(() => {
      if (entry.text) {
        setTurnLog((prev) => [...prev, { type: 'normal', text: entry.text! }].slice(-50));
      }
      if (entry.hpDelta) {
        const { slotId, delta } = entry.hpDelta;
        setDisplayHp((prev) => {
          const next = new Map(prev);
          next.set(slotId, Math.max(0, (next.get(slotId) ?? 0) - delta));
          return next;
        });
      }
      const nextQueue = eventQueue.slice(1);
      eventQueueRef.current = nextQueue;
      _setEventQueue(nextQueue);
    }, entry.delay);
    return () => clearTimeout(timer);
  }, [eventQueue]);

  // When queue empties, apply pending state and release pending requests
  useEffect(() => {
    if (eventQueue.length > 0 || pendingState === null) return;
    setState(pendingState);
    stateRef.current = pendingState;
    setPendingState(null);
    if (pendingActionRequest !== null) {
      setActionRequest(pendingActionRequest);
      setPendingActionRequest(null);
    }
    if (pendingSwitchRequest !== null) {
      setSwitchRequest(pendingSwitchRequest);
      setPendingSwitchRequest(null);
    }
  }, [eventQueue, pendingState, pendingActionRequest, pendingSwitchRequest]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      stateRef.current = s;
      setDisplayHp(new Map());
      setTurnLog([{ type: 'normal', text: `Battle started! Turn ${s.turnNumber}` }]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
      stateRef.current = s;
    });

    socket.on('turn:resolve', ({ turnNumber, events, state: s }: TurnResolvePayload) => {
      const prevState = stateRef.current;
      if (prevState) {
        const snapshot = new Map<string, number>();
        for (const team of prevState.teams) {
          for (const slot of team.slots) {
            if (!slot.isSpectator) {
              const mon = slot.party[slot.activePokemonIndex];
              if (mon && !mon.fainted) snapshot.set(slot.slotId, mon.currentHp);
            }
          }
        }
        setDisplayHp(snapshot);
      }
      const roundEntry: LogEntry = { type: 'round-start', text: `-------Round ${turnNumber - 1}-------` };
      setTurnLog((prev) => [...prev, roundEntry].slice(-50));
      const entries = eventsToPlaybackEntries(events);
      setPendingState(s);
      setEventQueue(entries);
    });

    socket.on('battle:history', ({ turns }: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => {
      const entries: LogEntry[] = [];
      for (const turn of turns) {
        entries.push({ type: 'round-start', text: `-------Round ${turn.turnNumber - 1}-------` });
        for (const event of turn.events) {
          const result = eventToText(event);
          const texts = Array.isArray(result) ? result : [result];
          for (const text of texts) {
            if (text) entries.push({ type: 'normal', text });
          }
        }
      }
      setTurnLog(entries);
    });

    socket.on('action:request', (payload: ActionRequestPayload) => {
      if (payload.slotId !== mySlotId) return;
      if (eventQueueRef.current.length > 0) {
        setPendingActionRequest(payload);
      } else {
        setActionRequest(payload);
      }
    });
    socket.emit('action:resync');

    socket.on('switch:request', (payload: SwitchRequestPayload) => {
      if (payload.slotId !== mySlotId) return;
      if (eventQueueRef.current.length > 0) {
        setPendingSwitchRequest(payload);
      } else {
        setSwitchRequest(payload);
      }
    });

    socket.on('battle:end', ({ winningTeamId }) => {
      setTurnLog((prev) => [...prev, { type: 'normal', text: `Battle over! Winner: ${winningTeamId}` }]);
      setActionRequest(null);
    });

    return () => {
      socket.off('battle:start');
      socket.off('state:sync');
      socket.off('turn:resolve');
      socket.off('battle:history');
      socket.off('action:request');
      socket.off('switch:request');
      socket.off('battle:end');
    };
  }, [mySlotId]);

  function submitAction(payload: import('@poke-fighter/shared').ActionSubmitPayload) {
    getSocket().emit('action:submit', payload);
    setActionRequest(null);
    setSwitchRequest(null);
  }

  return (
    <BattleContext.Provider value={{ state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, submitAction }}>
      {children}
    </BattleContext.Provider>
  );
}
```

The `eventToText` function at the bottom of the file is kept unchanged (it is still used by the `battle:history` handler).

- [ ] **Step 4: Run all client tests — expect the gate test to PASS and no regressions**

```
cd packages/client && npx vitest run
```

Expected: all existing tests PASS, new gate test PASSES. If any pre-existing test FAILs, investigate before continuing.

- [ ] **Step 5: Commit**

```
git add packages/client/src/battle/BattleContext.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git commit -m "feat: add playback queue and displayHp to BattleProvider; gate action panel until queue drains"
```

---

## Task 3: Update `HpBarsRow` to use `displayHp` prop with animated bar

**Files:**
- Modify: `packages/client/src/battle/overlays/HpBarsRow.tsx`
- Modify: `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`

- [ ] **Step 1: Write failing tests for the `displayHp` prop**

Add to the `describe('HpBarsRow')` block in `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`:

```tsx
it('uses displayHp value for HP display and numbers when provided', () => {
  const displayHp = new Map([['a1', 50]]);
  render(
    <HpBarsRow
      slots={[makeSlot('a1')]}  // mon has currentHp: 100, maxHp: 200
      label="MY TEAM"
      variant="own"
      displayHp={displayHp}
    />
  );
  expect(screen.getByText('50/200')).toBeTruthy();
});

it('falls back to mon.currentHp when displayHp has no entry for the slot', () => {
  const displayHp = new Map<string, number>(); // no entry for a1
  render(
    <HpBarsRow
      slots={[makeSlot('a1')]}
      label="MY TEAM"
      variant="own"
      displayHp={displayHp}
    />
  );
  expect(screen.getByText('100/200')).toBeTruthy();
});

it('falls back to mon.currentHp when displayHp is not provided', () => {
  render(
    <HpBarsRow slots={[makeSlot('a1')]} label="MY TEAM" variant="own" />
  );
  expect(screen.getByText('100/200')).toBeTruthy();
});
```

- [ ] **Step 2: Run new tests — expect FAIL**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: the three new tests FAIL — `HpBarsRow` does not accept `displayHp` prop yet.

- [ ] **Step 3: Update `HpBarsRow.tsx`**

Replace the entire file content of `packages/client/src/battle/overlays/HpBarsRow.tsx`:

```tsx
import type { SlotState } from '@poke-fighter/shared';
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

- [ ] **Step 4: Run all HpBarsRow tests — expect PASS**

```
cd packages/client && npx vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
```

Expected: all tests PASS (existing tests unaffected; three new tests PASS).

- [ ] **Step 5: Commit**

```
git add packages/client/src/battle/overlays/HpBarsRow.tsx packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx
git commit -m "feat: HpBarsRow accepts displayHp prop for animated bar rendering"
```

---

## Task 4: Wire `displayHp` through `BattlePage`

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx`

- [ ] **Step 1: Write a failing test for displayHp being consumed**

Add to `packages/client/src/pages/__tests__/BattlePage.test.tsx`:

```tsx
it('passes displayHp from context to HpBarsRow so HP animates during playback', async () => {
  vi.useFakeTimers();
  renderBattlePage(makeState());
  // makeState has b1 slot with mon currentHp: 68, maxHp: 194

  const turnResolveCall = mockSocket.on.mock.calls.find((c) => c[0] === 'turn:resolve');

  const updatedState = makeState();
  // In the updated state, enemy hp is 0 (fainted) — but during playback displayHp should show 28
  updatedState.teams[1]!.slots[0]!.party[0]!.currentHp = 0;
  updatedState.teams[1]!.slots[0]!.party[0]!.fainted = true;

  act(() => {
    turnResolveCall![1]({
      turnNumber: 2,
      events: [
        { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 40, moveId: 'tackle', effectiveness: 1 } },
      ],
      state: updatedState,
    });
  });

  // Before timer fires, displayHp should show 68 - 0 = 68 (snapshot not yet decremented)
  // HP numbers for b1: initial state has 68 hp
  expect(screen.getByText('68/194')).toBeTruthy();

  // Advance past the 600ms damage entry
  await act(async () => { vi.advanceTimersByTime(700); });

  // After damage entry fires: displayHp for b1 = 68 - 40 = 28
  expect(screen.getByText('28/194')).toBeTruthy();

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run new test — expect FAIL**

```
cd packages/client && npx vitest run src/pages/__tests__/BattlePage.test.tsx
```

Expected: the new `passes displayHp` test FAILs — `BattlePage` is not passing `displayHp` to `HpBarsRow` yet.

- [ ] **Step 3: Update `BattleView` in BattlePage.tsx**

In `packages/client/src/pages/BattlePage.tsx`, change the `useBattle()` destructure line and both `HpBarsRow` usages:

**Line 27 — update destructure:**
```tsx
const { state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, submitAction } = useBattle();
```

**Enemy HpBarsRow (around line 106)** — add `displayHp` prop:
```tsx
<HpBarsRow
  label="ENEMY"
  variant="enemy"
  slots={foeTeam?.slots.filter((s) => !s.isSpectator) ?? []}
  displayHp={displayHp}
/>
```

**Own-team HpBarsRow (around line 115)** — add `displayHp` prop:
```tsx
<HpBarsRow
  label="MY TEAM"
  variant="own"
  slots={myTeam?.slots.filter((s) => !s.isSpectator) ?? []}
  highlightSlotId={mySlotId}
  displayHp={displayHp}
/>
```

- [ ] **Step 4: Run all client tests — expect full PASS**

```
cd packages/client && npx vitest run
```

Expected: all tests PASS with no regressions.

- [ ] **Step 5: Commit**

```
git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git commit -m "feat: wire displayHp from BattleContext through BattlePage to HpBarsRow"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `PlaybackEntry` type with `text`, `hpDelta`, `delay` | Task 1 |
| `eventsToPlaybackEntries` conversion rules (all event types, grouping, delays) | Task 1 |
| `eventQueue`, `pendingState`, `pendingActionRequest`, `pendingSwitchRequest`, `displayHp` state | Task 2 |
| `stateRef` for fresh state reads in socket handlers | Task 2 |
| `turn:resolve` snapshots displayHp, adds round header, queues entries, stores pendingState | Task 2 |
| Drain useEffect fires one entry per tick using entry's `delay` | Task 2 |
| Release useEffect applies pendingState and releases pending requests when queue empties | Task 2 |
| `action:request` / `switch:request` gated on queue | Task 2 |
| `HpBarsRow` `displayHp` prop, fallback to `mon.currentHp` | Task 3 |
| CSS `transition: width 0.4s ease-out` on bar fill | Task 3 |
| `BattlePage` passes `displayHp` to both `HpBarsRow` instances | Task 4 |
| `battle:history` replay is unaffected (uses `eventToText`, no queue) | Task 2 (kept unchanged) |

No gaps found. All spec requirements are covered.

**Placeholder scan:** No TBDs, no "similar to above", no missing code blocks.

**Type consistency check:**
- `PlaybackEntry` defined in Task 1, used in Task 2 — matches.
- `setEventQueue` helper (wraps `_setEventQueue` + `eventQueueRef.current`) used consistently in Task 2.
- `displayHp: Map<string, number>` in context value (Task 2), prop type (Task 3), and consumed in BattlePage (Task 4) — matches.
- `displayHp?.get(slot.slotId) ?? mon?.currentHp ?? 0` in HpBarsRow — safe fallback chain.
