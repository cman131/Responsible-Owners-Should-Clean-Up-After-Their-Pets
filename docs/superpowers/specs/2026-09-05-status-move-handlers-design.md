# Design: Missing Status Move Handlers

**Date:** 2026-09-05  
**Scope:** Implement 68 unregistered status move handlers in the battle engine  
**Context:** Audit revealed 68 status moves in `data/moves.json` have no entry in `MoveEffectRegistry`, causing them to fail with "unimplemented" when used in battle.

---

## Architecture

The battle system dispatches status moves through `MoveEffectRegistry` (looked up by `move.effectId`). Handlers receive a `MoveContext` and return `MoveEffectOutput` containing `events` and optional `pivotSwitch`/`forceSwitch`.

Existing infrastructure:
- `effectFactories.ts` — reusable factory functions (`statModSelf`, `statModTarget`, `multiStatModSelf`, `multiStatModTarget`, `applyStatusTarget`, `applyVolatileTarget`, etc.)
- `effects.ts` — `applyStatBoost`, `applyVolatile`, `applyStatus`
- `registrations.ts` — `buildDefaultRegistry()` with ~203 existing handler registrations

This design adds **four independent implementation tasks** that can be executed in parallel (with one sequencing constraint: Task 3 type changes must land before Task 4 handlers that read new field state).

---

## Task 1: Trivial One-Liners (registrations.ts only, no tests)

All of these are single-line registrations using existing factory functions. No new types, no new engine wiring.

| Move | effectId | Handler |
|------|----------|---------|
| Tail Whip | `tailwhip` | `statModTarget('def', -1)` |
| Sing | `sing` | `applyStatusTarget('slp')` |
| Grass Whistle | `grasswhistle` | `applyStatusTarget('slp')` |
| Lovely Kiss | `lovelykiss` | `applyStatusTarget('slp')` |
| Poison Gas | `poisongas` | `applyStatusTarget('psn')` |
| Poison Powder | `poisonpowder` | `applyStatusTarget('psn')` |
| Metal Sound | `metalsound` | `statModTarget('spd', -2)` |
| Hone Claws | `honeclaws` | `multiStatModSelf({ atk: 1, accuracy: 1 })` |
| Shelter | `shelter` | `statModSelf('def', 2)` |
| Decorate | `decorate` | `multiStatModTarget({ atk: 2, spa: 2 })` |
| Extreme Evoboost | `extremeevoboost` | `multiStatModSelf({ atk: 2, def: 2, spa: 2, spd: 2, spe: 2 })` |
| Teeter Dance | `teeterdance` | `applyVolatileTarget('confusion')` |
| Celebrate | `celebrate` | `custom(() => ({ events: [] }))` |
| Splash | `splash` | `custom(() => ({ events: [] }))` |
| Happy Hour | `happyhour` | `custom(() => ({ events: [] }))` |
| Hold Hands | `holdhands` | `custom(() => ({ events: [] }))` |
| Magic Powder | `magicpowder` | custom: `target.typeOverride = ['Psychic']` |
| Coaching | `coaching` | `multiStatModTarget({ atk: 1, def: 1 })` (ally target) |
| Dragon Cheer | `dragoncheer` | `applyVolatileTarget('dragon-cheer')` |
| Aromatic Mist | `aromaticmist` | `statModTarget('spd', 1)` (ally target) |
| Max Guard | `maxguard` | `protect('maxguard')` |

---

## Task 2: Stat-Swap & Split Moves

**Files modified:** `registrations.ts`  
**Tests:** new `__tests__/statSwap.test.ts`

### Stat Stage Swaps

Swap `statBoosts` fields between user and target. Emit `stat-change` for each participant showing the net delta applied.

- `guardswap` → swap `def` and `spd` boost fields between user and target
- `powerswap` → swap `atk` and `spa` boost fields
- `heartswap` → swap all 7 boost fields (`atk`, `def`, `spa`, `spd`, `spe`, `accuracy`, `evasion`)
- `speedswap` → swap `spe` boost field

Pattern for each:
```
const userOld = { ...relevantBoosts(ctx.user.statBoosts) };
const targetOld = { ...relevantBoosts(target.statBoosts) };
assign targetOld → ctx.user.statBoosts;
assign userOld → target.statBoosts;
emit stat-change events for user (delta = target's old - user's old) and target (inverse)
```

### Stat Base Value Averaging (Split)

Average the raw `stats` values (not boosts) and assign back to both.

- `guardsplit` → `newDef = floor((user.stats.def + target.stats.def) / 2)`, assign to both; same for `spd`
- `powersplit` → same for `atk` and `spa`

Events: emit `stat-change` for user and target showing the effective change. Use `move-note` event type `'stats-split'` if stat-change doesn't cleanly express this.

### Stat Value Swap (Self Only)

- `powertrick` → swap `user.stats.atk` ↔ `user.stats.def`. Track with volatile `power-trick` (toggle: if already active, remove volatile and re-swap back).
- `powershift` → same mechanic as powertrick but permanent per activation (no toggle volatile — apply once, just emit `volatile-applied` with name `power-shift`).

### Haze

Clear all stat boost fields for every active Pokémon on the field (both sides).

```
for each team → for each slot → get active member:
  if any boost is non-zero:
    reset all boosts to 0
    emit stat-change event showing all-zero result
```

No Mist protection (Haze bypasses Mist). Haze is fully implemented in Task 2 — not Task 4.

### Tests (statSwap.test.ts)

- guardswap swaps def/spd stages correctly
- powerswap swaps atk/spa stages correctly  
- heartswap swaps all 7 fields
- guardsplit with equal stats (no change), unequal stats (correct average)
- powertrick toggles — second use swaps back
- haze resets both sides; haze when all stats are zero (no event)

---

## Task 3: Field-State Moves

**Files modified:** `packages/shared/src/types/battle.ts`, `BattleEngine.ts`, `registrations.ts`  
**Tests:** extend `__tests__/fieldState.test.ts`

### New FieldState Fields

Add to `FieldState` in `battle.ts`:

```typescript
interface FieldState {
  // existing fields ...
  wonderroom: number;    // turns remaining (0 = inactive); swaps Def/SpD in damage calc
  magicroom: number;     // turns remaining (0 = inactive); suppresses held items
  mudSport: number;      // turns remaining; Electric moves do 0.5× damage
  waterSport: number;    // turns remaining; Fire moves do 0.5× damage
  ionDeluge: boolean;    // cleared at start of next turn; Normal-type moves become Electric
  fairyLock: number;     // turns remaining; prevents switching (all Pokemon trapped)
}
```

Initialize all counters to `0` and `ionDeluge` to `false` in `BattleEngine` initial state construction.

### Move Handlers

Toggle pattern (like `trickroom`):
- `wonderroom` → if `field.wonderroom > 0`: set to 0, emit `wonderroom-ended`; else: set to 5, emit `wonderroom-started`
- `magicroom` → same with `field.magicroom`

Set-only (fail if already active):
- `mudsport` → fail with `already-active` if `field.mudSport > 0`; else set to 5, emit event
- `watersport` → same with `field.waterSport`

Immediate single-turn:
- `iondeluge` → set `field.ionDeluge = true`, emit `move-note` with note `'ion-deluge'`

Trapping field:
- `fairylock` → set `field.fairyLock = 2` (active next turn after decrement), emit `fairy-lock-started`

### Engine Wiring

**Wonder Room** (`damage.ts` or `BattleEngine` damage step):
- When `field.wonderroom > 0`, swap the Def and SpD stats used in damage calculation for the defending Pokémon.

**Magic Room** (`items.ts` / `getItemHooks`):
- When `field.magicroom > 0`, `getItemHooks` returns no-op hooks for all items (treats held item as absent).

**Mud Sport / Water Sport** (damage multiplier step):
- When `field.mudSport > 0` and move type is Electric: apply 0.5× damage multiplier.
- When `field.waterSport > 0` and move type is Fire: apply 0.5× damage multiplier.

**Ion Deluge** (type resolution step, before effectiveness calculation):
- When `field.ionDeluge` and move type is `'Normal'`: treat move type as `'Electric'` for this calculation.

**Fairy Lock** (switch validation):
- When `field.fairyLock > 0`: block voluntary switches and pivot moves (treat all slots as trapped).

**End-of-Turn Decrements** (wherever trickroom/gravity are decremented):
- Decrement `wonderroom`, `magicroom`, `mudSport`, `waterSport`, `fairyLock` each end-of-turn.
- Clear `ionDeluge` at start of each new turn (or end of the turn it was set).

### Tests

- Wonder room halves (or doubles) expected damage by swapping Def/SpD
- Magic room suppresses item that would normally trigger
- Mud sport halves Electric damage; does not affect other types
- Water sport halves Fire damage
- Ion Deluge makes a Normal move hit an Electric-immune target (or Electric-boosted terrain)
- Fairy lock blocks switch action

---

## Task 4: Complex Behavioral Moves

**Files modified:** `registrations.ts`, `BattleEngine.ts` (for accuracy/turn-order hooks)  
**Tests:** new `__tests__/statusEffectCombos.test.ts`, extensions to `miscVolatiles.test.ts`, `teamSupport.test.ts`, `fieldState.test.ts`

### Status + Effect Combos

**Swagger** (`swagger`):
1. Check Mist/Safeguard on target's side (fail if active).
2. Apply `applyStatBoost(target, { atk: +2 })`.
3. Apply `applyVolatile(target, 'confusion')`.

**Flatter** (`flatter`):
Same as swagger: `{ spa: +1 }` boost + confusion volatile.

**Toxic Thread** (`toxicthread`):
1. `applyStatus(target, 'psn')` with Safeguard check.
2. `applyStatBoost(target, { spe: -1 })`.

### Volatile-Based

**Lock-On / Mind Reader** (`lockon`, `mindreader`):
- Apply volatile `lock-on` with `turnsRemaining: 2` and `sourceSlotId: ctx.userSlotId` to target.
- BattleEngine accuracy check: if target has `lock-on` volatile sourced from the attacker's slot, bypass accuracy/evasion checks entirely.

**Telekinesis** (`telekinesis`):
- Apply volatile `telekinesis` with `turnsRemaining: 3` to target.
- BattleEngine: when target has `telekinesis`, all moves against it have perfect accuracy (except OHKO moves); target is immune to Ground moves.
- `telekinesis` blocks `ingrain` (if already ingrained, fail).

**Charge** (`charge`):
- Apply volatile `charge` to self.
- Next time user uses an Electric-type move, double the base power (clear volatile after use).
- Also apply `+1 SpD` to user on this turn.

### Utility Moves

**Memento** (`memento`):
1. Check Mist/Safeguard on foe side.
2. Attempt `-2 atk, -2 spa` on target; if both fail (stats already at -6), move fails.
3. If stat drop succeeds: user's HP → 0, user faints. Event: `faint`.

**Revival Blessing** (`revivalblessing`):
1. Find a fainted party member on user's team (non-active slot, `fainted === true`).
2. Fail with `no-fainted-ally` if none found.
3. Restore chosen member to `Math.floor(maxHp / 2)` HP, clear `fainted`, clear `status`.
4. Events: `heal` on the revived member.

**Stuff Cheeks** (`stuffcheeks`):
1. Fail if user has no held item or held item is not a berry (berry IDs follow pattern — check `DataLoader` or a berry set).
2. Consume the berry: `lastConsumedItem = heldItem; delete heldItem`. Event: `item-consumed`.
3. Apply `+2 def`. Event: `stat-change`.

**Corrosive Gas** (`corrosivegas`):
1. For each target: if target has held item, destroy it (`lastConsumedItem` is NOT set — item is dissolved, not stolen). Event: `item-consumed` with `reason: 'corrosive-gas'`.
2. If target has no item: no effect on that target (move still "succeeds").

### Turn-Manipulation

**Quash** (`quash`):
- Apply volatile `quash` to target. BattleEngine reads this when sorting move execution order: quashed slots move to the end of the turn order (after all non-quashed moves).
- Requires access to pending turn order during move execution. Implementation note: if BattleEngine builds the sorted action list before executing, `quash` needs a post-sort adjustment pass.

**Grudge** (`grudge`):
- Apply volatile `grudge` to user.
- In BattleEngine faint resolution: if the fainting Pokémon has `grudge` volatile, find the move that dealt the final blow (from `lastDamageTaken.fromSlotId`), drain all PP from that move in the attacker's move slot. Event: `move-note`.

### Field/Team Moves

**Rototiller** (`rototiller`):
- For each active Pokémon on the field: if it is a Grass type and is grounded (no Telekinesis, Magnet Rise, Flying type, Levitate) → apply `+1 atk, +1 spa`.
- Fails if no eligible targets. Event: `stat-change` per boosted Pokémon.

**Flower Shield** (`flowershield`):
- Same targeting as Rototiller but only boosts Def +1. No ground check required (aerial Grass-types still get boosted in mainline games).

**Teatime** (`teatime`):
- For each active Pokémon on the field: if it has a held berry, trigger the berry's consume hook immediately (same as end-of-turn berry triggers). Use `getItemHooks(heldItem).onTeatime?.()` or fall back to manually consuming.

**Chilly Reception** (`chillyreception`):
- Set weather to `snow` (5 turns), same as `setWeather('snow', 5)`.
- Then pivot switch (like `teleport` — return `{ events: weatherEvents, pivotSwitch: true }`).

**Powder** (`powder`):
- Apply volatile `powder` to target with `turnsRemaining: 1`.
- BattleEngine: if the target (with `powder` volatile) attempts to use a Fire-type move, cancel the move, deal `Math.floor(target.maxHp / 4)` damage to the target, and clear the volatile. Event: `damage-dealt` with source `'powder'`.

### NvN Support Moves (require NvN targeting to function; registered but no-op when no ally slot)

**Helping Hand** (`helpinghand`):
- Apply volatile `helping-hand` to target ally slot.
- BattleEngine damage calc: if attacker has `helping-hand` volatile, multiply base damage × 1.5 (clear after use).

**Follow Me / Rage Powder / Spotlight** (`followme`, `ragepowder`, `spotlight`):
- Apply volatile `center-of-attention` to the relevant slot (self for Follow Me/Rage Powder, target for Spotlight).
- BattleEngine targeting: when any slot has `center-of-attention`, redirect all opposing moves to that slot (overrides normal targeting).

**Quick Guard** (`quickguard`):
- Apply `quick-guard` volatile to all ally slots (protect family, uses protect-streak).
- BattleEngine: block incoming moves with priority > 0 on slots with this volatile.

**Wide Guard** (`wideguard`):
- Apply `wide-guard` volatile to all ally slots (protect family).
- BattleEngine: block incoming spread moves (target `allAdjacent`, `allAdjacentFoes`) on slots with this volatile.

**Crafty Shield** (`craftyshield`):
- Apply `crafty-shield` volatile to all ally slots (protect family).
- BattleEngine: block incoming status moves on slots with this volatile.

**Mat Block** (`matblock`):
- Apply `mat-block` volatile to all ally slots. Only works on the user's first turn out. Track this with a `fresh-switcher` volatile (set to `turnsRemaining: 1` on switch-in by `BattleEngine.performSwitch`); if user no longer has `fresh-switcher`, fail with `not-first-turn`.
- Block incoming damage moves on protected slots.

**Gear Up / Magnetic Flux** (`gearup`, `magneticflux`):
- For each ally slot with an active Pokémon with ability `plus` or `minus`:
  - `gearup` → `+1 spa, +1 spd`
  - `magneticflux` → `+1 def, +1 spd`
- Fails (no events) if no eligible allies.

**Ally Switch** (`allyswitch`):
- Swap the `activePokemonIndex` (or slot array ordering) between user slot and an adjacent ally slot.
- In NvN with only 1 slot per side: fails with `no-ally`.

---

## Error Handling

All handlers follow existing patterns:
- Missing target: `return { events: [] }`
- Move fails (blocked, wrong conditions): emit `{ type: 'move-failed', data: { moveId, reason } }` with descriptive reason strings
- Stats at cap: `applyStatBoost` already handles ±6 clamping; emits event only if at least one stat actually changes

---

## Testing Strategy

**No tests needed:** Task 1 moves (one-liner factory calls — factory functions are already tested).

**Tests needed for:**
- Task 2: `statSwap.test.ts` — stat stage swaps, guardsplit/powersplit averaging, powertrick toggle, haze
- Task 3: extend `fieldState.test.ts` — wonder room damage swap, magic room item suppression, sport moves, ion deluge type override, fairy lock switch block
- Task 4:
  - `statusEffectCombos.test.ts` — swagger, flatter, toxicthread (normal case + Safeguard blocked)
  - `miscVolatiles.test.ts` — lockon accuracy bypass, telekinesis Ground immunity, charge power doubling
  - `teamSupport.test.ts` — helpinghand multiplier, wideguard blocking, quickguard blocking priority
  - existing files — memento faint + stat drop, revivalblessing restore, stuffcheeks consume berry, quash turn order

---

## Sequencing

```
Task 1 ──────────────────────────────────── (no deps, merge anytime)
Task 2 ──────────────────────────────────── (no deps, merge anytime)
Task 3 (type changes) ──┐
                        └── Task 4 (reads new field state, e.g., ionDeluge in charge/telekinesis N/A; but wonderroom in damage calc)
```

Tasks 1, 2, 3 are fully independent and can run in parallel. Task 4 handlers that reference `field.wonderroom`, `field.magicroom` etc. must wait for Task 3 to merge first. Task 4 handlers that only use volatiles (swagger, memento, revivalblessing, etc.) are independent of Task 3.
