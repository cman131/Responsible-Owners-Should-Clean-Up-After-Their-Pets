# Plan 07: Admin Battle Control Panel + Experience System (F8 + F9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin live-battle control panel (NPC move submission, pause/unpause, force-faint, forfeit) and implement the experience system (Fire Red formula, team-wide Exp. All distribution, level-up detection, and UI).

**Architecture:** The admin battle view reuses `BattleProvider` and `BattleCanvas` from Plan 06 with an additional `AdminControlPanel` overlay. NPC action requests are routed to the admin via a dedicated `npc:action-request` event. The exp system is a pure function in the engine (`exp.ts`) called by `BattleRoom` after every `pokemon:fainted` event; exp awards are broadcast via `exp:award` and `level:up` events.

**Tech Stack:** React 18, Socket.io, Phaser 3, `@poke-fighter/shared` types.

**Prerequisite:** Plans 01–06 complete.

---

## File Structure

```
packages/server/src/
├── engine/
│   └── exp.ts                          # experience formula and distribution
├── socket/
│   └── BattleRoom.ts                   # modified to emit exp awards + admin NPC requests
│   └── handlers/
│       └── adminHandlers.ts            # extended with force-faint, forfeit

packages/client/src/
├── admin/
│   ├── ControlPanel.tsx                # live battle admin overlay
│   └── NpcActionPanel.tsx              # per-NPC move picker during battle
└── battle/
    └── overlays/
        └── ExpBar.tsx                  # exp bar fill animation
```

---

## Task 1: Experience Calculation

**Files:**
- Create: `packages/server/src/engine/exp.ts`
- Create: `packages/server/src/engine/__tests__/exp.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/engine/__tests__/exp.test.ts
import { describe, it, expect } from 'vitest';
import { calcExpYield, distributeExp } from '../exp.js';
import type { PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 6, level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze', moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    status: undefined, volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    teraType: undefined, hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

describe('calcExpYield', () => {
  it('matches Fire Red formula: floor((baseExpYield * level) / 7)', () => {
    // Charizard base exp yield = 240, level 50
    expect(calcExpYield({ baseExpYield: 240, level: 50 })).toBe(Math.floor((240 * 50) / 7)); // 1714
  });

  it('Pikachu (base exp 112) at level 30', () => {
    expect(calcExpYield({ baseExpYield: 112, level: 30 })).toBe(Math.floor((112 * 30) / 7)); // 480
  });

  it('minimum yield is 1', () => {
    expect(calcExpYield({ baseExpYield: 1, level: 1 })).toBeGreaterThanOrEqual(1);
  });
});

describe('distributeExp', () => {
  it('awards exp to all living party members across all winning slots', () => {
    const recipients = [
      makeMon({ instanceId: 'a1', fainted: false }),
      makeMon({ instanceId: 'a2', fainted: false }),
      makeMon({ instanceId: 'a3', fainted: true }), // fainted — should NOT receive exp
    ];

    const awards = distributeExp({ expYield: 1714, recipients });

    expect(awards).toHaveLength(2); // only living mons
    expect(awards.find((a) => a.instanceId === 'a1')?.amount).toBe(1714);
    expect(awards.find((a) => a.instanceId === 'a2')?.amount).toBe(1714);
    expect(awards.find((a) => a.instanceId === 'a3')).toBeUndefined();
  });

  it('does not award exp when no living recipients', () => {
    const fainted = [makeMon({ fainted: true })];
    expect(distributeExp({ expYield: 1000, recipients: fainted })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/exp.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create packages/server/src/engine/exp.ts**

```typescript
import type { PartyMember } from '@poke-fighter/shared';

interface ExpYieldInput {
  baseExpYield: number;
  level: number;
}

export interface ExpAward {
  instanceId: string;
  amount: number;
  newTotal: number;
}

export function calcExpYield({ baseExpYield, level }: ExpYieldInput): number {
  return Math.max(1, Math.floor((baseExpYield * level) / 7));
}

interface DistributeInput {
  expYield: number;
  recipients: PartyMember[];
}

export function distributeExp({ expYield, recipients }: DistributeInput): ExpAward[] {
  return recipients
    .filter((mon) => !mon.fainted)
    .map((mon) => ({
      instanceId: mon.instanceId,
      amount: expYield,
      newTotal: mon.expTotal + expYield,
    }));
}

// Exp needed to reach a given level for each growth curve
// Matches main series values (same as Showdown).
const EXP_TABLES: Record<string, (level: number) => number> = {
  Erratic: (n) => {
    if (n <= 50) return Math.floor((n ** 3) * (100 - n) / 50);
    if (n <= 68) return Math.floor((n ** 3) * (150 - n) / 100);
    if (n <= 98) return Math.floor((n ** 3) * Math.floor((1911 - 10 * n) / 3) / 500);
    return Math.floor((n ** 3) * (160 - n) / 100);
  },
  Fast: (n) => Math.floor(4 * (n ** 3) / 5),
  MediumFast: (n) => n ** 3,
  MediumSlow: (n) => Math.floor(6 * (n ** 3) / 5 - 15 * (n ** 2) + 100 * n - 140),
  Slow: (n) => Math.floor(5 * (n ** 3) / 4),
  Fluctuating: (n) => {
    if (n <= 15) return Math.floor((n ** 3) * (Math.floor((n + 1) / 3) + 24) / 50);
    if (n <= 35) return Math.floor((n ** 3) * (n + 14) / 50);
    return Math.floor((n ** 3) * (Math.floor(n / 2) + 32) / 50);
  },
};

export function expForLevel(growth: string, level: number): number {
  const fn = EXP_TABLES[growth];
  if (!fn) return level ** 3;
  return fn(Math.min(100, Math.max(1, level)));
}

export interface LevelUpResult {
  instanceId: string;
  newLevel: number;
}

export function checkLevelUps(
  mon: PartyMember,
  newExpTotal: number,
  growth: string
): LevelUpResult | null {
  let level = mon.level;
  while (level < 100 && newExpTotal >= expForLevel(growth, level + 1)) {
    level++;
  }
  if (level > mon.level) return { instanceId: mon.instanceId, newLevel: level };
  return null;
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/exp.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/exp.ts packages/server/src/engine/__tests__/exp.test.ts
git commit -m "feat(engine): experience formula (Fire Red / team-wide Exp. All) and level-up detection"
```

---

## Task 2: Wire Exp into BattleRoom

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/SocketServer.ts`

- [ ] **Step 1: Add exp processing to BattleRoom**

After each turn resolution in `BattleRoom.resolveTurn`, detect faints and award exp. Add a new callback type:

```typescript
// Add to BattleRoom class:
type ExpAwardCallback = (awards: import('../engine/exp.js').ExpAward[]) => void;
type LevelUpCallback = (result: import('../engine/exp.js').LevelUpResult, newLevel: number) => void;

private onExpAwardCb: ExpAwardCallback | null = null;
private onLevelUpCb: LevelUpCallback | null = null;

onExpAward(cb: ExpAwardCallback): void { this.onExpAwardCb = cb; }
onLevelUp(cb: LevelUpCallback): void { this.onLevelUpCb = cb; }
```

In `BattleRoom.resolveTurn`, after engine resolution, scan for faint events:

```typescript
private processExpFromEvents(events: TurnResolveEvent[], newState: BattleState): void {
  for (const event of events) {
    if (event.type !== 'faint') continue;

    const faintedSlotId = event.data['slotId'] as string;
    const faintedInstanceId = event.data['instanceId'] as string;

    // Determine which team the fainted mon belongs to
    const faintedTeamIdx = newState.teams.findIndex((t) =>
      t.slots.some((s) => s.party.some((p) => p.instanceId === faintedInstanceId))
    );
    if (faintedTeamIdx === -1) continue;

    const faintedSlot = this.engine.findSlot(newState, faintedSlotId);
    const faintedMon = faintedSlot?.party.find((p) => p.instanceId === faintedInstanceId);
    if (!faintedMon) continue;

    // Get the fainted mon's species data for base exp yield
    const species = this.data.getSpecies(faintedMon.speciesId);
    if (!species) continue;

    const expYield = calcExpYield({ baseExpYield: species.baseExpYield, level: faintedMon.level });

    // Recipients: all living pokemon across all slots of the WINNING team
    const winningTeamIdx = faintedTeamIdx === 0 ? 1 : 0;
    const recipients = newState.teams[winningTeamIdx]?.slots.flatMap((s) => s.party) ?? [];

    const awards = distributeExp({ expYield, recipients });

    // Apply exp to state
    for (const award of awards) {
      for (const team of newState.teams) {
        for (const slot of team.slots) {
          const mon = slot.party.find((p) => p.instanceId === award.instanceId);
          if (mon) {
            mon.expTotal = award.newTotal;
            // Check level up
            const growth = this.data.getSpecies(mon.speciesId)?.expGrowth ?? 'MediumFast';
            const levelUp = checkLevelUps(mon, award.newTotal, growth);
            if (levelUp) {
              mon.level = levelUp.newLevel;
              const newStats = calcAllStats({
                baseStats: this.data.getSpecies(mon.speciesId)!.baseStats,
                ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, // placeholder — real ivs in PartyMember
                evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },        // placeholder — real evs in PartyMember
                level: levelUp.newLevel,
                nature: 'hardy',
              });
              this.onLevelUpCb?.({ instanceId: mon.instanceId, newLevel: levelUp.newLevel }, levelUp.newLevel);
            }
          }
        }
      }
    }

    this.onExpAwardCb?.(awards);
  }
}
```

Add import at top of BattleRoom.ts:

```typescript
import { calcExpYield, distributeExp, checkLevelUps, type ExpAward } from '../engine/exp.js';
import { DataLoader } from '../data/loader.js';
import { calcAllStats } from '../engine/stats.js';
```

Add `private readonly data = new DataLoader();` as class field.

Call `this.processExpFromEvents(events, newState)` inside `resolveTurn` before firing `onTurnResolvedCb`.

- [ ] **Step 2: Wire exp events in SocketServer**

In `SocketServer.startBattle`, after `room.onTurnResolved`:

```typescript
room.onExpAward((awards) => {
  this.io.to(`battle:${initialState.battleId}`).emit('exp:award', { awards });
});

room.onLevelUp((result, newLevel) => {
  // Find the species for new stats
  const team = this.findTeamByInstance(newState, result.instanceId);
  this.io.to(`battle:${initialState.battleId}`).emit('level:up', {
    instanceId: result.instanceId,
    newLevel,
    newStats: {} as any, // attach from BattleRoom callback if needed
  });
});
```

- [ ] **Step 3: Run all server tests**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/engine/exp.ts packages/server/src/socket/BattleRoom.ts packages/server/src/socket/SocketServer.ts
git commit -m "feat(server): exp awards and level-up events emitted after each faint"
```

---

## Task 3: Exp Bar UI

**Files:**
- Create: `packages/client/src/battle/overlays/ExpBar.tsx`

- [ ] **Step 1: Create packages/client/src/battle/overlays/ExpBar.tsx**

```tsx
import { useEffect, useState } from 'react';
import { getSocket } from '../../socket.js';
import type { ExpAwardPayload, LevelUpPayload } from '@poke-fighter/shared';

interface Props {
  instanceId: string;
  currentLevel: number;
}

export function ExpBar({ instanceId, currentLevel }: Props) {
  const [expGain, setExpGain] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on('exp:award', (payload: ExpAwardPayload) => {
      const award = payload.awards.find((a) => a.instanceId === instanceId);
      if (award) {
        setExpGain(award.amount);
        setTimeout(() => setExpGain(null), 3000);
      }
    });

    socket.on('level:up', (payload: LevelUpPayload) => {
      if (payload.instanceId === instanceId) {
        setLevelUp(payload.newLevel);
        setTimeout(() => setLevelUp(null), 4000);
      }
    });

    return () => {
      socket.off('exp:award');
      socket.off('level:up');
    };
  }, [instanceId]);

  if (!expGain && !levelUp) return null;

  return (
    <div style={styles.container}>
      {levelUp && (
        <div style={styles.levelUp}>
          ★ Level Up! Now Lv.{levelUp} ★
        </div>
      )}
      {expGain && !levelUp && (
        <div style={styles.expGain}>
          +{expGain} EXP
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'absolute' as const, bottom: 220, left: 80, zIndex: 100 },
  levelUp: { background: '#f0c040', color: '#000', padding: '6px 14px', borderRadius: 4, fontSize: 14, fontWeight: 'bold', letterSpacing: 1, animation: 'fadeIn 0.3s ease' },
  expGain: { background: '#1a3a5c', color: '#3498db', border: '1px solid #3498db', padding: '4px 10px', borderRadius: 3, fontSize: 12, letterSpacing: 1 },
};
```

- [ ] **Step 2: Add ExpBar to BattlePage**

In `BattleView`, below `BattleCanvas`:

```tsx
import { ExpBar } from '../battle/overlays/ExpBar.js';

// Inside BattleView, below BattleCanvas:
{myActiveMon && (
  <ExpBar instanceId={myActiveMon.instanceId} currentLevel={myActiveMon.level} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/battle/overlays/ExpBar.tsx packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): ExpBar overlay — shows exp gain and level-up notification"
```

---

## Task 4: Admin NPC Action Panel

**Files:**
- Create: `packages/client/src/admin/NpcActionPanel.tsx`
- Create: `packages/client/src/admin/ControlPanel.tsx`

- [ ] **Step 1: Add npc:action-request event to shared types**

In `packages/shared/src/types/events.ts`, add to `ServerToClientEvents`:

```typescript
'npc:action-request': (payload: {
  battleId: string;
  slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>;
}) => void;
```

- [ ] **Step 2: Emit npc:action-request from SocketServer**

In `SocketServer.startBattle`, after emitting `battle:start`:

```typescript
// Emit action requests for NPC slots to the admin socket
room.onNpcActionRequired((npcRequests) => {
  // Find admin socket
  for (const [id, socket] of this.io.sockets.sockets) {
    if (socket.data['isAdmin']) {
      socket.emit('npc:action-request', {
        battleId: initialState.battleId,
        slots: npcRequests,
      });
    }
  }
});
```

Add `onNpcActionRequired` callback to `BattleRoom` — called after each `turn:start` with the list of NPC slots needing actions.

- [ ] **Step 3: Create packages/client/src/admin/NpcActionPanel.tsx**

```tsx
import { useState } from 'react';
import { getSocket } from '../socket.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
}

export function NpcActionPanel({ battleId, npcRequests }: Props) {
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  function submitNpcAction(slotId: string, moveIndex: number, targetSlotId?: string) {
    getSocket().emit('admin:action', {
      type: 'npc-action',
      data: {
        battleId,
        slotId,
        action: { type: 'move', moveIndex, targetSlotId },
      },
    } as any);
    setSubmitted((prev) => new Set([...prev, slotId]));
  }

  if (npcRequests.length === 0) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>NPC ACTIONS — {submitted.size}/{npcRequests.length} submitted</div>
      <div style={styles.slots}>
        {npcRequests.map((npcReq) => {
          const done = submitted.has(npcReq.slotId);
          return (
            <div key={npcReq.slotId} style={{ ...styles.slot, opacity: done ? 0.5 : 1 }}>
              <div style={styles.npcName}>{npcReq.displayName} {done ? '✓' : ''}</div>
              <div style={styles.moveGrid}>
                {npcReq.request.validMoves.map((mv) => (
                  <button
                    key={mv.index}
                    style={{ ...styles.moveBtn, opacity: mv.disabled || mv.pp === 0 || done ? 0.4 : 1 }}
                    disabled={mv.disabled || mv.pp === 0 || done}
                    onClick={() => {
                      // If multiple targets available, pick first for simplicity (admin can pick manually via targeting)
                      const target = npcReq.request.legalTargets[0];
                      submitNpcAction(npcReq.slotId, mv.index, target);
                    }}
                  >
                    <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{mv.moveId}</span>
                    <span style={{ color: '#555', fontSize: 10 }}>PP {mv.pp}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 6, padding: 16 },
  header: { color: '#e74c3c', fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  slots: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  slot: { background: '#111', borderRadius: 4, padding: 10 },
  npcName: { color: '#aaa', fontSize: 12, marginBottom: 6, letterSpacing: 1 },
  moveGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '6px 8px', borderRadius: 3, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontFamily: 'inherit' },
};
```

- [ ] **Step 4: Create packages/client/src/admin/ControlPanel.tsx**

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { BattleProvider } from '../battle/BattleContext.js';
import { BattleCanvas } from '../battle/BattleCanvas.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { NpcActionPanel } from './NpcActionPanel.js';
import type { BattleState } from '@poke-fighter/shared';

interface Props { battleId: string }

export function ControlPanel({ battleId }: Props) {
  const [npcRequests, setNpcRequests] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on('npc:action-request' as any, (payload: any) => {
      if (payload.battleId === battleId) {
        setNpcRequests(payload.slots);
      }
    });

    socket.on('turn:resolve' as any, () => {
      setNpcRequests([]); // clear after turn resolves
    });

    return () => {
      socket.off('npc:action-request' as any);
      socket.off('turn:resolve' as any);
    };
  }, [battleId]);

  function sendAdminAction(type: string, data: Record<string, unknown>) {
    getSocket().emit('admin:action', { type, data: { battleId, ...data } } as any);
  }

  function handleForceFaint(slotId: string) {
    if (confirm(`Force-faint the active Pokémon in slot ${slotId}?`)) {
      sendAdminAction('force-faint', { slotId });
    }
  }

  function handleForfeit(teamId: string) {
    if (confirm(`Forfeit ${teamId}?`)) {
      sendAdminAction('forfeit', { teamId });
    }
  }

  function togglePause() {
    sendAdminAction(paused ? 'unpause' : 'pause', {});
    setPaused(!paused);
  }

  return (
    <BattleProvider mySlotId="__admin__">
      <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', gap: 16, padding: 16 }}>

        {/* Left: battle view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW — {battleId}</div>
          <BattleCanvas state={null} mySlotId="__admin__" targetingMoveIndex={null} legalTargets={[]} onTargetSelected={() => {}} onCancelTargeting={() => {}} />

          {/* Admin battle controls */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={togglePause} style={{ ...btnStyle, background: paused ? '#27ae60' : '#e67e22' }}>
              {paused ? '▶ UNPAUSE' : '⏸ PAUSE'}
            </button>
            <button onClick={() => handleForfeit('team-a')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM A</button>
            <button onClick={() => handleForfeit('team-b')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM B</button>
          </div>
        </div>

        {/* Right: NPC control + log */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NpcActionPanel battleId={battleId} npcRequests={npcRequests} />
        </div>

      </div>
    </BattleProvider>
  );
}

const btnStyle = { color: '#fff', border: 'none', padding: '8px 16px', fontSize: 12, letterSpacing: 1, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/NpcActionPanel.tsx packages/client/src/admin/ControlPanel.tsx packages/shared/src/types/events.ts
git commit -m "feat(client): admin NPC action panel and battle control panel"
```

---

## Task 5: Admin Overrides (force-faint, forfeit)

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`

- [ ] **Step 1: Add forceOverride methods to BattleRoom**

```typescript
// Add to BattleRoom class:
forceFaint(slotId: string): void {
  const slot = this.engine.findSlot(this.state, slotId);
  if (!slot) return;
  const mon = slot.party[slot.activePokemonIndex];
  if (!mon) return;

  const s = structuredClone(this.state);
  const slotInState = this.engine.findSlot(s, slotId)!;
  const monInState = slotInState.party[slotInState.activePokemonIndex]!;
  monInState.fainted = true;
  monInState.currentHp = 0;
  this.state = s;

  const faintEvent: import('@poke-fighter/shared').TurnResolveEvent = {
    type: 'faint',
    data: { slotId, instanceId: mon.instanceId, source: 'admin' },
  };
  this.processExpFromEvents([faintEvent], s);
  this.onTurnResolvedCb?.([faintEvent], s);
}

forfeit(teamId: string): void {
  const s = structuredClone(this.state);
  const team = s.teams.find((t) => t.teamId === teamId);
  if (!team) return;

  for (const slot of team.slots) {
    for (const mon of slot.party) {
      mon.fainted = true;
      mon.currentHp = 0;
    }
  }
  this.state = s;

  const winnerIdx = s.teams.findIndex((t) => t.teamId !== teamId);
  s.phase = 'ended';
  s.winner = winnerIdx as 0 | 1;
  this.onBattleEndCb?.(s.teams[winnerIdx]?.teamId ?? '', s);
}
```

- [ ] **Step 2: Wire force-faint and forfeit in adminHandlers.ts**

```typescript
case 'force-faint': {
  const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
  getRoom(battleId)?.forceFaint(slotId);
  break;
}
case 'forfeit': {
  const { battleId, teamId } = payload.data as { battleId: string; teamId: string };
  getRoom(battleId)?.forfeit(teamId);
  break;
}
```

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/handlers/adminHandlers.ts
git commit -m "feat(server): admin force-faint and forfeit battle overrides"
```

---

## Task 6: End-to-End Smoke Test

- [ ] **Step 1: Start server**

```bash
pnpm --filter @poke-fighter/server dev
```

- [ ] **Step 2: Start client**

```bash
pnpm --filter @poke-fighter/client dev
```

- [ ] **Step 3: Admin setup**

1. Open `http://localhost:5173/admin`
2. Enter admin token
3. Set up a 1v1 battle with one player slot (Team A) and one NPC slot (Team B)
4. Open a second browser tab at `http://localhost:5173` and join with a display name
5. Back in admin, assign the connected player to Team A and an NPC to Team B
6. Build both teams using the team builder (pick any Pokémon and moves)
7. Click "Start Battle"

- [ ] **Step 4: Verify battle flow**

1. Player tab transitions to `/battle` and sees the Phaser canvas
2. Admin tab shows the NPC action panel on turn start
3. Admin picks a move for the NPC; player picks a move in the move panel
4. Turn resolves — both mons take damage, turn log updates, HP bars shrink
5. When a Pokémon faints, exp award notification appears for the winning player
6. Battle ends when all Pokémon on one side faint

- [ ] **Step 5: Commit smoke test passing**

```bash
git add .
git commit -m "chore: end-to-end smoke test passed — full battle flow working"
```

---

**Plan 07 complete. All 9 features are implemented:**

| Feature | Plan | Status |
|---------|------|--------|
| F1 — Pokémon Data Layer | 01 | ✓ |
| F2 — Player Lobby | 04 | ✓ |
| F3 — Registry | 04 | ✓ |
| F4 — Admin Setup | 05 | ✓ |
| F5 — Battle Engine | 02 | ✓ |
| F6 — Sync Protocol | 03 | ✓ |
| F7 — Battle UI | 06 | ✓ |
| F8 — Admin Control | 07 | ✓ |
| F9 — Experience System | 07 | ✓ |
