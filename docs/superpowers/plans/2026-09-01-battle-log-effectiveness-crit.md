# Battle Log Effectiveness & Crit Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display "It's super effective!", "It's not very effective...", and "A critical hit!" as separate battle log lines when applicable, matching mainline Pokemon games.

**Architecture:** Client-only change to `BattleContext.tsx`. Change `eventToText` return type to `string | string[]`, update the event pipeline to use `flatMap`, add a `crit` handler, and update the `damage-dealt` handler to append an effectiveness line for move hits.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/client/src/battle/BattleContext.tsx` |
| Modify | `packages/client/src/battle/__tests__/BattleContext.test.tsx` |

---

### Task 1: Handle `crit` events and update pipeline to support multi-line events

**Files:**
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.tsx`
- Modify: `packages/client/src/battle/BattleContext.tsx`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `packages/client/src/battle/__tests__/BattleContext.test.tsx`, after the existing `battle:history` describe block:

```typescript
describe('crit event', () => {
  it('produces a "A critical hit!" log entry', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'crit', data: { slotId: 's1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(2); // round-start + crit
    expect(log[1]).toEqual({ type: 'normal', text: 'A critical hit!' });
  });

  it('crit message also appears via battle:history', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [{ type: 'crit', data: { slotId: 's1' } }] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[1]).toEqual({ type: 'normal', text: 'A critical hit!' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run --reporter=verbose packages/client/src/battle/__tests__/BattleContext.test.tsx
```

Expected: the two new crit tests fail (currently `crit` falls through to the `default` case which returns `''`, so it gets filtered out).

- [ ] **Step 3: Change `eventToText` return type and add the `crit` handler**

In `packages/client/src/battle/BattleContext.tsx`, change the `eventToText` function signature from:

```typescript
function eventToText(event: TurnResolveEvent): string {
```

to:

```typescript
function eventToText(event: TurnResolveEvent): string | string[] {
```

Then add a `crit` case to the `switch` statement (before the `default`):

```typescript
case 'crit': return 'A critical hit!';
```

- [ ] **Step 4: Update the event pipeline in `turn:resolve` to use `flatMap`**

In the `turn:resolve` socket handler, replace:

```typescript
const eventEntries: LogEntry[] = events
  .map((e) => eventToText(e))
  .filter(Boolean)
  .map((text) => ({ type: 'normal' as const, text }));
```

with:

```typescript
const eventEntries: LogEntry[] = events
  .flatMap((e) => {
    const result = eventToText(e);
    return Array.isArray(result) ? result : [result];
  })
  .filter(Boolean)
  .map((text) => ({ type: 'normal' as const, text }));
```

- [ ] **Step 5: Update the event pipeline in `battle:history` to use `flatMap`**

In the `battle:history` socket handler, replace:

```typescript
const text = eventToText(event);
if (text) entries.push({ type: 'normal', text });
```

with:

```typescript
const result = eventToText(event);
const texts = Array.isArray(result) ? result : [result];
for (const text of texts) {
  if (text) entries.push({ type: 'normal', text });
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```
npx vitest run --reporter=verbose packages/client/src/battle/__tests__/BattleContext.test.tsx
```

Expected: all tests pass including the two new crit tests.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.tsx
git commit -m "feat: show 'A critical hit!' in battle log"
```

---

### Task 2: Add effectiveness lines to move damage events

**Files:**
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.tsx`
- Modify: `packages/client/src/battle/BattleContext.tsx`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `packages/client/src/battle/__tests__/BattleContext.test.tsx`, after the `crit event` describe block:

```typescript
describe('damage-dealt effectiveness lines', () => {
  function fireDamageEvent(effectiveness: number, hasMove = true) {
    const data: Record<string, unknown> = {
      damage: 40,
      targetSlotId: 's2',
      effectiveness,
      remainingHp: 60,
    };
    if (hasMove) {
      data['moveId'] = 'thunderbolt';
      data['attackerSlotId'] = 's1';
    } else {
      data['source'] = 'brn';
      data['slotId'] = 's2';
    }
    return { type: 'damage-dealt' as const, data };
  }

  it('appends "It\'s super effective!" as a separate log entry when effectiveness > 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(2)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(3); // round-start + damage + effectiveness
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
    expect(log[2]).toEqual({ type: 'normal', text: "It's super effective!" });
  });

  it('appends "It\'s not very effective..." as a separate log entry when effectiveness < 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(0.5)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(3); // round-start + damage + effectiveness
    expect(log[2]).toEqual({ type: 'normal', text: "It's not very effective..." });
  });

  it('does not add an effectiveness line when effectiveness === 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(1)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(2); // round-start + damage only
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
  });

  it('does not add an effectiveness line for passive damage (no moveId)', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(2, false)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    // passive damage uses slotId not targetSlotId; only round-start + one damage line
    expect(log).toHaveLength(2);
  });

  it('effectiveness lines also appear via battle:history', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [fireDamageEvent(4)] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[2]).toEqual({ type: 'normal', text: "It's super effective!" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run --reporter=verbose packages/client/src/battle/__tests__/BattleContext.test.tsx
```

Expected: the five new effectiveness tests fail (the `damage-dealt` case currently returns a single string regardless of `effectiveness`).

- [ ] **Step 3: Update the `damage-dealt` handler in `eventToText`**

In `packages/client/src/battle/BattleContext.tsx`, replace the existing `damage-dealt` case:

```typescript
case 'damage-dealt': return `Dealt ${String(event.data['damage'])} damage to ${String(event.data['targetSlotId'])}.`;
```

with:

```typescript
case 'damage-dealt': {
  const dmgLine = `Dealt ${String(event.data['damage'])} damage to ${String(event.data['targetSlotId'])}.`;
  if (!event.data['moveId']) return dmgLine;
  const eff = event.data['effectiveness'] as number;
  if (eff > 1) return [dmgLine, "It's super effective!"];
  if (eff < 1) return [dmgLine, "It's not very effective..."];
  return dmgLine;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run --reporter=verbose packages/client/src/battle/__tests__/BattleContext.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.tsx
git commit -m "feat: show type effectiveness in battle log for move damage"
```
