# Design Spec: Recovery & Healing Status Moves (Plan 15)

**Date:** 2026-09-03  
**Scope:** All 10 tasks from `docs/upcoming-features/15-recovery-healing-status-moves.md`  
**Packages:** `packages/server` (primary), `packages/shared` (type extensions only)

---

## Architecture

### Shared type changes (`packages/shared/src/types/battle.ts`)

Add two optional fields to `SlotState` to support slot-level (position-persisting) state:

```typescript
export interface SlotState {
  // ... existing fields unchanged ...
  wish?: { hp: number; turnsRemaining: number };
  pendingHeal?: 'healingwish' | 'lunardance';
}
```

These live on the slot (not the `PartyMember`) so they survive Pokemon switches.

### `applyStatus` tweak (`packages/server/src/engine/effects.ts`)

Add `sleepCounter?: number` to the `options` parameter so Rest can force a counter of 2:

```typescript
export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean; sleepCounter?: number },
  battle?: BattleState,
): TurnResolveEvent | null
```

When `options.sleepCounter` is provided, use it instead of the random 1-3 roll.

### New factory: `cureTeamStatus` (`packages/server/src/engine/effectFactories.ts`)

Iterates the user's team slots and party members, clearing status on all non-fainted members. Also clears the `toxic` volatile counter:

```typescript
export function cureTeamStatus(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const slot of ctx.battle.teams[ctx.userTeamIndex]!.slots) {
      for (const mon of slot.party) {
        if (!mon.fainted && mon.status) {
          const old = mon.status;
          delete mon.status;
          mon.volatileStatus = mon.volatileStatus.filter(v => v.name !== 'toxic');
          events.push({ type: 'status-cured', data: { slotId: slot.slotId, status: old, reason: 'move' } });
        }
      }
    }
    return { events };
  };
}
```

> **Note:** The plan's code snippet for this factory had a dead-code `userSlot` variable. The correct implementation iterates `ctx.battle.teams[ctx.userTeamIndex].slots` directly.

### Wish resolution (`packages/server/src/engine/BattleEngine.ts`, EoT loop)

Wish decrement and heal is added to `BattleEngine`'s existing end-of-turn slot loop (around line 1651), before calling `runEndOfTurn`. No changes to `EffectEngine.runEndOfTurn`'s signature:

```typescript
// For each slot in the EoT loop:
if (slot.wish) {
  slot.wish.turnsRemaining--;
  if (slot.wish.turnsRemaining <= 0) {
    const active = slot.party[slot.activePokemonIndex];
    if (active && !active.fainted) {
      const heal = Math.min(slot.wish.hp, active.maxHp - active.currentHp);
      if (heal > 0) {
        active.currentHp += heal;
        events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
      }
    }
    delete slot.wish;
  }
}
```

### Healing Wish / Lunar Dance switch-in hook (`packages/server/src/engine/BattleEngine.ts`)

After `slot.activePokemonIndex = newIndex` (switch-in path, around line 1537):

```typescript
if (slot.pendingHeal && incoming) {
  const priorHp = incoming.currentHp;
  incoming.currentHp = incoming.maxHp;
  if (slot.pendingHeal === 'lunardance') {
    for (const m of incoming.moves) m.currentPp = m.maxPp;
  }
  delete slot.pendingHeal;
  events.push({ type: 'heal', data: { slotId: slot.slotId, amount: incoming.maxHp - priorHp, remainingHp: incoming.maxHp } });
}
```

---

## Task-by-task summary

### Task 1 — Simple percentage heals
Register via existing `healPercent(0.5)`:
- `slackoff`, `shoreup`, `morningsun` (all get weather variants in Task 9)

### Task 2 — Aromatherapy & Heal Bell
New `cureTeamStatus()` factory (see above). Register both moves.

### Task 3 — Wish
- `wish()` factory: looks up `SlotState` via `ctx.battle`, sets `slot.wish = { hp: Math.floor(user.maxHp / 2), turnsRemaining: 1 }`
- EoT resolution: handled in `BattleEngine` EoT loop (Approach A)

### Task 4 — Healing Wish & Lunar Dance
- Move handler: look up user's `SlotState`, set `user.fainted = true; user.currentHp = 0`, set `slot.pendingHeal`, emit faint
- Switch-in path: check and apply `slot.pendingHeal` after `activePokemonIndex` update

### Task 5 — Refresh, Purify, Psycho Shift
All `custom()` handlers in `registrations.ts`:
- **Refresh:** fail if `!user.status`; clear `user.status`, emit `status-cured`
- **Purify:** fail if `!target.status`; clear target status, then heal user 50%
- **Psycho Shift:** fail if `!user.status` or target already has status; transfer user status to target (set counter/volatile as needed), clear user status

### Task 6 — Pain Split
`custom()` handler:
- `newHp = Math.floor((user.currentHp + target.currentHp) / 2)`
- Cap both at their respective max HP
- Fail if both have equal HP (or if result equals both current HPs — no change)

### Task 7 — Strength Sap
`custom()` handler:
- Fail if `target.statBoosts.atk <= -6`
- `atkValue = getEffectiveStat(target.stats.atk, target.statBoosts.atk, 'atk')`
- Heal user by `atkValue` (capped at `user.maxHp - user.currentHp`)
- Apply `-1 atk` to target via `applyStatBoost`

### Task 8 — Heal Pulse, Floral Healing, Life Dew, Jungle Healing, Lunar Blessing
All `custom()` handlers targeting in 1v1 scope:
- **Heal Pulse:** heal target 50% (target = opponent in 1v1)
- **Floral Healing:** heal target 50% (66% if grassy terrain active)
- **Life Dew:** heal user 25%
- **Jungle Healing:** heal user 25%, cure user's status
- **Lunar Blessing:** heal user 25%, cure user's status

### Task 9 — Weather-sensitive heals
Replace flat `healPercent(0.5)` registrations with `custom()` handlers for `moonlight`, `synthesis`, `morningsun`, `shoreup`:

| Weather | moonlight / synthesis / morningsun | shoreup |
|---------|-------------------------------------|---------|
| Sun / Harsh Sun | 2/3 | 1/2 |
| Sand | 1/4 | 2/3 |
| Any other weather | 1/4 | 1/2 |
| None | 1/2 | 1/2 |

### Task 10 — Rest
`custom()` handler:
1. Fail if `user.status === 'slp'`
2. Fail if `user.currentHp >= user.maxHp`
3. Clear any existing status (emit `status-cured`), clear `toxic` volatile
4. Call `applyStatus(user, slotId, 'slp', types, { sleepCounter: 2 }, battle)` — uses new `sleepCounter` option
5. Heal user to `maxHp`, emit `heal`

---

## Testing

New test file: `packages/server/src/engine/__tests__/healingMoves.test.ts`

Key test cases:
- Task 1: slackoff/shoreup/morningsun each heal 50% of max HP
- Task 2: party of 3 with brn/par/psn → all cleared after aromatherapy
- Task 3: wish user (maxHp=200, currentHp=100) → end of next turn currentHp=200
- Task 4: healing wish → user faints; next switch-in is at full HP
- Task 5: refresh clears user status; purify clears target and heals user; psycho shift transfers status
- Task 6: pain split 30/90 → both at 60
- Task 7: strength sap with target atk=100 → user healed 100, target atk -1
- Task 8: heal pulse heals opponent 50%
- Task 9: moonlight in sun heals 66%, in rain heals 25%
- Task 10: rest at 50% HP → 100% HP, status = slp with counter exactly 2

---

## Files changed

| File | Change |
|------|--------|
| `packages/shared/src/types/battle.ts` | Add `wish` and `pendingHeal` to `SlotState` |
| `packages/server/src/engine/effects.ts` | Add `sleepCounter` option to `applyStatus` |
| `packages/server/src/engine/effectFactories.ts` | Add `cureTeamStatus`, `wish` factory |
| `packages/server/src/engine/registrations.ts` | Register all new moves |
| `packages/server/src/engine/BattleEngine.ts` | Wish EoT resolution + Healing Wish switch-in hook |
| `packages/server/src/engine/__tests__/healingMoves.test.ts` | New test file |
