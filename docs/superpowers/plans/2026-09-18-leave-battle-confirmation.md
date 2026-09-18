# Leave-Battle Confirmation Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a native `confirm()` dialog when the player clicks "← Home" while a battle is active, preventing accidental leaves.

**Architecture:** Gate added inline in `handleGoHome` inside `BattleView` — condition is `state && !battleResult`, both already destructured from `useBattle()`. No new state, no new components.

**Tech Stack:** React, Vitest + Testing Library (client tests)

---

### Task 1: Update tests and implement the confirmation gate

**Files:**
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx`
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Write the new failing tests**

Open `packages/client/src/pages/__tests__/BattlePage.test.tsx`.

Add these four tests inside the existing `describe('BattlePage', ...)` block, after the existing `'clicking Home emits player:leave...'` test (around line 240). Also add a `vi.spyOn` to the existing test.

First, patch the **existing** test at line 234 to mock `window.confirm`:

```tsx
it('clicking Home emits player:leave and clears sessionStorage.mySlotId', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  sessionStorage.setItem('mySlotId', 'a1');
  renderBattlePage(makeState());
  fireEvent.click(screen.getByRole('button', { name: /home/i }));
  expect(mockSocket.emit).toHaveBeenCalledWith('player:leave');
  expect(sessionStorage.getItem('mySlotId')).toBeNull();
});
```

Then add three new tests after it:

```tsx
it('Home button does not leave if confirm is cancelled during active battle', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  sessionStorage.setItem('mySlotId', 'a1');
  renderBattlePage(makeState());
  fireEvent.click(screen.getByRole('button', { name: /home/i }));
  expect(mockSocket.emit).not.toHaveBeenCalledWith('player:leave');
  expect(sessionStorage.getItem('mySlotId')).toBe('a1');
});

it('Home button skips confirm when battleResult is set', () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  renderBattlePage(makeState());
  // Simulate battle:end — payload uses `state:` (the socket event shape), not `finalState:`
  const battleEndCall = mockSocket.on.mock.calls.find((c) => c[0] === 'battle:end');
  expect(battleEndCall).toBeTruthy();
  // BattleContext routes battle:end through pendingBattleEnd → flushed in the queue-drain effect.
  // Wrapping in act() lets React run that effect synchronously in the test.
  act(() => {
    battleEndCall![1]({ winningTeamId: 'team-b', state: makeState() });
  });
  fireEvent.click(screen.getByRole('button', { name: /home/i }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(mockSocket.emit).toHaveBeenCalledWith('player:leave');
});

it('Home button skips confirm on the waiting screen (no battle state)', () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  render(
    <MemoryRouter initialEntries={[{ pathname: '/battle', state: null }]}>
      <BattlePage />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /home/i }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(mockSocket.emit).toHaveBeenCalledWith('player:leave');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose src/pages/__tests__/BattlePage.test.tsx
```

Expected: The three new tests fail (FAIL). The patched existing test may also fail because `confirm` isn't mocked in the implementation yet.

- [ ] **Step 3: Implement the confirmation gate**

Open `packages/client/src/pages/BattlePage.tsx`. Replace `handleGoHome` (lines 29–33):

```ts
function handleGoHome() {
  if (state && !battleResult) {
    if (!confirm('Leave this battle? You may not be able to rejoin.')) return;
  }
  getSocket().emit('player:leave');
  sessionStorage.removeItem('mySlotId');
  navigate('/');
}
```

No other changes needed — `state` and `battleResult` are already destructured from `useBattle()` on line 27.

- [ ] **Step 4: Run all tests and verify they pass**

```powershell
pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose src/pages/__tests__/BattlePage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full client test suite to check for regressions**

```powershell
pnpm --filter @poke-fighter/client test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git commit -m "feat(client): confirm dialog before leaving active battle"
```

---

### Task 2: Update tech-debt plan state and move file

**Files:**
- Modify: `docs/tech-debt/battle-ui/no-confirm-dialog-leave-battle.md`
- Move to: `docs/completed-tech-debt/battle-ui/no-confirm-dialog-leave-battle.md`

- [ ] **Step 1: Mark the plan Complete**

Edit `docs/tech-debt/battle-ui/no-confirm-dialog-leave-battle.md` — change the `## State` value from `InProgress` to `Complete`:

```markdown
## State

Complete
```

- [ ] **Step 2: Move the file**

```powershell
New-Item -ItemType Directory -Force -Path "docs/completed-tech-debt/battle-ui"
Move-Item "docs/tech-debt/battle-ui/no-confirm-dialog-leave-battle.md" "docs/completed-tech-debt/battle-ui/no-confirm-dialog-leave-battle.md"
```

- [ ] **Step 3: Commit**

```powershell
git add docs/tech-debt/battle-ui/no-confirm-dialog-leave-battle.md docs/completed-tech-debt/battle-ui/no-confirm-dialog-leave-battle.md
git commit -m "docs: mark no-confirm-dialog-leave-battle tech-debt complete"
```
