# Effect Engine Design

**Date:** 2026-08-27  
**Status:** Approved

## Problem

Status effects and volatile effects are handled inconsistently across `BattleEngine`:

- Sleep and freeze always block the move on the wake-up/thaw turn — the pokemon never gets to act even when its counter expires that turn (wrong per Gen 5+ mechanics).
- `tickStatus` computes `fullParalysis` in end-of-turn but the result is unused — dead code.
- Volatile effects (confusion, leech seed, bind/wrap, yawn) have no infrastructure.
- `move-used` is overloaded for both "move happened" and "move was blocked" — ambiguous for the client.

## Solution

Extract a dedicated `EffectEngine` class that owns all status and volatile effect logic. `BattleEngine` delegates to it at two well-defined points per turn: before a pokemon executes its move (pre-move) and at the end of the turn (end-of-turn).

## Scope

### In scope

- `EffectEngine` class with `runPreMove` and `runEndOfTurn` methods
- Pre-move gates: sleep (with correct wake-up-and-act), freeze (thaw-and-act), paralysis, confusion self-hit
- EOT effects: burn, poison, toxic (with counter), leech seed, bind/wrap (with counter and expiry), yawn (countdown → sleep)
- New event types: `move-blocked`, `volatile-cured`
- `VolatileStatusEntry.sourceSlotId` field for leech seed and bind/wrap
- Move dispatch for: yawn, confuse ray, supersonic, sweet kiss, leech seed, bind, wrap
- Delete dead `tickStatus` function

### Out of scope (future)

- Bind/wrap trapping (cannot switch while bound) — requires action-validation changes
- Sleep Talk / Snore (moves usable while asleep)
- More trapping moves beyond bind/wrap/clamp/fire spin/whirlpool
- Full volatile effect list (encore, taunt, torment, embargo, heal block, etc.)

See `docs/superpowers/plans/future-volatile-effects.md` for deferred items.

## Shared type changes

### `VolatileStatusEntry` (`packages/shared/src/types/battle.ts`)

```typescript
export interface VolatileStatusEntry {
  name: string;
  counter?: number;
  sourceSlotId?: string;  // leech seed donor slot, bind/wrap attacker slot
}
```

### `TurnResolveEvent.type` (`packages/shared/src/types/events.ts`)

Add two new values to the union:

- `'move-blocked'` — emitted when a status or volatile prevents the move (sleep, freeze, paralysis, confusion self-hit). Distinct from `'move-used'` so the client can render these differently.
- `'volatile-cured'` — emitted when a volatile expires by running out of turns (confusion, bound).

`data` shape for `move-blocked`: `{ slotId, pokemonName, reason: 'asleep' | 'frozen' | 'paralysis' | 'confusion' }`  
`data` shape for `volatile-cured`: `{ slotId, volatile: string }`

## EffectEngine class

**File:** `packages/server/src/engine/EffectEngine.ts`

```typescript
export interface SlotContext {
  member: PartyMember;
  slotId: string;
  teamIndex: number;
}

export interface PreMoveResult {
  blocked: boolean;
  events: TurnResolveEvent[];
}

export interface EndOfTurnResult {
  events: TurnResolveEvent[];
}

export class EffectEngine {
  runPreMove(pokemon, slotId, state, allSlots): PreMoveResult
  runEndOfTurn(pokemon, slotId, state, allSlots): EndOfTurnResult
}
```

### Pre-move phase

Runs before a pokemon executes its chosen move. Status conditions are checked first; if they block the move, volatile entries are not evaluated (a sleeping pokemon doesn't roll confusion).

**Sleep** — counter-first pattern:
- `counter == 0`: remove volatile entry, delete `pokemon.status`, emit `status-cured: slp`, return `blocked: false` — pokemon wakes up and acts this turn.
- `counter > 0`: emit `move-blocked` (reason: `asleep`), decrement counter, return `blocked: true`.

Sleep duration is set at application time (1–3 turns). With counter=1: pokemon is blocked for 1 turn, then wakes and acts on the following turn.

**Freeze:**
- Roll 20% thaw chance (`FREEZE_THAW_CHANCE`).
- Thawed: delete `pokemon.status`, emit `status-cured: frz`, return `blocked: false`.
- Still frozen: emit `move-blocked` (reason: `frozen`), return `blocked: true`.

**Paralysis:**
- Roll 25% full-paralysis chance (`PARALYSIS_FULL_PARALYSIS_CHANCE`).
- Triggered: emit `move-blocked` (reason: `paralysis`), return `blocked: true`.
- Passes: return `blocked: false`. (Speed halving for turn order is already handled in `buildActionOrder`.)

**Confusion:**
- Find `confusion` volatile entry.
- `counter == 0`: remove entry, emit `volatile-cured: confusion`, return `blocked: false`.
- `counter > 0`: decrement counter. Roll 33% self-hit (`CONFUSION_HURT_CHANCE`).
  - Self-hit: calculate typeless damage (base power 40, attacker's Atk vs own Def, with stat boosts, no STAB, effectiveness = 1, random factor applied) using `calcDamage`. Emit `damage-dealt`. Return `blocked: true`.
  - No self-hit: return `blocked: false`. No event emitted — client derives confused state from `volatileStatus`.

### End-of-turn phase

Runs per active non-fainted pokemon after all actions resolve. Mutates the pokemon in place (already a clone). Ordering within a single pokemon: status damage first, then volatile effects.

**Burn:** `damage = Math.max(1, floor(maxHp / 16))`. Emit `damage-dealt` (`source: 'status'`). Set fainted if HP reaches 0.

**Poison:** `damage = Math.max(1, floor(maxHp / 8))`. Same as burn.

**Toxic:** Find or create `toxic` volatile entry. Increment counter (starts at 1 on first EOT). `damage = Math.max(1, floor(maxHp * counter / 16))`. Emit `damage-dealt`. Set fainted if HP reaches 0.

**Leech Seed:**
- Find `leech-seed` volatile entry (has `sourceSlotId`).
- `drain = Math.max(1, floor(maxHp / 8))`. Apply to seeded pokemon. Emit `damage-dealt` (`source: 'leech-seed'`). Set fainted if HP reaches 0.
- Find source slot in `allSlots` by `sourceSlotId`. If source active pokemon exists and is not fainted: `heal = min(drain, maxHp - currentHp)`. Apply heal. Emit `heal` if heal > 0.
- If source slot is gone or fainted: damage still applies, no heal.

**Bind/Wrap:**
- Find `bound` volatile entry.
- `damage = Math.max(1, floor(maxHp / 8))`. Apply to bound pokemon. Emit `damage-dealt` (`source: 'bound'`). Set fainted if HP reaches 0.
- Decrement counter. If `counter <= 0`: remove entry, emit `volatile-cured: bound`.

**Yawn:**
- Find `yawn` volatile entry. Decrement counter.
- If `counter <= 0`: remove entry. Call `canApplyStatus` — if sleep can be applied, call `applyStatus` (sets sleep counter 1–3, emits `status-applied: slp`). If target already has a status or is immune, yawn silently disappears.

## Move dispatch changes

### `StatusMoveResult` (`packages/server/src/engine/moves.ts`)

```typescript
export interface StatusMoveResult {
  statusToApply?: string;
  volatileToApply?: string;   // 'confusion' | 'yawn' | 'leech-seed'
  volatileCounter?: number;   // explicit counter; absent = pick randomly
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
  targetsSelf?: boolean;
}
```

New entries in `executeStatusMove`:

```
'yawn'       → { volatileToApply: 'yawn', volatileCounter: 2, targetsSelf: false }
'confuseray' → { volatileToApply: 'confusion', targetsSelf: false }
'supersonic' → { volatileToApply: 'confusion', targetsSelf: false }
'sweetkiss'  → { volatileToApply: 'confusion', targetsSelf: false }
'leechseed'  → { volatileToApply: 'leech-seed', targetsSelf: false }
```

### `applyVolatile` (`packages/server/src/engine/effects.ts`)

New function:

```typescript
function applyVolatile(
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
  volatile: string,
  explicitCounter?: number,
): TurnResolveEvent | null
```

- Returns `null` if the target already has that volatile (e.g. already seeded, already confused).
- Picks counter randomly if not explicit: confusion = `floor(random() * 4) + 2` (2–5), bound = 4 or 5.
- Sets `sourceSlotId` on the entry for leech seed and bound.
- Returns `volatile-applied` event.

### Bind/Wrap as damaging moves

Bind and wrap deal damage then apply the volatile. A `BOUND_MOVES` set in `effects.ts` covers: `bind`, `wrap`, `clamp`, `firespin`, `whirlpool`.

New function:

```typescript
function evaluateVolatileEffect(
  moveId: string,
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
): TurnResolveEvent | null
```

Called after damage in `BattleEngine.executeMove`, analogous to `evaluateSecondaryEffect`. If `moveId` is in `BOUND_MOVES` and target is alive and not already bound, applies the `bound` volatile and returns a `volatile-applied` event.

### `BattleEngine.executeMove` volatile dispatch

After the `statusToApply` branch in the status-move handler, add a parallel `volatileToApply` branch that calls `applyVolatile` with the attacker slot as `sourceSlotId` for leech seed (attacker plants it, seeded target drains to them).

## BattleEngine integration

**New field:** `private readonly effectEngine = new EffectEngine()`

**`executeMove`:** Delete lines 121–132 (sleep/paralysis/freeze inline checks). Replace with:

```typescript
const preMoveResult = this.effectEngine.runPreMove(attacker, attackerSlotId, s, this.getAllSlots(s));
events.push(...preMoveResult.events);
if (preMoveResult.blocked) return { newState: s, events };
```

**`endOfTurn`:** Delete the status-tick block (roughly lines 383–418). Replace with:

```typescript
const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
events.push(...eotResult.events);
```

Weather countdown and item hooks remain unchanged.

**New private helper:**

```typescript
private getAllSlots(state: BattleState): SlotContext[] {
  return state.teams.flatMap((team, teamIndex) =>
    team.slots.map(slot => ({
      member: slot.party[slot.activePokemonIndex]!,
      slotId: slot.slotId,
      teamIndex,
    }))
  );
}
```

**Faint after EOT effects:** `EffectEngine.runEndOfTurn` sets `pokemon.fainted = true` and emits `faint` directly, consistent with how `executeMove` handles faint today. The outer loop in `endOfTurn` does not re-check.

## Cleanup

`tickStatus` in `status.ts` becomes dead code and is deleted. The raw math helpers (`getBurnDamage`, `getPoisonDamage`, `getToxicDamage`) and constants (`PARALYSIS_SPEED_MOD`, `PARALYSIS_FULL_PARALYSIS_CHANCE`, `FREEZE_THAW_CHANCE`, `CONFUSION_HURT_CHANCE`) remain — `EffectEngine` uses them directly.

## Testing

**`EffectEngine.test.ts`** — unit tests against a single `makePokemon` + minimal `SlotContext[]`. No full `BattleState` needed for most cases.

Pre-move:
- Sleep counter > 0: blocked, counter decremented, `move-blocked` emitted
- Sleep counter == 0: not blocked, status cleared, `status-cured` emitted
- Freeze: mock random to force thaw / stay frozen
- Paralysis: mock random for triggered / passing
- Confusion self-hit: damage emitted, blocked
- Confusion no self-hit: not blocked, no event
- Confusion counter == 0: not blocked, `volatile-cured` emitted
- Sleep short-circuits confusion

EOT:
- Burn/poison: correct damage amounts
- Toxic counter increments each call
- Leech seed: seeded takes damage, source healed; source fainted = no heal
- Bind: damage emitted, counter decremented; counter 0 = `volatile-cured`
- Yawn: counter decrements; hits 0, sleep applied; hits 0 with existing status, silently removed

**`BattleEngine.test.ts`** — update existing "sleep prevents moving" test plus:
- Sleeping pokemon with counter 0 wakes up and deals damage
- Bind deals EOT damage; expires after N turns
- Leech seed heals the user
