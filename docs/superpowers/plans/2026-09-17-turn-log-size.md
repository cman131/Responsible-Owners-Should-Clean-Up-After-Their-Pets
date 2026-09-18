# TurnLog Size & Collapsible Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the battle log's visible height and entry cap, and add a "Show full log / Collapse" toggle.

**Architecture:** Two source files change — `BattleContext.tsx` gets its three `.slice(-50)` calls bumped to `.slice(-150)`, and `TurnLog.tsx` gains a `useState` expand toggle that switches `maxHeight` between 220 and 400 with a CSS transition. A third file (the tech-debt doc) is updated to reflect completion.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `packages/client/src/battle/BattleContext.tsx` | Change 3× `.slice(-50)` → `.slice(-150)` |
| `packages/client/src/battle/overlays/TurnLog.tsx` | Add `expanded` state + toggle button + dynamic `maxHeight` |
| `packages/client/src/battle/__tests__/TurnLog.test.tsx` | Add expand/collapse tests |
| `docs/tech-debt/battle-ui/turn-log-too-small.md` | Update `State: New` → `State: Complete` |

---

## Task 1: Increase the entry cap in BattleContext.tsx

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx:496,549,597`

There are three calls that cap the log. Change all three from `.slice(-50)` to `.slice(-150)`.

- [ ] **Step 1: Make the change**

In `packages/client/src/battle/BattleContext.tsx`, find and replace every occurrence of `.slice(-50)` with `.slice(-150)`. There are exactly three:

  - Line ~496 (inside the playback drain `useEffect`, the `setTurnLog` that appends a normal entry):
    ```ts
    setTurnLog((prev) => [...prev, { type: 'normal', text: entry.text! }].slice(-150));
    ```
  - Line ~549 (inside the pending-queue-empty `useEffect`, the battle-end winner message):
    ```ts
    setTurnLog(prev => [...prev, { type: 'normal', text: `Battle over! Winner: ${winnerNames}` }].slice(-150));
    ```
  - Line ~597 (inside the `turn:resolve` socket handler, the round-start header):
    ```ts
    setTurnLog((prev) => [...prev, roundEntry].slice(-150));
    ```

- [ ] **Step 2: Verify no remaining .slice(-50) calls exist in BattleContext**

Run:
```
grep -n "slice(-50)" packages/client/src/battle/BattleContext.tsx
```
Expected: no output (zero matches).

- [ ] **Step 3: Run existing BattleContext tests to confirm nothing broke**

```
cd packages/client && npx vitest run src/battle/__tests__/BattleContext.test.ts
```
Expected: all tests pass, no failures.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx
git commit -m "fix: increase turn log entry cap from 50 to 150"
```

---

## Task 2: Add expand/collapse toggle to TurnLog

**Files:**
- Modify: `packages/client/src/battle/overlays/TurnLog.tsx`
- Test: `packages/client/src/battle/__tests__/TurnLog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `packages/client/src/battle/__tests__/TurnLog.test.tsx` and append this new `describe` block after the existing tests:

```tsx
import { fireEvent } from '@testing-library/react';

describe('TurnLog expand/collapse', () => {
  it('renders a "Show full log" button by default', () => {
    render(<TurnLog messages={[]} />);
    expect(screen.getByRole('button', { name: 'Show full log' })).toBeTruthy();
  });

  it('changes button label to "Collapse" when clicked', () => {
    render(<TurnLog messages={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full log' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
  });

  it('changes button label back to "Show full log" when Collapse is clicked', () => {
    render(<TurnLog messages={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Show full log' })).toBeTruthy();
  });
});
```

Note: `fireEvent` is already exported from `@testing-library/react` — the existing import at the top of the test file just needs `fireEvent` added to it. The existing import line is:
```tsx
import { render, screen } from '@testing-library/react';
```
Change it to:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run the new tests to verify they fail**

```
cd packages/client && npx vitest run src/battle/__tests__/TurnLog.test.tsx
```
Expected: the 3 new tests FAIL with something like "Unable to find role 'button' with name 'Show full log'".

- [ ] **Step 3: Implement the toggle in TurnLog.tsx**

Replace the entire contents of `packages/client/src/battle/overlays/TurnLog.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../BattleContext.js';

interface Props { messages: LogEntry[] }

export function TurnLog({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>BATTLE LOG</div>
      <div style={{ ...styles.log, maxHeight: expanded ? 400 : 220 }}>
        {messages.filter((m) => m.text).map((m, i) => (
          <div
            key={i}
            data-testid="log-entry"
            style={m.type === 'round-start' ? styles.roundStart : styles.message}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <button style={styles.toggle} onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Collapse' : 'Show full log'}
      </button>
    </div>
  );
}

const styles = {
  container: { background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { color: '#555', fontSize: 10, letterSpacing: 2 },
  log: { overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 3, transition: 'max-height 0.2s ease' },
  message: { color: '#ccc', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4 },
  roundStart: { color: '#f0c040', fontSize: 11, letterSpacing: 2, textAlign: 'center' as const, fontFamily: 'inherit', lineHeight: 1.4 },
  toggle: { background: 'none', border: 'none', color: '#888', fontSize: 11, cursor: 'pointer', padding: 0, textAlign: 'left' as const, letterSpacing: 1 },
};
```

Key changes from the original:
- Added `useState` to the React import
- Added `const [expanded, setExpanded] = useState(false)`
- `styles.log` no longer has a static `maxHeight` — it is applied inline as `expanded ? 400 : 220` with `transition: 'max-height 0.2s ease'`
- Added a `<button>` below the scroll div

- [ ] **Step 4: Run all TurnLog tests to verify they pass**

```
cd packages/client && npx vitest run src/battle/__tests__/TurnLog.test.tsx
```
Expected: all tests pass (the 4 original + 3 new = 7 total).

- [ ] **Step 5: Run the full client test suite to check for regressions**

```
cd packages/client && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/battle/overlays/TurnLog.tsx packages/client/src/battle/__tests__/TurnLog.test.tsx
git commit -m "feat: expand TurnLog height to 220px and add Show full log toggle"
```

---

## Task 3: Mark tech-debt item as Complete

**Files:**
- Modify: `docs/tech-debt/battle-ui/turn-log-too-small.md`

- [ ] **Step 1: Update the State field**

In `docs/tech-debt/battle-ui/turn-log-too-small.md`, change line 5:
```
New
```
to:
```
Complete
```

- [ ] **Step 2: Commit**

```bash
git add docs/tech-debt/battle-ui/turn-log-too-small.md
git commit -m "docs: mark turn-log-too-small tech debt as Complete"
```
