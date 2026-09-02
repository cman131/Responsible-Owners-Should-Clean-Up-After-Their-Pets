# Plan 15 — Recovery & Healing Status Moves

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register handlers in `registrations.ts` for all healing and recovery status moves. Several require new infrastructure (delayed heal for Wish, self-faint for Healing Wish/Lunar Dance, team-status clear for Aromatherapy/Heal Bell, HP-averaging for Pain Split, stat-drain for Strength Sap).

**Architecture:** Most moves use `custom()` factory from `effectFactories.ts`. Simple percentage heals can use the existing `healPercent()` factory. New helpers: `delayedHeal()` for Wish (adds a volatile that EffectEngine resolves at end of next turn), `selfFaintNextAllyHeal()` for Healing Wish / Lunar Dance (user faints, sets a flag on the team for when next Pokemon switches in).

**Already registered (skip):** `roost`, `recover`, `softboiled`, `milkdrink`, `moonlight`, `synthesis` — but note `moonlight`/`synthesis`/`morningsun` currently heal flat 50%. After this plan they should heal 25% in bad weather (sand/hail/snow) and 66% in sun (see Task 6).

**Tech Stack:** TypeScript, Vitest — `packages/server` only.

**Test commands:** `npm test` from `packages/server/`. New test file: `npx vitest run src/engine/__tests__/healingMoves.test.ts`.

---

### Task 1: Simple Percentage Heals

These are identical in behaviour to already-registered moves. Just add registrations.

**Files:** `packages/server/src/engine/registrations.ts`

- [ ] **Step 1:** Write tests confirming each move heals 50% max HP:
  - `slackoff`, `shoreup` (base; weather variant comes in Task 6)
- [ ] **Step 2:** Register in `registrations.ts`:
  ```typescript
  r.register('slackoff',    healPercent(0.5));
  r.register('shoreup',     healPercent(0.5)); // weather variant added in Task 6
  r.register('morningsun',  healPercent(0.5)); // weather variant added in Task 6
  ```
  Note: `morningsun` should eventually be weather-sensitive (Task 6). For now, flat 50%.
- [ ] **Step 3:** Run `npm test`.

---

### Task 2: Aromatherapy & Heal Bell (Team Status Cure)

**Files:**
- `packages/server/src/engine/registrations.ts`
- `packages/server/src/engine/effectFactories.ts` (new `cureTeamStatus` factory)

Cure all non-fainted party members' status conditions. Heal Bell also cures status blocked by sound-proof (no ability check needed for our scope).

- [ ] **Step 1:** Write a failing test — party of 3 with brn/par/psn; after Aromatherapy all have `status === undefined`.
- [ ] **Step 2:** Add `cureTeamStatus()` factory to `effectFactories.ts`:
  ```typescript
  export function cureTeamStatus(): MoveEffectHandler {
    return (ctx) => {
      const events: TurnResolveEvent[] = [];
      const userSlot = ctx.battle.teams[ctx.userTeamIndex]?.slots.find(
        sl => sl.party[sl.activePokemonIndex]?.instanceId === ctx.battle.teams[ctx.userTeamIndex]
          ?.slots[0]?.party[ctx.battle.teams[ctx.userTeamIndex]!.slots[0]!.activePokemonIndex]?.instanceId
      );
      // iterate over all party members in the user's team
      for (const slot of ctx.battle.teams[ctx.userTeamIndex]!.slots) {
        for (const mon of slot.party) {
          if (!mon.fainted && mon.status) {
            const old = mon.status;
            delete mon.status;
            events.push({ type: 'status-cured', data: { slotId: slot.slotId, status: old, reason: 'move' } });
          }
        }
      }
      return { events };
    };
  }
  ```
- [ ] **Step 3:** Register:
  ```typescript
  r.register('aromatherapy', cureTeamStatus());
  r.register('healbell',     cureTeamStatus());
  ```
- [ ] **Step 4:** Run tests.

---

### Task 3: Wish (Delayed Heal)

**Files:**
- `packages/shared/src/types/battle.ts` — add `wish?: { hp: number }` to `VolatileStatusEntry` or as a field on `SlotState`
- `packages/server/src/engine/effectFactories.ts`
- `packages/server/src/engine/EffectEngine.ts`
- `packages/server/src/engine/registrations.ts`

Wish heals the Pokemon active in the user's slot at the end of the NEXT turn by 50% of the user's max HP (not the recipient's).

- [ ] **Step 1:** Write test — Pokemon uses Wish (HP=200), is at 100 HP; end of next turn HP becomes 200.
- [ ] **Step 2:** Add `wish` as a slot-level volatile (not pokemon-level, since the Pokemon may switch): store `{ hp: Math.floor(user.maxHp / 2), turnsRemaining: 1 }` on the user's `SlotState`. Or use an existing `SlotState` field — check the type for available extensibility.
- [ ] **Step 3:** In `EffectEngine.runEndOfTurn`, for each slot: if a wish is pending, decrement turns. When it hits 0, apply the heal to the currently active Pokemon in that slot. Emit `heal` event.
- [ ] **Step 4:** Register:
  ```typescript
  r.register('wish', wish());
  ```
- [ ] **Step 5:** Run `npm test`.

---

### Task 4: Healing Wish & Lunar Dance (Self-Faint + Next Ally Heal)

**Files:**
- `packages/shared/src/types/battle.ts` — add `pendingHeal?: 'healingwish' | 'lunardance'` to `SlotState` or `TeamState`
- `packages/server/src/engine/registrations.ts`
- `packages/server/src/engine/BattleEngine.ts` — switch-in path

Healing Wish: user faints; next Pokemon that switches into the user's slot is fully healed.
Lunar Dance: same, but also restores all PP.

- [ ] **Step 1:** Write test — after Healing Wish, user faints; when next Pokemon switches in, it's fully healed.
- [ ] **Step 2:** In the handler: set `user.currentHp = 0; user.fainted = true`, emit `faint`. Set `slotState.pendingHeal = 'healingwish'` (or `'lunardance'`).
- [ ] **Step 3:** In the switch-in path in `BattleEngine` (wherever a new Pokemon is activated after a slot-in), check `slotState.pendingHeal`. If set, heal the incoming Pokemon to full HP (and restore PP for Lunar Dance). Clear the flag.
- [ ] **Step 4:** Register both.
- [ ] **Step 5:** Run tests.

---

### Task 5: Refresh, Purify, Psycho Shift

**Files:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

- **Refresh:** cure user's own status condition. Fail if no status.
- **Purify:** cure target's status, then heal user 50% if successful. Fail if target has no status.
- **Psycho Shift:** transfer user's status to target (user's status must exist; target must be able to receive it). User's status cleared.

- [ ] **Step 1:** Write tests for each.
- [ ] **Step 2:** Implement as `custom()` handlers and register.
- [ ] **Step 3:** Run tests.

---

### Task 6: Pain Split

**Files:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

Average the HP of user and target: `newHp = Math.floor((user.currentHp + target.currentHp) / 2)`. Cap at max HP for each. Fail if both have equal HP.

- [ ] **Step 1:** Write test — user at 30 HP, target at 90 HP → both land at 60 HP.
- [ ] **Step 2:** Implement and register `painsplit`.
- [ ] **Step 3:** Run tests.

---

### Task 7: Strength Sap

**Files:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

Heal user by target's effective Atk stat value (after stat stages), then lower target's Atk by 1. Fail if target's Atk is at -6.

```typescript
const atkValue = getEffectiveStat(target.stats.atk, target.statBoosts.atk, 'atk');
// heal user by atkValue (capped at max HP)
// then apply -1 Atk to target
```

- [ ] **Step 1:** Write test — target has 100 effective Atk; user healed by 100 HP, target Atk drops.
- [ ] **Step 2:** Implement and register `strengthsap`.
- [ ] **Step 3:** Run tests.

---

### Task 8: Heal Pulse, Floral Healing, Life Dew, Jungle Healing, Lunar Blessing

**Files:** `packages/server/src/engine/registrations.ts`

- **Heal Pulse:** heal target 50% max HP (heals foe in 1v1 — unusual but valid). In 1v1 context, target is the opponent.
- **Floral Healing:** heal target 50% (66% in Grassy Terrain).
- **Life Dew:** heal user and all allies 25%.
- **Jungle Healing:** heal user and all allies 25%, cure their status.
- **Lunar Blessing:** heal user 25%, cure user's status. (Some sources say 25%; verify against Showdown.)

These are all purely self/ally targeted. In 1v1, only user-targeting variants are relevant; skip ally variants for now.

- [ ] **Step 1:** Register as `custom()` handlers.
- [ ] **Step 2:** Write a test for Heal Pulse healing the target.
- [ ] **Step 3:** Run tests.

---

### Task 9: Weather-Sensitive Heals (Morning Sun, Moonlight, Synthesis, Shore Up fix)

**Files:** `packages/server/src/engine/registrations.ts` — update existing registrations for `morningsun`, `moonlight`, `synthesis`, `shoreup`

| Weather | Heal fraction |
|---------|--------------|
| Sun / Harsh Sun | 2/3 |
| None | 1/2 |
| Any other weather (rain, sand, snow, etc.) | 1/4 |

Shore Up: heals 1/2 normally, 2/3 in sand.

Replace the flat `healPercent(0.5)` registrations with `custom()` handlers that check `ctx.battle.field.weather?.type`.

- [ ] **Step 1:** Write test — Moonlight in sun heals ~66%, in rain heals 25%.
- [ ] **Step 2:** Update registrations for `moonlight`, `synthesis`, `morningsun`, `shoreup`.
- [ ] **Step 3:** Run tests.

---

### Task 10: Rest

**Files:** `packages/server/src/engine/registrations.ts`, `effectFactories.ts`

Rest: user falls asleep (2 turns of sleep) and is fully healed. Fails if already asleep, HP is full, or Electric Terrain (already handled by sleep immunity). Uses the existing `applyStatus` flow with `slp` — ensure sleep counter is set to 2 (not random 1-3).

- [ ] **Step 1:** Write test — Pokemon at 50% HP uses Rest; HP becomes 100%, status becomes `slp` with counter = 2.
- [ ] **Step 2:** Implement as custom handler. Set sleep counter to exactly 2 (override the random counter in `applyStatus` — may need a `{forced: true, counter: 2}` option added to `applyStatus`).
- [ ] **Step 3:** Register `rest`.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`.
