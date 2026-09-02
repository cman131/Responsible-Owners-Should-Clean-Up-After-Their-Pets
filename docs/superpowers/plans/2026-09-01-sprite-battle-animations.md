# Sprite Battle Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lunge (attack), hit-flash, and faint-drop CSS animations to battle sprites, driven by the existing playback queue in BattleContext.

**Architecture:** `PlaybackEntry` gains an optional `animation` field populated by `eventsToPlaybackEntries`. The drain loop in `BattleContext` sets transient `animatingSlots` state when draining an animated entry and clears it via `setTimeout`. `BattleScene` receives `animatingSlots` as a prop and applies CSS class names defined in a new `battle-animations.css` file.

**Tech Stack:** React 18, Vitest 1, @testing-library/react, CSS animations (keyframes + classes), Vite

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/client/src/battle/BattleContext.tsx` | Modify | Add `animation?` to `PlaybackEntry`; populate it in `eventsToPlaybackEntries`; add `animatingSlots` state + drain-loop clearing; expose via context |
| `packages/client/src/battle/__tests__/BattleContext.test.ts` | Modify | Update 3 existing tests + add 4 new tests for animation fields in entries |
| `packages/client/src/battle/__tests__/BattleContext.test.tsx` | Modify | Add `animatingSlots` drain-loop tests (set on drain, clear after delay) |
| `packages/client/src/battle/battle-animations.css` | Create | `@keyframes` definitions + `.anim-*` CSS classes |
| `packages/client/src/battle/BattleScene.tsx` | Modify | Accept `animatingSlots` prop; import CSS; apply class in `renderSprite` |
| `packages/client/src/battle/__tests__/BattleScene.test.tsx` | Modify | Add tests verifying correct class per role/kind |
| `packages/client/src/pages/BattlePage.tsx` | Modify | Destructure `animatingSlots` from `useBattle()`; pass to `<BattleScene>` |

---

## Task 1: Update eventsToPlaybackEntries — tests first

**Files:**
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.ts`

- [ ] **Step 1: Update 3 existing tests that will break + add 4 new failing tests**

Open `packages/client/src/battle/__tests__/BattleContext.test.ts`.

**Update** the `'converts neutral damage-dealt to one entry with hpDelta'` test assertion to include `animation`:

```ts
expect(entries[0]).toEqual({
  text: 'Dealt 30 damage to b1.',
  hpDelta: { slotId: 'b1', delta: 30 },
  animation: { slotId: 'b1', kind: 'hit' },
  delay: 600,
});
```

**Update** the `'converts super effective damage to two entries'` test assertion for `entries[0]`:

```ts
expect(entries[0]).toEqual({
  text: 'Dealt 60 damage to b1.',
  hpDelta: { slotId: 'b1', delta: 60 },
  animation: { slotId: 'b1', kind: 'hit' },
  delay: 600,
});
```

**Update** the `'converts faint to a 600ms entry'` test assertion:

```ts
expect(entries[0]).toEqual({
  text: "b1's Pokémon fainted!",
  animation: { slotId: 'b1', kind: 'faint' },
  delay: 600,
});
```

**Add** these four new tests at the end of the `describe` block:

```ts
it('adds attack animation to move-used entry when attackerSlotId is present', () => {
  const events: TurnResolveEvent[] = [
    { type: 'move-used', data: { attackerSlotId: 'a1', attackerName: 'Bulbasaur', moveName: 'Tackle', moveId: 'tackle' } },
  ];
  const entries = eventsToPlaybackEntries(events);
  expect(entries[0]!.animation).toEqual({ slotId: 'a1', kind: 'attack' });
});

it('omits animation on move-used when attackerSlotId is absent', () => {
  const events: TurnResolveEvent[] = [
    { type: 'move-used', data: { attackerName: 'Bulbasaur', moveName: 'Tackle' } },
  ];
  const entries = eventsToPlaybackEntries(events);
  expect(entries[0]!.animation).toBeUndefined();
});

it('adds hit animation to damage-dealt entry', () => {
  const events: TurnResolveEvent[] = [
    { type: 'damage-dealt', data: { slotId: 'b1', targetSlotId: 'b1', damage: 30, moveId: 'tackle', effectiveness: 1 } },
  ];
  const entries = eventsToPlaybackEntries(events);
  expect(entries[0]!.animation).toEqual({ slotId: 'b1', kind: 'hit' });
});

it('adds faint animation to faint entry', () => {
  const events: TurnResolveEvent[] = [
    { type: 'faint', data: { slotId: 'b1' } },
  ];
  const entries = eventsToPlaybackEntries(events);
  expect(entries[0]!.animation).toEqual({ slotId: 'b1', kind: 'faint' });
});
```

- [ ] **Step 2: Run tests to confirm the 3 updated + 4 new tests fail**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: the 3 updated assertions and 4 new tests fail; all other tests pass.

---

## Task 2: Implement eventsToPlaybackEntries changes

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`

- [ ] **Step 1: Add `animation?` to `PlaybackEntry` type**

Locate the `PlaybackEntry` type (around line 9) and add the `animation` field:

```ts
export type PlaybackEntry = {
  text?: string;
  hpDelta?: { slotId: string; delta: number };
  animation?: { slotId: string; kind: 'attack' | 'hit' | 'faint' };
  delay: number;
};
```

- [ ] **Step 2: Update the three event cases in `eventsToPlaybackEntries`**

Replace the `'move-used'` case:

```ts
case 'move-used': {
  const attackerSlotId = event.data['attackerSlotId'];
  const entry: PlaybackEntry = {
    text: `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`,
    delay: 600,
  };
  if (attackerSlotId) entry.animation = { slotId: String(attackerSlotId), kind: 'attack' };
  entries.push(entry);
  break;
}
```

Replace the `'damage-dealt'` case (add `animation` to the first `entries.push`):

```ts
case 'damage-dealt': {
  const target = String(event.data['targetSlotId'] ?? event.data['slotId']);
  const damage = Number(event.data['damage']);
  const hpDelta = { slotId: target, delta: damage };
  const dmgText = `Dealt ${damage} damage to ${target}.`;
  const eff = event.data['moveId'] ? (event.data['effectiveness'] as number) : 1;
  entries.push({ text: dmgText, hpDelta, animation: { slotId: target, kind: 'hit' }, delay: 600 });
  if (eff > 1) entries.push({ text: "It's super effective!", delay: 300 });
  else if (eff < 1) entries.push({ text: "It's not very effective...", delay: 300 });
  break;
}
```

Replace the `'faint'` case:

```ts
case 'faint': {
  const slotId = String(event.data['slotId']);
  entries.push({ text: `${slotId}'s Pokémon fainted!`, animation: { slotId, kind: 'faint' }, delay: 600 });
  break;
}
```

- [ ] **Step 3: Run tests and confirm they all pass**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.ts
git commit -m "feat: add animation signals to PlaybackEntry and eventsToPlaybackEntries"
```

---

## Task 3: Write failing animatingSlots drain-loop tests

**Files:**
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.tsx`

- [ ] **Step 1: Add helper and new describe block**

Open `packages/client/src/battle/__tests__/BattleContext.test.tsx`. Add the helper function after `fireTurnResolveAndDrain` and before the existing `describe('turn:resolve', ...)` block:

```ts
async function fireTurnAndAdvance(events: unknown[], ms: number) {
  act(() => {
    socketListeners['turn:resolve']?.({
      turnNumber: 2,
      events,
      state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
    });
  });
  await act(async () => { vi.advanceTimersByTime(ms); });
}
```

Add this describe block at the end of the file:

```ts
describe('animatingSlots', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is empty initially', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    expect(result.current.animatingSlots.size).toBe(0);
  });

  it('sets attack kind for attacker slot when move-used entry is drained', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    // Advance 650ms: past the 600ms entry delay, but before the 350ms clear timer (fires at 950ms)
    await fireTurnAndAdvance(
      [{ type: 'move-used', data: { attackerSlotId: 'a1', attackerName: 'Bulbasaur', moveName: 'Tackle', moveId: 'tackle' } }],
      650,
    );
    expect(result.current.animatingSlots.get('a1')).toBe('attack');
  });

  it('clears attack slot after 350ms', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'move-used', data: { attackerSlotId: 'a1', attackerName: 'Bulbasaur', moveName: 'Tackle', moveId: 'tackle' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    await act(async () => { vi.advanceTimersByTime(650); }); // entry fires at 600ms; clear timer starts
    expect(result.current.animatingSlots.get('a1')).toBe('attack');
    await act(async () => { vi.advanceTimersByTime(400); }); // total 1050ms, clear fires at 950ms (600+350)
    expect(result.current.animatingSlots.get('a1')).toBeUndefined();
  });

  it('sets hit kind for target slot when damage-dealt entry is drained', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    // Advance 650ms: past 600ms entry delay, before 300ms clear timer (fires at 900ms)
    await fireTurnAndAdvance(
      [{ type: 'damage-dealt', data: { targetSlotId: 's2', damage: 30, moveId: 'tackle', effectiveness: 1 } }],
      650,
    );
    expect(result.current.animatingSlots.get('s2')).toBe('hit');
  });

  it('clears hit slot after 300ms', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'damage-dealt', data: { targetSlotId: 's2', damage: 30, moveId: 'tackle', effectiveness: 1 } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    await act(async () => { vi.advanceTimersByTime(650); });
    expect(result.current.animatingSlots.get('s2')).toBe('hit');
    await act(async () => { vi.advanceTimersByTime(350); }); // total 1000ms, clear fires at 900ms (600+300)
    expect(result.current.animatingSlots.get('s2')).toBeUndefined();
  });

  it('sets faint kind for slot when faint entry is drained', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    await fireTurnAndAdvance(
      [{ type: 'faint', data: { slotId: 'b1' } }],
      650,
    );
    expect(result.current.animatingSlots.get('b1')).toBe('faint');
  });

  it('clears faint slot after 600ms', async () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'faint', data: { slotId: 'b1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    await act(async () => { vi.advanceTimersByTime(650); }); // entry fires at 600ms; clear timer starts
    expect(result.current.animatingSlots.get('b1')).toBe('faint');
    await act(async () => { vi.advanceTimersByTime(700); }); // total 1350ms, clear fires at 1200ms (600+600)
    expect(result.current.animatingSlots.get('b1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm the new animatingSlots tests fail**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: the 7 new animatingSlots tests fail (property `animatingSlots` does not exist on context); all prior tests pass.

---

## Task 4: Implement animatingSlots in BattleContext

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`

- [ ] **Step 1: Add animatingSlots to the context interface and state**

Locate `BattleContextValue` (around line 70) and add the field:

```ts
interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: LogEntry[];
  displayHp: Map<string, number>;
  animatingSlots: Map<string, 'attack' | 'hit' | 'faint'>;
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
}
```

Inside `BattleProvider`, add the state declaration alongside the other `useState` calls:

```ts
const [animatingSlots, setAnimatingSlots] = useState<Map<string, 'attack' | 'hit' | 'faint'>>(new Map());
```

- [ ] **Step 2: Add animation handling to the drain loop**

Inside the drain-loop `useEffect`, after the `if (entry.hpDelta)` block and before the `const nextQueue = eventQueue.slice(1)` line, add:

```ts
if (entry.animation) {
  const { slotId, kind } = entry.animation;
  setAnimatingSlots((prev) => { const next = new Map(prev); next.set(slotId, kind); return next; });
  const clearDelay = kind === 'attack' ? 350 : kind === 'hit' ? 300 : 600;
  setTimeout(() => {
    setAnimatingSlots((prev) => { const next = new Map(prev); next.delete(slotId); return next; });
  }, clearDelay);
}
```

- [ ] **Step 3: Clear animatingSlots on battle:end**

Inside the `socket.on('battle:end', ...)` handler, add `setAnimatingSlots(new Map());` alongside the other clears:

```ts
socket.on('battle:end', ({ winningTeamId }) => {
  setTurnLog((prev) => [...prev, { type: 'normal', text: `Battle over! Winner: ${winningTeamId}` }]);
  setActionRequest(null);
  setEventQueue([]);
  setPendingState(null);
  setPendingActionRequest(null);
  setPendingSwitchRequest(null);
  setDisplayHp(new Map());
  setAnimatingSlots(new Map());
});
```

- [ ] **Step 4: Expose animatingSlots through the context Provider**

Update the return value's `BattleContext.Provider` value prop:

```tsx
<BattleContext.Provider value={{ state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction }}>
  {children}
</BattleContext.Provider>
```

- [ ] **Step 5: Run tests and confirm all pass**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass, including the 7 new animatingSlots tests.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.tsx
git commit -m "feat: add animatingSlots state to BattleContext driven by playback queue"
```

---

## Task 5: Create battle-animations.css

**Files:**
- Create: `packages/client/src/battle/battle-animations.css`

- [ ] **Step 1: Create the CSS file**

Create `packages/client/src/battle/battle-animations.css` with this content:

```css
@keyframes lunge-right {
  0%, 100% { transform: translateX(0); }
  50%       { transform: translateX(20px); }
}

@keyframes lunge-left {
  0%, 100% { transform: translateX(0); }
  50%       { transform: translateX(-20px); }
}

@keyframes hit-flash {
  0%, 100% { filter: none; }
  25%, 75% { filter: brightness(10); }
}

@keyframes faint-drop {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(60px); opacity: 0; }
}

.anim-attack-right { animation: lunge-right 350ms ease-in-out; }
.anim-attack-left  { animation: lunge-left  350ms ease-in-out; }
.anim-hit          { animation: hit-flash   300ms linear; }
.anim-faint        { animation: faint-drop  400ms ease-in forwards; }
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/battle/battle-animations.css
git commit -m "feat: add battle animation keyframes and classes"
```

---

## Task 6: Update BattleScene — tests first

**Files:**
- Modify: `packages/client/src/battle/__tests__/BattleScene.test.tsx`

- [ ] **Step 1: Add animation class tests**

Open `packages/client/src/battle/__tests__/BattleScene.test.tsx`. Add this describe block at the end of the file:

```ts
describe('animation classes', () => {
  it('applies anim-attack-right to own slot when animating attack', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['a1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-right')).not.toBeNull();
  });

  it('applies anim-attack-left to foe slot when animating attack', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-left')).not.toBeNull();
  });

  it('applies anim-hit when a slot is animating hit', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'hit']])} />,
    );
    expect(container.querySelector('.anim-hit')).not.toBeNull();
  });

  it('applies anim-faint when a slot is animating faint', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'faint']])} />,
    );
    expect(container.querySelector('.anim-faint')).not.toBeNull();
  });

  it('applies no animation class when animatingSlots prop is absent', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    expect(container.querySelector('.anim-attack-right')).toBeNull();
    expect(container.querySelector('.anim-attack-left')).toBeNull();
    expect(container.querySelector('.anim-hit')).toBeNull();
    expect(container.querySelector('.anim-faint')).toBeNull();
  });

  it('applies no animation class when slot is not in animatingSlots', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['c1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-right')).toBeNull();
    expect(container.querySelector('.anim-attack-left')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm the 6 new tests fail**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: 6 new BattleScene animation tests fail; all prior tests pass.

---

## Task 7: Implement BattleScene changes

**Files:**
- Modify: `packages/client/src/battle/BattleScene.tsx`

- [ ] **Step 1: Import the CSS file and update the Props interface**

Add the CSS import at the top of the file (after the existing imports):

```ts
import './battle-animations.css';
```

Replace the existing `Props` interface:

```ts
interface Props {
  state: BattleState;
  mySlotId: string;
  animatingSlots?: Map<string, 'attack' | 'hit' | 'faint'>;
}
```

- [ ] **Step 2: Update BattleScene to pass animatingSlots to renderSprite**

Replace the function signature and the three `renderSprite` calls:

```tsx
export function BattleScene({ state, mySlotId, animatingSlots }: Props) {
  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const resolvedMyTeamIdx = myTeamIdx === -1 ? 0 : myTeamIdx;
  const foeTeamIdx = resolvedMyTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[resolvedMyTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];

  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const allySlots = myTeam?.slots.filter((s) => s.slotId !== mySlotId && !s.isSpectator) ?? [];
  const foeSlots = foeTeam?.slots.filter((s) => !s.isSpectator) ?? [];

  return (
    <div style={{
      position: 'relative',
      width: 800,
      height: 240,
      background: 'linear-gradient(to bottom, #87ceeb 55%, #5a8a3a 55%)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {mySlot && renderSprite(mySlot, 'own', 0, animatingSlots)}
      {allySlots.map((slot, i) => renderSprite(slot, 'ally', i, animatingSlots))}
      {foeSlots.map((slot, i) => renderSprite(slot, 'foe', i, animatingSlots))}
    </div>
  );
}
```

- [ ] **Step 3: Update renderSprite to accept animatingSlots and apply className**

Replace the `renderSprite` function signature and add class selection. The full updated function:

```tsx
function renderSprite(
  slot: SlotState,
  role: 'own' | 'ally' | 'foe',
  index: number,
  animatingSlots?: Map<string, 'attack' | 'hit' | 'faint'>,
) {
  const mon = slot.party[slot.activePokemonIndex];
  if (!mon || mon.fainted) return null;

  const animKind = animatingSlots?.get(slot.slotId);
  let animClassName: string | undefined;
  if (animKind === 'attack') {
    animClassName = role === 'foe' ? 'anim-attack-left' : 'anim-attack-right';
  } else if (animKind === 'hit') {
    animClassName = 'anim-hit';
  } else if (animKind === 'faint') {
    animClassName = 'anim-faint';
  }

  const pos: React.CSSProperties = role === 'own'
    ? { bottom: 18, left: 60, width: 72, height: 72 }
    : role === 'ally'
    ? { bottom: 24, left: 155 + index * 60, width: 54, height: 54, opacity: 0.85 }
    : index === 0
    ? { top: 18, right: 60, width: 64, height: 64 }
    : { top: 30, right: 145 + index * 60, width: 50, height: 50, opacity: 0.85 };

  const url = role === 'foe'
    ? `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(mon.speciesName)}.gif`
    : `https://play.pokemonshowdown.com/sprites/ani-back/${toShowdownId(mon.speciesName)}.gif`;

  return (
    <div
      key={slot.slotId}
      className={animClassName}
      style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', ...pos }}
    >
      {mon.speciesName ? (
        <img
          src={url}
          alt={mon.speciesName}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          background: role === 'foe' ? '#e74c3c' : '#2980b9',
          borderRadius: 3,
        }} />
      )}
      <span style={{
        fontSize: 8,
        color: role === 'foe' ? '#000' : '#fff',
        textShadow: role === 'foe' ? '0 0 3px #fff' : '0 0 3px #000',
        whiteSpace: 'nowrap',
        marginTop: 2,
      }}>
        {slot.displayName}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass, including the 6 new BattleScene animation class tests.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/BattleScene.tsx packages/client/src/battle/__tests__/BattleScene.test.tsx
git commit -m "feat: apply animation CSS classes to sprites via animatingSlots prop"
```

---

## Task 8: Wire BattlePage

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Destructure animatingSlots and pass to BattleScene**

In `BattlePage.tsx`, locate the `BattleView` function. Update the destructuring of `useBattle()` to include `animatingSlots`:

```ts
const { state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction } = useBattle();
```

Update the `<BattleScene>` JSX to pass the new prop:

```tsx
<BattleScene state={state} mySlotId={mySlotId} animatingSlots={animatingSlots} />
```

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx
git commit -m "feat: wire animatingSlots from BattleContext to BattleScene via BattlePage"
```

---

## Self-Review

**Spec coverage:**
- `PlaybackEntry.animation` field ✓ (Task 2)
- `eventsToPlaybackEntries` populates animation for move-used/damage-dealt/faint ✓ (Task 2)
- `animatingSlots` state in BattleContext ✓ (Task 4)
- Drain-loop clears animation via setTimeout ✓ (Task 4) with correct durations (350/300/600ms) ✓
- `battle:end` clears animatingSlots ✓ (Task 4)
- CSS keyframes + classes ✓ (Task 5)
- `BattleScene` accepts prop + applies class ✓ (Task 7)
- lunge-right for own/ally, lunge-left for foe ✓ (Task 7)
- `BattlePage` wires prop ✓ (Task 8)
- Tests for all three layers ✓ (Tasks 1, 3, 6)

**Placeholder scan:** No TBDs. All code steps are complete.

**Type consistency:** `'attack' | 'hit' | 'faint'` used consistently across PlaybackEntry, BattleContextValue, the useState, and renderSprite. CSS class names (`anim-attack-right`, `anim-attack-left`, `anim-hit`, `anim-faint`) match exactly between the CSS file (Task 5) and the BattleScene implementation (Task 7).
