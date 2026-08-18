# Plan 06: Battle UI (F7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the player-facing battle experience in the browser — Fire Red / Leaf Green visual style, Phaser 3 battle scene, focused view (your Pokémon large vs main opponent), targeting view (full field for target selection), move selection panel, HP bars, turn log, and spectator mode.

**Architecture:** `BattlePage` is a React component that renders a Phaser 3 canvas. Phaser manages two scenes: `FocusedScene` (default) and `TargetingScene`. React overlays handle the move selection panel and turn log (HTML/CSS, not Phaser). Battle state is kept in a React context (`BattleContext`) updated on every `state:sync` and `turn:resolve` Socket.io event. Phaser reads from `BattleContext` via a shared ref.

**Tech Stack:** Phaser 3.60+, React 18, `socket.io-client`, `@poke-fighter/shared` types.

**Prerequisite:** Plans 01–05 complete. Sprites: use placeholder colored rectangles for R1 (swap in real Gen 3/9 sprites later — the architecture supports it).

---

## File Structure

```
packages/client/src/
├── battle/
│   ├── BattleContext.tsx            # React context for live BattleState
│   ├── BattleCanvas.tsx             # mounts Phaser game inside React
│   ├── scenes/
│   │   ├── FocusedScene.ts          # default view — large sprites, de-emphasized allies
│   │   └── TargetingScene.ts        # zoomed-out full field, selectable targets
│   ├── overlays/
│   │   ├── MovePanel.tsx            # 4-move selection panel
│   │   ├── TurnLog.tsx              # scrolling battle text log
│   │   ├── HpBar.tsx                # reusable HP bar component
│   │   └── StatusBadge.tsx          # burn/par/slp/etc badge
│   └── __tests__/
│       ├── MovePanel.test.tsx
│       └── HpBar.test.tsx
├── pages/
│   └── BattlePage.tsx               # assembles all battle components
```

---

## Task 1: Battle Context

**Files:**
- Create: `packages/client/src/battle/BattleContext.tsx`

- [ ] **Step 1: Create packages/client/src/battle/BattleContext.tsx**

```tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import type { BattleState, ActionRequestPayload, TurnResolvePayload } from '@poke-fighter/shared';

interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string | null;
  actionRequest: ActionRequestPayload | null;
  turnLog: string[];
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
}

const BattleContext = createContext<BattleContextValue | null>(null);

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error('useBattle must be used inside BattleProvider');
  return ctx;
}

interface Props {
  mySlotId: string;
  children: React.ReactNode;
}

export function BattleProvider({ mySlotId, children }: Props) {
  const [state, setState] = useState<BattleState | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<string[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      setTurnLog([`Battle started! Turn ${s.turnNumber}`]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
    });

    socket.on('turn:resolve', ({ turnNumber, events, state: s }: TurnResolvePayload) => {
      setState(s);
      setTurnLog((prev) => [
        ...prev,
        ...events.map((e) => eventToText(e)),
      ].slice(-50)); // keep last 50 messages
    });

    socket.on('action:request', (payload: ActionRequestPayload) => {
      if (payload.slotId === mySlotId) setActionRequest(payload);
    });

    socket.on('battle:end', ({ winningTeamId }) => {
      setTurnLog((prev) => [...prev, `Battle over! Winner: ${winningTeamId}`]);
      setActionRequest(null);
    });

    return () => {
      socket.off('battle:start');
      socket.off('state:sync');
      socket.off('turn:resolve');
      socket.off('action:request');
      socket.off('battle:end');
    };
  }, [mySlotId]);

  function submitAction(payload: import('@poke-fighter/shared').ActionSubmitPayload) {
    getSocket().emit('action:submit', payload);
    setActionRequest(null);
  }

  return (
    <BattleContext.Provider value={{ state, mySlotId, actionRequest, turnLog, submitAction }}>
      {children}
    </BattleContext.Provider>
  );
}

function eventToText(event: import('@poke-fighter/shared').TurnResolveEvent): string {
  switch (event.type) {
    case 'move-used': return `${event.data['attackerSlotId']} used ${event.data['moveName']}!`;
    case 'damage-dealt': return `Dealt ${event.data['damage']} damage to ${event.data['targetSlotId']}.`;
    case 'faint': return `${event.data['slotId']}'s Pokémon fainted!`;
    case 'heal': return `${event.data['slotId']} restored HP.`;
    case 'status-applied': return `${event.data['target']} was ${event.data['status']}!`;
    case 'terastallize': return `${event.data['slotId']} Terastallized into ${event.data['teraType']} type!`;
    default: return '';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx
git commit -m "feat(client): BattleContext — live state from Socket.io events"
```

---

## Task 2: HP Bar & Status Badge Components

**Files:**
- Create: `packages/client/src/battle/overlays/HpBar.tsx`
- Create: `packages/client/src/battle/overlays/StatusBadge.tsx`
- Create: `packages/client/src/battle/__tests__/HpBar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/client/src/battle/__tests__/HpBar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HpBar } from '../overlays/HpBar.js';

describe('HpBar', () => {
  it('renders full bar at 100%', () => {
    render(<HpBar current={100} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('renders half bar at 50%', () => {
    render(<HpBar current={50} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('uses green color above 50%', () => {
    render(<HpBar current={80} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('2ecc71'); // green
  });

  it('uses yellow color between 20% and 50%', () => {
    render(<HpBar current={30} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('f0c040'); // yellow
  });

  it('uses red color below 20%', () => {
    render(<HpBar current={10} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('e74c3c'); // red
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 3: Create packages/client/src/battle/overlays/HpBar.tsx**

```tsx
interface Props {
  current: number;
  max: number;
  showNumbers?: boolean;
}

export function HpBar({ current, max, showNumbers = false }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct > 0.5 ? '#2ecc71' : pct > 0.2 ? '#f0c040' : '#e74c3c';

  return (
    <div>
      <div style={{ background: '#333', borderRadius: 3, height: 6, overflow: 'hidden', width: '100%' }}>
        <div
          data-testid="hp-fill"
          style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      {showNumbers && (
        <div style={{ color: '#aaa', fontSize: 10, marginTop: 2 }}>{current}/{max}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create packages/client/src/battle/overlays/StatusBadge.tsx**

```tsx
import type { StatusCondition } from '@poke-fighter/shared';

const STATUS_LABELS: Record<StatusCondition, string> = {
  brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ', psn: 'PSN', tox: 'TOX', fnt: 'FNT',
};

const STATUS_COLORS: Record<StatusCondition, string> = {
  brn: '#e67e22', par: '#f0c040', slp: '#95a5a6', frz: '#a8d8ea', psn: '#9b59b6', tox: '#6c3483', fnt: '#555',
};

interface Props { status: StatusCondition | undefined }

export function StatusBadge({ status }: Props) {
  if (!status) return null;
  return (
    <span style={{
      background: STATUS_COLORS[status] ?? '#555',
      color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 2, letterSpacing: 1, fontWeight: 'bold',
    }}>
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 5: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/battle/overlays/HpBar.tsx packages/client/src/battle/overlays/StatusBadge.tsx packages/client/src/battle/__tests__/HpBar.test.tsx
git commit -m "feat(client): HpBar and StatusBadge overlay components"
```

---

## Task 3: Move Selection Panel

**Files:**
- Create: `packages/client/src/battle/overlays/MovePanel.tsx`
- Create: `packages/client/src/battle/__tests__/MovePanel.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/client/src/battle/__tests__/MovePanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MovePanel } from '../overlays/MovePanel.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';

const mockRequest: ActionRequestPayload = {
  slotId: 'slot-a1',
  validMoves: [
    { index: 0, moveId: 'flamethrower', pp: 15, disabled: false },
    { index: 1, moveId: 'airslash', pp: 15, disabled: false },
    { index: 2, moveId: 'roost', pp: 10, disabled: false },
    { index: 3, moveId: 'willowisp', pp: 15, disabled: false },
  ],
  legalTargets: ['slot-b1'],
  canSwitch: false,
  switchTargets: [],
  canTerastallize: true,
  timerSeconds: 60,
};

describe('MovePanel', () => {
  it('renders all 4 moves', () => {
    render(<MovePanel request={mockRequest} onSelectMove={vi.fn()} />);
    expect(screen.getByText('flamethrower')).toBeTruthy();
    expect(screen.getByText('airslash')).toBeTruthy();
    expect(screen.getByText('roost')).toBeTruthy();
    expect(screen.getByText('willowisp')).toBeTruthy();
  });

  it('calls onSelectMove with index when a move is clicked', () => {
    const onSelectMove = vi.fn();
    render(<MovePanel request={mockRequest} onSelectMove={onSelectMove} />);
    fireEvent.click(screen.getByText('flamethrower'));
    expect(onSelectMove).toHaveBeenCalledWith(0);
  });

  it('disables moves with 0 PP', () => {
    const req = { ...mockRequest, validMoves: [{ ...mockRequest.validMoves[0]!, pp: 0 }, ...mockRequest.validMoves.slice(1)] };
    render(<MovePanel request={req} onSelectMove={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 3: Create packages/client/src/battle/overlays/MovePanel.tsx**

```tsx
import type { ActionRequestPayload } from '@poke-fighter/shared';

const TYPE_COLORS: Record<string, string> = {
  Normal:'#aaa', Fire:'#e74c3c', Water:'#3498db', Electric:'#f0c040',
  Grass:'#27ae60', Ice:'#a8d8ea', Fighting:'#e67e22', Poison:'#9b59b6',
  Ground:'#a0522d', Flying:'#87ceeb', Psychic:'#e91e63', Bug:'#8bc34a',
  Rock:'#795548', Ghost:'#7b1fa2', Dragon:'#1a237e', Dark:'#37474f',
  Steel:'#90a4ae', Fairy:'#f48fb1',
};

interface Props {
  request: ActionRequestPayload;
  onSelectMove: (moveIndex: number) => void;
}

export function MovePanel({ request, onSelectMove }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.label}>CHOOSE A MOVE</div>
      <div style={styles.grid}>
        {request.validMoves.map((mv) => {
          const disabled = mv.disabled || mv.pp === 0;
          return (
            <button
              key={mv.index}
              style={{ ...styles.moveBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
              disabled={disabled}
              onClick={() => onSelectMove(mv.index)}
            >
              <span style={styles.moveName}>{mv.moveId}</span>
              <span style={styles.movePp}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>
      {request.canTerastallize && (
        <div style={styles.tera}>
          <label style={{ color: '#aaa', fontSize: 11 }}>
            <input type="checkbox" id="tera" style={{ marginRight: 6 }} />
            Terastallize this turn
          </label>
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 16 },
  label: { color: '#aaa', fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #3498db', color: '#fff', padding: '10px 12px', borderRadius: 4, fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  moveName: { fontSize: 13, textTransform: 'capitalize' as const },
  movePp: { fontSize: 11, color: '#aaa' },
  tera: { marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 },
};
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/client test
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/MovePanel.tsx packages/client/src/battle/__tests__/MovePanel.test.tsx
git commit -m "feat(client): MovePanel overlay — 4-move selection with PP display"
```

---

## Task 4: Turn Log

**Files:**
- Create: `packages/client/src/battle/overlays/TurnLog.tsx`

- [ ] **Step 1: Create packages/client/src/battle/overlays/TurnLog.tsx**

```tsx
import { useEffect, useRef } from 'react';

interface Props { messages: string[] }

export function TurnLog({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>BATTLE LOG</div>
      <div style={styles.log}>
        {messages.filter(Boolean).map((msg, i) => (
          <div key={i} style={styles.message}>{msg}</div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { color: '#555', fontSize: 10, letterSpacing: 2 },
  log: { maxHeight: 150, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 3 },
  message: { color: '#ccc', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4 },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/battle/overlays/TurnLog.tsx
git commit -m "feat(client): TurnLog overlay — auto-scrolling battle message box"
```

---

## Task 5: Phaser 3 Setup + Battle Canvas

**Files:**
- Create: `packages/client/src/battle/BattleCanvas.tsx`
- Create: `packages/client/src/battle/scenes/FocusedScene.ts`
- Create: `packages/client/src/battle/scenes/TargetingScene.ts`

- [ ] **Step 1: Install Phaser**

```bash
pnpm --filter @poke-fighter/client add phaser
```

- [ ] **Step 2: Create packages/client/src/battle/scenes/FocusedScene.ts**

```typescript
import Phaser from 'phaser';
import type { BattleState, SlotState, PartyMember } from '@poke-fighter/shared';

export interface FocusedSceneData {
  mySlotId: string;
  onRequestTargeting: (moveIndex: number) => void;
}

export class FocusedScene extends Phaser.Scene {
  private mySlotId!: string;
  private state: BattleState | null = null;
  private sprites = new Map<string, Phaser.GameObjects.Rectangle>(); // placeholder rectangles

  constructor() {
    super({ key: 'FocusedScene' });
  }

  init(data: FocusedSceneData) {
    this.mySlotId = data.mySlotId;
  }

  create() {
    // GBA-style background: top half sky blue, bottom half green
    this.add.rectangle(0, 0, 800, 240, 0x5a8a3a).setOrigin(0);
    this.add.rectangle(0, 0, 800, 140, 0x87ceeb).setOrigin(0);
  }

  updateState(state: BattleState) {
    this.state = state;
    this.renderPokemon(state);
  }

  private renderPokemon(state: BattleState) {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();

    const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === this.mySlotId));
    const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
    const myTeam = state.teams[myTeamIdx];
    const foeTeam = state.teams[foeTeamIdx];

    // MY Pokemon (large, bottom left)
    const mySlot = myTeam?.slots.find((s) => s.slotId === this.mySlotId);
    if (mySlot) this.renderMyPokemon(mySlot);

    // ALLY Pokemon (small, slightly right of mine)
    myTeam?.slots.filter((s) => s.slotId !== this.mySlotId && !s.isSpectator).forEach((slot, i) => {
      this.renderAllyPokemon(slot, i);
    });

    // FOE Pokemon — primary (large, top right), others (small, top left)
    const foeSlots = foeTeam?.slots.filter((s) => !s.isSpectator) ?? [];
    foeSlots.forEach((slot, i) => {
      if (i === 0) this.renderPrimaryFoe(slot);
      else this.renderSecondaryFoe(slot, i);
    });
  }

  private renderMyPokemon(slot: SlotState) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const rect = this.add.rectangle(120, 190, 80, 80, 0x2980b9).setDepth(10);
    const label = this.add.text(120, 235, slot.displayName, { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5).setDepth(11);
    this.sprites.set(`my-${slot.slotId}`, rect);
  }

  private renderAllyPokemon(slot: SlotState, index: number) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const x = 220 + index * 50;
    const rect = this.add.rectangle(x, 200, 40, 40, 0x2471a3, 0.6).setDepth(5);
    this.sprites.set(`ally-${slot.slotId}`, rect);
  }

  private renderPrimaryFoe(slot: SlotState) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const rect = this.add.rectangle(660, 80, 70, 70, 0xe74c3c).setDepth(10);
    this.sprites.set(`foe-primary`, rect);
  }

  private renderSecondaryFoe(slot: SlotState, index: number) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const x = 80 + (index - 1) * 50;
    const rect = this.add.rectangle(x, 60, 35, 35, 0xc0392b, 0.6).setDepth(5);
    this.sprites.set(`foe-${slot.slotId}`, rect);
  }
}
```

- [ ] **Step 3: Create packages/client/src/battle/scenes/TargetingScene.ts**

```typescript
import Phaser from 'phaser';
import type { BattleState } from '@poke-fighter/shared';

export interface TargetingSceneData {
  state: BattleState;
  mySlotId: string;
  moveIndex: number;
  legalTargets: string[];
  onTargetSelected: (targetSlotId: string) => void;
  onCancel: () => void;
}

export class TargetingScene extends Phaser.Scene {
  private data!: TargetingSceneData;

  constructor() {
    super({ key: 'TargetingScene' });
  }

  init(data: TargetingSceneData) {
    this.data = data;
  }

  create() {
    const { state, mySlotId, legalTargets, onTargetSelected, onCancel } = this.data;

    this.add.rectangle(400, 240, 800, 480, 0x0d0d1a).setOrigin(0.5);

    const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
    const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;

    // Render foe slots (top, selectable)
    const foeSlots = state.teams[foeTeamIdx]?.slots ?? [];
    foeSlots.forEach((slot, i) => {
      const mon = slot.party[slot.activePokemonIndex];
      if (!mon || mon.fainted) return;

      const x = 150 + i * 180;
      const y = 130;
      const isLegal = legalTargets.includes(slot.slotId);

      const card = this.add.rectangle(x, y, 140, 100, isLegal ? 0x3a0a0a : 0x222, 1)
        .setStrokeStyle(2, isLegal ? 0xe74c3c : 0x444)
        .setInteractive({ useHandCursor: isLegal });

      const nameText = this.add.text(x, y - 20, slot.displayName, { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
      const hpText = this.add.text(x, y + 10, `HP ${mon.currentHp}/${mon.maxHp}`, { fontSize: '10px', color: '#2ecc71' }).setOrigin(0.5);

      if (isLegal) {
        card.on('pointerup', () => onTargetSelected(slot.slotId));
        card.on('pointerover', () => card.setFillStyle(0x5a1a1a));
        card.on('pointerout', () => card.setFillStyle(0x3a0a0a));
      }
    });

    // Render ally slots (bottom, non-selectable)
    const allySlots = state.teams[myTeamIdx]?.slots ?? [];
    allySlots.forEach((slot, i) => {
      const mon = slot.party[slot.activePokemonIndex];
      if (!mon || mon.fainted) return;

      const x = 150 + i * 180;
      const y = 320;
      const isMe = slot.slotId === mySlotId;

      this.add.rectangle(x, y, 140, 100, 0x0a1a2a, 1).setStrokeStyle(2, isMe ? 0x27ae60 : 0x2980b9);
      this.add.text(x, y - 20, slot.displayName, { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
      this.add.text(x, y + 10, `HP ${mon.currentHp}/${mon.maxHp}`, { fontSize: '10px', color: '#2ecc71' }).setOrigin(0.5);
      this.add.text(x, y + 25, isMe ? 'YOU' : 'ALLY', { fontSize: '9px', color: '#555' }).setOrigin(0.5);
    });

    // Cancel button
    const cancelBtn = this.add.text(700, 440, '[ESC] Cancel', { fontSize: '12px', color: '#e74c3c' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerup', onCancel);
    this.input.keyboard?.on('keydown-ESC', onCancel);
  }
}
```

- [ ] **Step 4: Create packages/client/src/battle/BattleCanvas.tsx**

```tsx
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { FocusedScene } from './scenes/FocusedScene.js';
import { TargetingScene } from './scenes/TargetingScene.js';
import type { BattleState } from '@poke-fighter/shared';

interface Props {
  state: BattleState | null;
  mySlotId: string;
  targetingMoveIndex: number | null;
  legalTargets: string[];
  onTargetSelected: (targetSlotId: string) => void;
  onCancelTargeting: () => void;
}

export function BattleCanvas({ state, mySlotId, targetingMoveIndex, legalTargets, onTargetSelected, onCancelTargeting }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const focusedSceneRef = useRef<FocusedScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 400,
      backgroundColor: '#1a1a2e',
      parent: containerRef.current,
      scene: [FocusedScene, TargetingScene],
    });

    gameRef.current = game;

    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene('FocusedScene') as FocusedScene;
      focusedSceneRef.current = scene;
      scene.scene.start('FocusedScene', { mySlotId });
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mySlotId]);

  useEffect(() => {
    if (state && focusedSceneRef.current) {
      focusedSceneRef.current.updateState(state);
    }
  }, [state]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || !state) return;

    if (targetingMoveIndex !== null) {
      game.scene.stop('FocusedScene');
      game.scene.start('TargetingScene', {
        state, mySlotId, moveIndex: targetingMoveIndex, legalTargets,
        onTargetSelected: (id: string) => {
          game.scene.stop('TargetingScene');
          game.scene.start('FocusedScene', { mySlotId });
          onTargetSelected(id);
        },
        onCancel: () => {
          game.scene.stop('TargetingScene');
          game.scene.start('FocusedScene', { mySlotId });
          onCancelTargeting();
        },
      });
    }
  }, [targetingMoveIndex, state]);

  return <div ref={containerRef} style={{ width: 800, height: 400 }} />;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/
git commit -m "feat(client): Phaser 3 battle canvas with FocusedScene and TargetingScene"
```

---

## Task 6: Battle Page Assembly

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Update BattlePage to assemble all battle components**

```tsx
import { useState } from 'react';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleCanvas } from '../battle/BattleCanvas.js';
import { MovePanel } from '../battle/overlays/MovePanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { HpBar } from '../battle/overlays/HpBar.js';
import { StatusBadge } from '../battle/overlays/StatusBadge.js';

// Temporary — in real app, slotId comes from lobby state
const MY_SLOT_ID = sessionStorage.getItem('mySlotId') ?? 'slot-a1';

export function BattlePage() {
  return (
    <BattleProvider mySlotId={MY_SLOT_ID}>
      <BattleView />
    </BattleProvider>
  );
}

function BattleView() {
  const { state, mySlotId, actionRequest, turnLog, submitAction } = useBattle();
  const [targetingMoveIndex, setTargetingMoveIndex] = useState<number | null>(null);

  function handleMoveSelect(moveIndex: number) {
    if (!actionRequest) return;
    const move = actionRequest.validMoves[moveIndex];
    if (!move) return;

    // If move needs a target and there are multiple options, enter targeting view
    if (actionRequest.legalTargets.length > 1) {
      setTargetingMoveIndex(moveIndex);
    } else {
      // Auto-target the only option
      submitAction({ slotId: mySlotId, action: { type: 'move', moveIndex: moveIndex as 0|1|2|3, targetSlotId: actionRequest.legalTargets[0] } });
    }
  }

  function handleTargetSelected(targetSlotId: string) {
    if (targetingMoveIndex === null || !actionRequest) return;
    const teraCheckbox = document.getElementById('tera') as HTMLInputElement | null;
    submitAction({
      slotId: mySlotId,
      action: { type: 'move', moveIndex: targetingMoveIndex as 0|1|2|3, targetSlotId, terastallize: teraCheckbox?.checked },
    });
    setTargetingMoveIndex(null);
  }

  if (!state) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#aaa' }}>Waiting for battle to start...</div>;
  }

  const myTeam = state.teams.find((t) => t.slots.some((s) => s.slotId === mySlotId));
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      <BattleCanvas
        state={state}
        mySlotId={mySlotId}
        targetingMoveIndex={targetingMoveIndex}
        legalTargets={actionRequest?.legalTargets ?? []}
        onTargetSelected={handleTargetSelected}
        onCancelTargeting={() => setTargetingMoveIndex(null)}
      />

      {myActiveMon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111', border: '1px solid #333', borderRadius: 6, padding: '8px 16px', width: 800 }}>
          <span style={{ color: '#fff', fontSize: 14 }}>Species #{myActiveMon.speciesId} L{myActiveMon.level}</span>
          <StatusBadge status={myActiveMon.status} />
          <div style={{ flex: 1 }}>
            <HpBar current={myActiveMon.currentHp} max={myActiveMon.maxHp} showNumbers />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {actionRequest && !mySlot?.isSpectator ? (
            <MovePanel request={actionRequest} onSelectMove={handleMoveSelect} />
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>
              {mySlot?.isSpectator ? 'Watching...' : 'Waiting for other players...'}
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
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
pnpm --filter @poke-fighter/client typecheck
```

Expected: no errors

- [ ] **Step 3: Start both server and client, navigate to /battle, verify Phaser canvas renders**

```bash
# Terminal 1
pnpm --filter @poke-fighter/server dev

# Terminal 2
pnpm --filter @poke-fighter/client dev
```

Open `http://localhost:5173/battle` — should see the dark background with Phaser canvas, HP bar area, and turn log.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): assemble BattlePage — canvas, move panel, HP bar, turn log"
```

---

---

## Task 7: Voluntary Switch & Forced Switch UI

**Files:**
- Modify: `packages/client/src/battle/overlays/MovePanel.tsx`
- Create: `packages/client/src/battle/overlays/SwitchPanel.tsx`
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Add Switch button to MovePanel**

Add a `canSwitch` prop and render a "SWITCH" option alongside moves:

```tsx
// In MovePanel, below the move grid:
{request.canSwitch && (
  <button
    style={{ ...styles.moveBtn, background: '#1a3a1a', borderColor: '#27ae60', marginTop: 8, width: '100%', justifyContent: 'center' }}
    onClick={() => onSwitchRequested?.()}
  >
    SWITCH POKÉMON
  </button>
)}
```

Add `onSwitchRequested?: () => void` to `Props`.

- [ ] **Step 2: Create packages/client/src/battle/overlays/SwitchPanel.tsx**

```tsx
import type { PartyMember } from '@poke-fighter/shared';

interface Props {
  party: PartyMember[];
  onSwitch: (instanceId: string) => void;
  onCancel?: () => void;
  label?: string;
}

export function SwitchPanel({ party, onSwitch, onCancel, label = 'CHOOSE POKÉMON' }: Props) {
  return (
    <div style={{ background: '#0d0d1a', border: '2px solid #27ae60', borderRadius: 8, padding: 16 }}>
      <div style={{ color: '#27ae60', fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {party.map((mon) => (
          <button
            key={mon.instanceId}
            disabled={mon.fainted}
            onClick={() => onSwitch(mon.instanceId)}
            style={{
              background: mon.fainted ? '#111' : '#1a3a1a',
              border: '1px solid #27ae60',
              color: mon.fainted ? '#555' : '#fff',
              padding: '8px 12px',
              borderRadius: 4,
              cursor: mon.fainted ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              justifyContent: 'space-between',
              opacity: mon.fainted ? 0.5 : 1,
            }}
          >
            <span>Species #{mon.speciesId} L{mon.level}</span>
            <span style={{ color: mon.fainted ? '#e74c3c' : '#2ecc71', fontSize: 11 }}>
              {mon.fainted ? 'FAINTED' : `HP ${mon.currentHp}/${mon.maxHp}`}
            </span>
          </button>
        ))}
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          style={{ marginTop: 10, background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          [Cancel]
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire SwitchPanel into BattlePage**

In `BattleView`, use `switchRequest` from `useBattle()`:

```tsx
const { ..., switchRequest } = useBattle();
const [showSwitchPanel, setShowSwitchPanel] = useState(false);

// Show SwitchPanel when:
// a) forced switch after faint (switchRequest !== null)
// b) player chose SWITCH voluntarily (showSwitchPanel === true)
const mySlotInState = state?.teams.flatMap((t) => t.slots).find((s) => s.slotId === mySlotId);
const switchableParty = mySlotInState?.party.filter((p, i) => i !== mySlotInState.activePokemonIndex && !p.fainted) ?? [];

function handleSwitch(instanceId: string) {
  submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
  setShowSwitchPanel(false);
}
```

Replace the move panel section:

```tsx
{switchRequest || showSwitchPanel ? (
  <SwitchPanel
    party={switchableParty}
    onSwitch={handleSwitch}
    onCancel={switchRequest ? undefined : () => setShowSwitchPanel(false)}
    label={switchRequest ? 'YOUR POKÉMON FAINTED — CHOOSE NEXT' : 'CHOOSE POKÉMON'}
  />
) : actionRequest && !mySlot?.isSpectator ? (
  <MovePanel
    request={actionRequest}
    onSelectMove={handleMoveSelect}
    onSwitchRequested={() => setShowSwitchPanel(true)}
  />
) : (
  <div style={{ ... }}>Waiting...</div>
)}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @poke-fighter/client test
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/overlays/SwitchPanel.tsx packages/client/src/battle/overlays/MovePanel.tsx packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): voluntary and forced switch panel in battle UI"
```

---

**Plan 06 complete.** Players see a Fire Red-style battle screen with focused Phaser view, targeting scene, move panel with switch option, forced switch prompt after faints, HP bars, status badges, and scrolling turn log — all wired to live Socket.io state.
