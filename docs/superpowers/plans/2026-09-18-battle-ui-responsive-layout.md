# Battle UI Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded `width: 800` values in the battle UI with fluid `width: '100%', maxWidth: 800` containers, and convert BattleScene sprite positions from absolute pixels to percentages so the layout scales at any viewport width.

**Architecture:** Four component files change. HpBarsRow, BattlePage, and ControlPanel each need a one-line container change plus flex adjustments for the action/log split. BattleScene needs the container resized and all six sprite position objects rewritten as percentage strings derived from the 800×240 reference dimensions.

**Tech Stack:** React 18 + TypeScript, inline `style` objects, Vitest + @testing-library/react (jsdom), pnpm workspace

---

## File Map

| File | Change |
|------|--------|
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Outer container: `width: 800` → `width: '100%', maxWidth: 800` |
| `packages/client/src/battle/BattleScene.tsx` | Container: drop `height: 240`, add `aspectRatio: '10/3'`, `width: '100%'`, `maxWidth: 800`; all sprite pos values → `%` strings |
| `packages/client/src/pages/BattlePage.tsx` | Action/log wrapper: `width: 800` → fluid + `flexWrap: 'wrap'`; action panel: `flex: '1 0 260px'`; turn log: `flex: '0 0 300px', maxWidth: '100%'` |
| `packages/client/src/admin/ControlPanel.tsx` | Same as BattlePage; also header bar `width: 800` → `width: '100%', maxWidth: 800` |
| `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx` | Add container style test |
| `packages/client/src/battle/__tests__/BattleScene.test.tsx` | Add container + sprite style tests |
| `packages/client/src/pages/__tests__/BattlePage.test.tsx` | Add action/log wrapper style test |
| `packages/client/src/admin/__tests__/ControlPanel.test.tsx` | Add header + action/log wrapper style tests |

---

## Percentage Reference

All sprite values are derived from the 800×240 container (x ÷ 800 × 100, y ÷ 240 × 100):

| Role | bottom | left | top | right | width | height |
|------|--------|------|-----|-------|-------|--------|
| own | 7.5% | 7.5% | — | — | 9% | 30% |
| ally | 10% | `${19.375 + i*7.5}%` | — | — | 6.75% | 22.5% |
| foe[0] | — | — | 7.5% | 7.5% | 8% | 26.67% |
| foe[i>0] | — | — | 12.5% | `${18.125 + i*7.5}%` | 6.25% | 20.83% |

---

### Task 1: HpBarsRow responsive container

**Files:**
- Modify: `packages/client/src/battle/overlays/HpBarsRow.tsx:25`
- Test: `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx`

- [ ] **Step 1: Write the failing test**

  Add to the end of the `describe('HpBarsRow')` block in `HpBarsRow.test.tsx`:

  ```tsx
  it('outer container is fluid with max-width 800', () => {
    const { container } = render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.width).toBe('100%');
    expect(outer.style.maxWidth).toBe('800px');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose -t "outer container is fluid"
  ```

  Expected: FAIL — `expect('800px').toBe('100%')`

- [ ] **Step 3: Update HpBarsRow container**

  In `HpBarsRow.tsx` line 25, change:

  ```tsx
  <div style={{ width: 800, background: '#0d0d1a', border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
  ```

  to:

  ```tsx
  <div style={{ width: '100%', maxWidth: 800, background: '#0d0d1a', border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
  ```

- [ ] **Step 4: Run tests to verify pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/battle/overlays/__tests__/HpBarsRow.test.tsx
  ```

  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/client/src/battle/overlays/HpBarsRow.tsx packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx
  git commit -m "fix(client): make HpBarsRow container fluid (max-width 800)"
  ```

---

### Task 2: BattleScene responsive container

**Files:**
- Modify: `packages/client/src/battle/BattleScene.tsx:24-31`
- Test: `packages/client/src/battle/__tests__/BattleScene.test.tsx`

- [ ] **Step 1: Write the failing test**

  Add to the `describe('BattleScene')` block in `BattleScene.test.tsx`:

  ```tsx
  it('scene container is fluid with max-width 800 and aspect-ratio 10/3', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const scene = container.firstChild as HTMLElement;
    expect(scene.style.width).toBe('100%');
    expect(scene.style.maxWidth).toBe('800px');
    expect(scene.style.aspectRatio).toBe('10/3');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose -t "scene container is fluid"
  ```

  Expected: FAIL — `expect('800px').toBe('100%')`

- [ ] **Step 3: Update BattleScene container**

  In `BattleScene.tsx` lines 24–31, replace:

  ```tsx
  <div style={{
    position: 'relative',
    width: 800,
    height: 240,
    background: 'linear-gradient(to bottom, #87ceeb 55%, #5a8a3a 55%)',
    borderRadius: 4,
    overflow: 'hidden',
  }}>
  ```

  with:

  ```tsx
  <div style={{
    position: 'relative',
    width: '100%',
    maxWidth: 800,
    aspectRatio: '10/3',
    background: 'linear-gradient(to bottom, #87ceeb 55%, #5a8a3a 55%)',
    borderRadius: 4,
    overflow: 'hidden',
  }}>
  ```

- [ ] **Step 4: Run tests to verify pass**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/battle/__tests__/BattleScene.test.tsx
  ```

  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/client/src/battle/BattleScene.tsx packages/client/src/battle/__tests__/BattleScene.test.tsx
  git commit -m "fix(client): make BattleScene container fluid with aspect ratio"
  ```

---

### Task 3: BattleScene sprite percentage positions

**Files:**
- Modify: `packages/client/src/battle/BattleScene.tsx:66-72`
- Test: `packages/client/src/battle/__tests__/BattleScene.test.tsx`

- [ ] **Step 1: Write the failing tests**

  Add to `BattleScene.test.tsx` (after the existing `describe('BattleScene')` block, as a new `describe`):

  ```tsx
  describe('sprite positions', () => {
    it('own slot uses percentage positions', () => {
      const state = makeState('a1', 'b1');
      const { container } = render(<BattleScene state={state} mySlotId="a1" />);
      const scene = container.firstChild as HTMLElement;
      const ownSlot = scene.firstChild as HTMLElement;
      expect(ownSlot.style.bottom).toBe('7.5%');
      expect(ownSlot.style.left).toBe('7.5%');
      expect(ownSlot.style.width).toBe('9%');
      expect(ownSlot.style.height).toBe('30%');
    });

    it('foe slot (index 0) uses percentage positions', () => {
      const state = makeState('a1', 'b1');
      const { container } = render(<BattleScene state={state} mySlotId="a1" />);
      const scene = container.firstChild as HTMLElement;
      // makeState produces one own slot, no allies, one foe — children: [0] own, [1] foe
      const foeSlot = scene.children[1] as HTMLElement;
      expect(foeSlot.style.top).toBe('7.5%');
      expect(foeSlot.style.right).toBe('7.5%');
      expect(foeSlot.style.width).toBe('8%');
      expect(foeSlot.style.height).toBe('26.67%');
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose -t "sprite positions"
  ```

  Expected: FAIL — `expect('18px').toBe('7.5%')`

- [ ] **Step 3: Convert sprite positions to percentages**

  In `BattleScene.tsx` lines 66–72, replace the `pos` assignment:

  ```tsx
  const pos: React.CSSProperties = role === 'own'
    ? { bottom: 18, left: 60, width: 72, height: 72 }
    : role === 'ally'
    ? { bottom: 24, left: 155 + index * 60, width: 54, height: 54, opacity: 0.85 }
    : index === 0
    ? { top: 18, right: 60, width: 64, height: 64 }
    : { top: 30, right: 145 + index * 60, width: 50, height: 50, opacity: 0.85 };
  ```

  with:

  ```tsx
  const pos: React.CSSProperties = role === 'own'
    ? { bottom: '7.5%', left: '7.5%', width: '9%', height: '30%' }
    : role === 'ally'
    ? { bottom: '10%', left: `${19.375 + index * 7.5}%`, width: '6.75%', height: '22.5%', opacity: 0.85 }
    : index === 0
    ? { top: '7.5%', right: '7.5%', width: '8%', height: '26.67%' }
    : { top: '12.5%', right: `${18.125 + index * 7.5}%`, width: '6.25%', height: '20.83%', opacity: 0.85 };
  ```

- [ ] **Step 4: Run all BattleScene tests**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/battle/__tests__/BattleScene.test.tsx
  ```

  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/client/src/battle/BattleScene.tsx packages/client/src/battle/__tests__/BattleScene.test.tsx
  git commit -m "fix(client): convert BattleScene sprite positions to percentages"
  ```

---

### Task 4: BattlePage responsive action/log split

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx:91-134`
- Test: `packages/client/src/pages/__tests__/BattlePage.test.tsx`

- [ ] **Step 1: Write the failing test**

  Add to the `describe('BattlePage')` block in `BattlePage.test.tsx`:

  ```tsx
  it('action-log wrapper is fluid with flex-wrap and max-width 800', () => {
    renderBattlePage(makeState());
    const wrapper = screen.getByTestId('action-log-wrapper');
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.maxWidth).toBe('800px');
    expect(wrapper.style.flexWrap).toBe('wrap');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose -t "action-log wrapper"
  ```

  Expected: FAIL — element not found (no `data-testid="action-log-wrapper"` yet)

- [ ] **Step 3: Update BattlePage layout**

  In `BattlePage.tsx` line 91, replace:

  ```tsx
  <div style={{ display: 'flex', gap: 16, width: 800 }}>
  ```

  with:

  ```tsx
  <div data-testid="action-log-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }}>
  ```

  On line 92, replace:

  ```tsx
  <div style={{ flex: 1 }}>
  ```

  with:

  ```tsx
  <div style={{ flex: '1 0 260px' }}>
  ```

  On line 131, replace:

  ```tsx
  <div style={{ width: 300 }}>
  ```

  with:

  ```tsx
  <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
  ```

- [ ] **Step 4: Run all BattlePage tests**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/pages/__tests__/BattlePage.test.tsx
  ```

  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
  git commit -m "fix(client): make BattlePage action/log split responsive"
  ```

---

### Task 5: ControlPanel responsive layout

**Files:**
- Modify: `packages/client/src/admin/ControlPanel.tsx:63,101,118`
- Test: `packages/client/src/admin/__tests__/ControlPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

  Add to the main `describe` block in `ControlPanel.test.tsx` (after line 60 — the describe and makeState are already in scope):

  ```tsx
  it('header bar is fluid with max-width 800', () => {
    const socket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    vi.mocked(getSocket).mockReturnValue(socket as any);
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const header = screen.getByTestId('battle-header-bar');
    expect(header.style.width).toBe('100%');
    expect(header.style.maxWidth).toBe('800px');
  });

  it('action-log wrapper is fluid with flex-wrap and max-width 800', () => {
    const socket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    vi.mocked(getSocket).mockReturnValue(socket as any);
    render(<ControlPanel battleId="b1" onBack={vi.fn()} />);
    const wrapper = screen.getByTestId('action-log-wrapper');
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.maxWidth).toBe('800px');
    expect(wrapper.style.flexWrap).toBe('wrap');
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run --reporter=verbose -t "header bar is fluid|action-log wrapper is fluid"
  ```

  Expected: FAIL — elements not found (no test IDs yet)

- [ ] **Step 3: Update ControlPanel layout**

  In `ControlPanel.tsx` line 63, replace:

  ```tsx
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 800 }}>
  ```

  with:

  ```tsx
  <div data-testid="battle-header-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 800 }}>
  ```

  In `ControlPanel.tsx` line 101, replace:

  ```tsx
  <div style={{ display: 'flex', gap: 16, width: 800 }}>
  ```

  with:

  ```tsx
  <div data-testid="action-log-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }}>
  ```

  In `ControlPanel.tsx` line 102, replace:

  ```tsx
  <div style={{ flex: 1 }}>
  ```

  with:

  ```tsx
  <div style={{ flex: '1 0 260px' }}>
  ```

  In `ControlPanel.tsx` line 118, replace:

  ```tsx
  <div style={{ width: 300 }}>
  ```

  with:

  ```tsx
  <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
  ```

- [ ] **Step 4: Run all ControlPanel tests**

  ```powershell
  pnpm --filter @poke-fighter/client exec vitest run src/admin/__tests__/ControlPanel.test.tsx
  ```

  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/client/src/admin/ControlPanel.tsx packages/client/src/admin/__tests__/ControlPanel.test.tsx
  git commit -m "fix(client): make ControlPanel layout responsive"
  ```

---

### Task 6: Typecheck + full test suite

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the client package**

  ```powershell
  pnpm --filter @poke-fighter/client typecheck
  ```

  Expected: no errors

- [ ] **Step 2: Run the full client test suite**

  ```powershell
  pnpm --filter @poke-fighter/client test
  ```

  Expected: all tests PASS

- [ ] **Step 3: Manual visual check**

  Start the dev server (`.\dev.ps1` or `pnpm --filter @poke-fighter/client dev`) and navigate to `/battle`. Resize the browser window below 600px wide and confirm:
  - HP bar rows shrink fluidly
  - BattleScene scales down keeping the landscape aspect ratio, sprites stay proportional
  - Turn log drops below the action panel instead of overflowing

---
