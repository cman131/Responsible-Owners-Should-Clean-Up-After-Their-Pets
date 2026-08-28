# Secondary Effect Framework — Design Spec

**Date:** 2026-08-28
**Feature doc:** `docs/upcoming-features/03-secondary-effect-framework.md`
**Status:** Approved, ready for implementation planning

---

## Overview

Extends the battle engine to support all secondary effect categories that damaging moves can produce. Currently `evaluateSecondaryEffect` handles only the six non-volatile status conditions. This spec adds a `Secondary` discriminated union to the `Move` type, implements `applySecondaries` to dispatch each kind, and wires multi-hit, charge-turn, recharge, OHKO, and self-KO into `BattleEngine.executeMove`.

---

## Approach

**Approach B — `applySecondaries` pure function + multi-hit extracted pre-loop.**

`applySecondaries(ctx)` in `effects.ts` handles all post-damage secondaries via a switch on `secondary.kind`. `BattleEngine.executeMove` extracts the structurally-special secondaries (multi-hit, charge, OHKO) before the damage block. `EffectEngine.runPreMove` gains flinch and recharge checks. A local `Set<string>` in `resolveTurn` tracks which slots have moved, enabling correct flinch gating.

Existing `move.effect` / `move.effectChance` continue to work unchanged via `evaluateSecondaryEffect`.

---

## File Changes

| File | Change |
|------|--------|
| `packages/shared/src/types/secondary.ts` | **New** — `Secondary` discriminated union, `StatName` |
| `packages/shared/src/types/pokemon.ts` | Add `secondaries?: Secondary[]` to `Move` |
| `packages/shared/src/schemas/move.schema.ts` | Add `SecondarySchema` Zod union + `secondaries` field |
| `packages/shared/src/index.ts` | Re-export `Secondary`, `StatName` from `secondary.ts` |
| `packages/server/src/engine/effects.ts` | Add `SecondaryContext`, `applySecondaries` |
| `packages/server/src/engine/BattleEngine.ts` | Wire multi-hit loop, charge/recharge/OHKO dispatch, `movedSlotIds`, call `applySecondaries` |
| `packages/server/src/engine/EffectEngine.ts` | Add flinch and recharge checks in `runPreMove` |
| `data/moves.json` | Add `secondaries[]` for ~22 priority moves |
| `packages/server/src/engine/__tests__/secondaries.test.ts` | **New** — unit tests for `applySecondaries` |
| `packages/server/src/engine/__tests__/EffectEngine.test.ts` | Extend — flinch and recharge `runPreMove` tests |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Extend — multi-hit, charge, OHKO integration tests |

---

## Type System

### `shared/types/secondary.ts` (new)

```typescript
import type { StatusCondition } from './pokemon.js';

export type StatName = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';

export type Secondary =
  | { kind: 'status';      status: StatusCondition; chance: number; target: 'target' | 'user' }
  | { kind: 'stat';        stat: StatName; stages: number; chance: number; target: 'target' | 'user' }
  | { kind: 'flinch';      chance: number }
  | { kind: 'confusion';   chance: number; target: 'target' | 'user' }
  | { kind: 'drain';       fraction: [number, number] }
  | { kind: 'recoil';      fraction: [number, number] }
  | { kind: 'recoil-hp';   fraction: [number, number] }
  | { kind: 'multihit';    hits: number | [number, number] }
  | { kind: 'ohko' }
  | { kind: 'selfdestruct'; variant: 'normal' | 'memento' | 'healingwish' }
  | { kind: 'charge';      chargeVolatile: string }
  | { kind: 'recharge' };
```

`Move` in `pokemon.ts` gets `secondaries?: Secondary[]`. Existing `effect?` and `effectChance?` fields remain on `Move` for backward compatibility.

### Zod schema (`move.schema.ts`)

```typescript
const SecondarySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), status: z.string(), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('stat'), stat: z.string(), stages: z.number().int(), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('flinch'), chance: z.number() }),
  z.object({ kind: z.literal('confusion'), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('drain'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil-hp'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('multihit'), hits: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]) }),
  z.object({ kind: z.literal('ohko') }),
  z.object({ kind: z.literal('selfdestruct'), variant: z.enum(['normal', 'memento', 'healingwish']) }),
  z.object({ kind: z.literal('charge'), chargeVolatile: z.string() }),
  z.object({ kind: z.literal('recharge') }),
]);

// added to MoveSchema:
secondaries: SecondarySchema.array().optional(),
```

---

## `SecondaryContext` and `applySecondaries`

### Interface

```typescript
// in effects.ts
export interface SecondaryContext {
  secondaries: Secondary[];
  totalDamage: number;
  user: PartyMember;
  userSlotId: string;
  target: PartyMember;
  targetSlotId: string;
  targetTypes: PokemonType[];
  battle: BattleState;
  rng: () => number;
  movedSlotIds: Set<string>;
}
```

### Per-kind logic

| Kind | Logic |
|------|-------|
| `status` | Roll `chance`; call `applyStatus(target/user, ...)` |
| `stat` | Roll `chance`; call `applyStatBoost(target/user, slotId, { [stat]: stages })` |
| `flinch` | Roll `chance`; if `!movedSlotIds.has(targetSlotId)`, push `{ name: 'flinch' }` to target volatileStatus |
| `confusion` | Roll `chance`; call `applyVolatile(target/user, ..., 'confusion')` |
| `drain` | `heal = Math.floor(totalDamage * fraction[0] / fraction[1])`, capped at `maxHp - currentHp`; emit `heal` event. Skip if target was already fainted before this secondary. |
| `recoil` | `amt = Math.floor(totalDamage * fraction[0] / fraction[1])`, reduce user HP; faint if 0. Emit `damage-dealt` with `reason: 'recoil'`. |
| `recoil-hp` | `amt = Math.floor(user.maxHp * fraction[0] / fraction[1])`, same faint handling. |
| `selfdestruct: 'normal'` | User HP → 0, faint. |
| `selfdestruct: 'memento'` | User HP → 0, faint. Apply stat drop to target (−2 Atk/SpA for Memento). Healing Wish/Lunar Dance recovery deferred to doc 07. |
| `recharge` | Push `{ name: 'recharge' }` to user volatileStatus. |
| `multihit` | **Never reaches `applySecondaries`** — extracted by `executeMove` before the damage block. |
| `ohko` | **Never reaches `applySecondaries`** — handled by a pre-damage branch in `executeMove`. |
| `charge` | **Never reaches `applySecondaries`** — handled by a pre-damage branch in `executeMove`. |

Note: `drain` is skipped if `target.fainted` is true by the time the secondaries are applied (target fainted from the hit itself).

---

## BattleEngine Changes

### `resolveTurn` — `movedSlotIds`

```typescript
const movedSlotIds = new Set<string>();
for (const slotId of order) {
  const action = actions[slotId];
  // ... existing skip checks ...
  if (action.type === 'move') {
    const moveResult = this.executeMove(s, slotId, action, movedSlotIds);
    events.push(...moveResult.events);
    s = moveResult.newState;
  }
  movedSlotIds.add(slotId);
  // ...
}
```

### `executeMove` — new pre-damage flow

After resolving targets and before the per-target loop:

```
1. Extract secondaries: const secs = move.secondaries ?? [];

2. OHKO check (pre-damage, per-target):
   If secs has { kind: 'ohko' }:
     accuracy = clamp(30 + attacker.level - defender.level, 1, 100)
     If defender.level > attacker.level → emit miss, continue to next target
     If rng() * 100 >= accuracy → emit miss, continue
     Set target.currentHp = 0; emit damage-dealt + faint; continue (skip normal damage)

3. Charge-turn check (per-target, but affects user):
   If secs has { kind: 'charge', chargeVolatile } and user does NOT have chargeVolatile volatile:
     Apply chargeVolatile volatile to user
     Emit { type: 'volatile-applied', note: 'charging' }
     Return early (no damage this turn)
   If user HAS chargeVolatile:
     Remove it; proceed normally (Solar Beam in sun: skip charge volatile check entirely)

4. Multi-hit roll (pre-loop):
   If secs has { kind: 'multihit', hits }:
     hitCount = rollHitCount(hits, rng)
     Loop hitCount times (stop early if target faints):
       Full damage roll (independent crit per iteration)
       Accumulate totalDamage
     After loop: apply non-multihit secondaries via applySecondaries({ ..., totalDamage })
   Else:
     Single damage roll (existing logic); totalDamage = damage
     applySecondaries({ ..., totalDamage, secondaries: secs.filter(not ohko/charge/multihit) })
```

**Solar Beam in sun:** When executing damage for a charge move, check `s.field.weather?.type === 'sun'` before applying the charge volatile. If sunny, skip the charge volatile application and deal damage immediately.

### Multi-hit probability table (Gen 5+)

For variable hits `[2, 5]`:
```
2 hits → 3/8 probability
3 hits → 3/8 probability
4 hits → 1/8 probability
5 hits → 1/8 probability
```

---

## EffectEngine Changes (`runPreMove`)

At the top of `runPreMove`, before the sleep check:

```typescript
const flinchEntry = pokemon.volatileStatus.find(v => v.name === 'flinch');
if (flinchEntry) {
  pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'flinch');
  events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'flinch' } });
  return { blocked: true, events };
}

const rechargeEntry = pokemon.volatileStatus.find(v => v.name === 'recharge');
if (rechargeEntry) {
  pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'recharge');
  events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'recharge' } });
  return { blocked: true, events };
}
```

Flinch is cleared immediately on blocking. `EffectEngine` does not need `movedSlotIds` — by the time a slot's `runPreMove` runs, its position in turn order means flinch either applies (slower, not yet moved) or the volatile was never set (faster, already moved before the flinch hit).

---

## Priority Data Entries (`moves.json`)

These 22 moves get `secondaries[]` entries. Moves that already use `effect`/`effectChance` are left as-is.

| Move IDs | Secondary entry |
|----------|-----------------|
| crunch, irontail | `[{ kind:'stat', stat:'def', stages:-1, chance:20, target:'target' }]` (crunch: 20%, irontail: 30%) |
| shadowball | `[{ kind:'stat', stat:'spd', stages:-1, chance:20, target:'target' }]` |
| energyball | `[{ kind:'stat', stat:'spd', stages:-1, chance:10, target:'target' }]` |
| moonblast | `[{ kind:'stat', stat:'spa', stages:-1, chance:30, target:'target' }]` |
| chargebeam | `[{ kind:'stat', stat:'spa', stages:1, chance:70, target:'user' }]` |
| poweruppunch | `[{ kind:'stat', stat:'atk', stages:1, chance:100, target:'user' }]` |
| fierydance | `[{ kind:'stat', stat:'spa', stages:1, chance:50, target:'user' }]` |
| closecombat | `[{ kind:'stat', stat:'def', stages:-1, chance:100, target:'user' }, { kind:'stat', stat:'spd', stages:-1, chance:100, target:'user' }]` |
| dracometeor, overheat | `[{ kind:'stat', stat:'spa', stages:-2, chance:100, target:'user' }]` |
| bite, ironhead, headbutt | `[{ kind:'flinch', chance:30 }]` |
| rockslide, airslash | `[{ kind:'flinch', chance:30 }]` |
| signalbeam, psybeam | `[{ kind:'confusion', chance:10, target:'target' }]` |
| hurricane | `[{ kind:'confusion', chance:30, target:'target' }]` |
| gigadrain, leechlife, drainpunch | `[{ kind:'drain', fraction:[1,2] }]` |
| doubleedge, bravebird, flareblitz, woodhammer, volttackle | `[{ kind:'recoil', fraction:[1,3] }]` |
| takedown | `[{ kind:'recoil', fraction:[1,4] }]` |
| bulletseed, rockblast, pinmissile, furyattack, armthrust, scalshot | `[{ kind:'multihit', hits:[2,5] }]` |
| dualwingbeat, doublehit | `[{ kind:'multihit', hits:2 }]` |
| sheercold, fissure, guillotine, horndrill | `[{ kind:'ohko' }]` |
| explosion, selfdestruct | `[{ kind:'selfdestruct', variant:'normal' }]` |
| solarbeam | `[{ kind:'charge', chargeVolatile:'charging-solar-beam' }]` |
| fly, bounce | `[{ kind:'charge', chargeVolatile:'fly' }, ...fly charge ]` |
| hyperbeam, gigaimpact, blastburn, hydrocannon, frenzyplant, rockwrecker | `[{ kind:'recharge' }]` |

---

## Testing Plan

### New: `__tests__/secondaries.test.ts`

Unit tests calling `applySecondaries` directly via `vi.spyOn(Math, 'random')`:

- **Stat drop fires:** crunch secondary, rng=0 → target def drops 1
- **Stat drop skipped:** crunch secondary, rng=0.99 → no stat change
- **Self-stat boost fires:** chargebeam secondary, rng=0 → user spa +1
- **Flinch applied:** rng=0, target not in movedSlotIds → flinch volatile on target
- **Flinch skipped (already moved):** target in movedSlotIds → no flinch volatile
- **Confusion secondary:** rng=0 → confusion volatile on target with counter 2–5
- **Drain heals user:** totalDamage=80, [1,2] → user gains 40 HP, heal event
- **Drain capped at maxHp:** user at full HP → heal=0, no event
- **Drain skipped if target fainted:** target.fainted=true → no heal
- **Recoil damages user:** totalDamage=90, [1,3] → user loses 30 HP
- **Recoil causes faint:** recoil exceeds user HP → faint event
- **Recoil-hp:** fraction=[1,8] of user.maxHp → correct amount
- **Selfdestruct:** user HP→0, faint event emitted
- **Recharge:** user gains `{ name: 'recharge' }` volatile

### Extended: `EffectEngine.test.ts`

- Flinch volatile blocks move, emits move-blocked, volatile removed
- Recharge volatile blocks move, emits move-blocked, volatile removed

### Extended: `BattleEngine.test.ts`

- **Multi-hit:** Bullet Seed (via injectable rng controlling hit count) → correct hit count, N damage-dealt events, totalDamage accumulated
- **Multi-hit distribution:** 400 trials, hit counts ≈ 3/8, 3/8, 1/8, 1/8 (±10% tolerance)
- **Multi-hit stops on faint:** target faints at hit 2 → no further damage-dealt events
- **Charge T1:** Solar Beam → no damage-dealt, chargeVolatile on user
- **Charge T2:** Solar Beam with chargeVolatile already set → damage-dealt, no chargeVolatile
- **Solar Beam in sun:** No chargeVolatile on T1, damage dealt immediately
- **OHKO misses:** level 50 attacker vs level 60 defender → always miss (forced by level check)
- **OHKO hits:** level 50 vs level 40, rng=0 → target HP=0, faint
- **Crunch integration:** Full `resolveTurn` with crunch, rng=0 → target def drops 1 stage

---

## Constraints and Non-Goals

- `evaluateSecondaryEffect` and `evaluateVolatileEffect` are kept intact — backward compat for 16 existing moves.
- Ability interactions (Serene Grace, Sheer Force, King's Rock, Skill Link, Rock Head, Big Root) are flagged but deferred to doc 08.
- Fly/Bounce/Dig/Dive invulnerability during charge turn (what moves can still hit) is deferred to doc 08.
- Healing Wish / Lunar Dance "restore next ally on switch-in" is deferred to doc 07.
- Memento's stat-drop secondary fires but the user-faint + forced-switch interaction detail is doc 07.
- Multi-hit: Poison Jab's poison secondary fires after the last hit only (not per-hit), except drain which uses totalDamage.

---

## Success Criteria (matching feature doc)

- Crunch drops target Defense 1 stage with 20% probability in unit tests.
- Bullet Seed deals 2–5 hits; over 400 trials, distribution ≈ 3/8, 3/8, 1/8, 1/8.
- Giga Drain heals attacker for 50% of damage dealt.
- Double-Edge deals recoil equal to 1/3 of damage dealt.
- Hyper Beam leaves user with `recharge` volatile after firing.
- Solar Beam in sun skips the charge turn.
- OHKO move from level-50 attacker vs level-60 defender always misses.
- Flinch prevents a slower target from moving the same turn.
