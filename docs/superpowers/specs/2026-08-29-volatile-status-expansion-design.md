# Volatile Status Expansion — Design

**Date:** 2026-08-29
**Source spec:** `docs/upcoming-features/04-volatile-status-expansion.md`
**Split into:** 4.1 · 4.2 · 4.3 · 4.4 · 4.5

---

## Overview

The volatile status system currently handles four effects: confusion, leech-seed, bound, yawn. This design implements 20+ additional volatiles across five independently shippable iterations, grouped by mechanical archetype.

| Iteration | Focus |
|---|---|
| 4.1 | Type extensions + Protect family + Endure + switch-clear foundation |
| 4.2 | Substitute |
| 4.3 | Move-selection locks: Disable, Taunt, Encore, Torment |
| 4.4 | EoT passives: Focus Energy, Aqua Ring, Ingrain, Magnet Rise, Perish Song |
| 4.5 | Type overrides, Roost, Destiny Bond, Embargo, Heal Block |

---

## Shared type changes (land in 4.1, consumed by all)

### `VolatileStatusEntry` (`shared/types/battle.ts`)

```ts
interface VolatileStatusEntry {
  name: string;
  counter?: number;         // general-purpose countdown
  turnsRemaining?: number;  // disable, taunt, magnet-rise, embargo, heal-block
  moveId?: string;          // disable, encore: the locked move id
  variant?: string;         // protect: which protect-family move was used
  hp?: number;              // substitute: proxy HP pool
  sourceSlotId?: string;    // already present
}
```

### `Move` (`shared/types/pokemon.ts`)

```ts
soundMove?: boolean;  // true for Boomburst, Hyper Voice, Bug Buzz, Clangorous Soul, etc.
```

The `soundMove` flag must also be set to `true` in the move JSON data for each qualifying move. This is data work, not just a type change.

### `TurnResolveEvent` (`shared/types/events.ts`)

Add `'endure-survived'` to the type union. `move-failed`, `volatile-applied`, and `volatile-cured` already exist; their `data` shapes already carry `reason`/`volatile`/`slotId` as needed.

### `PartyMember` (`shared/types/battle.ts`)

```ts
lastMoveId?: string;  // set after each successful move execution; cleared on switch-out
```

Needed by 4.3 (Disable, Encore, Torment). Defined in 4.1 so the type is stable for all iterations.

---

## 4.1 — Protect family + Endure + switch-clear foundation

### Charge volatile naming convention

Charge volatile names **must** be prefixed with `'charging-'` (e.g. `'charging-solarbeam'`, `'charging-fly'`). This allows the switch-clear pass to match them with `name.startsWith('charging-')`. If existing data uses bare move IDs as charge volatile names, those must be updated in the move data and the corresponding `BattleEngine` charge check.

### `volatileClearRules.ts` (new file)

Exports `SWITCH_CLEAR_NAMES: Set<string>` and `SWITCH_CLEAR_PREFIXES: string[]`. On switch-out, a volatile is cleared if `SWITCH_CLEAR_NAMES.has(v.name)` OR `SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))`.

**Initial contents after 4.1:**

```ts
export const SWITCH_CLEAR_NAMES = new Set([
  // existing volatiles (not previously cleared on switch — fix in 4.1)
  'confusion', 'leech-seed', 'bound', 'yawn',
  // 4.1 additions
  'protect', 'protect-streak', 'endure', 'flinch', 'recharge',
]);

export const SWITCH_CLEAR_PREFIXES = ['charging-'];
```

Note: `yawn` is not in the spec's formal clear list, but main-series behavior clears it on switch-out. It is included here as a correction to the spec.

Note: `perishsong` is also cleared on switch-out per the spec body ("switching out removes the Perish Song volatile"), despite being absent from the spec's formal clear list. It is added to `SWITCH_CLEAR_NAMES` in 4.4 when the mechanic is implemented.

### `executeSwitch` additions

Before changing `activePokemonIndex`, apply to the outgoing Pokémon:
1. Filter `volatileStatus` against `volatileClearRules`.
2. Reset `statBoosts` to all-zero.
3. Clear `lastMoveId`.

### Protect family

**Factory:** `protect(variant: string): MoveEffectHandler` in `effectFactories.ts`.

On use:
1. Read `protect-streak` volatile (default counter = 0).
2. Compute `successChance = 1 / Math.pow(3, counter)`.
3. Roll `rng()` (use `ctx.battle`'s rng via a passed-in rng, or `Math.random` — must be consistent with the engine's injectable rng for testability).
4. On **failure**: remove `protect-streak`, emit `move-failed` with `reason: 'protect-failed'`. Return.
5. On **success**: upsert `protect-streak` with `counter: n + 1`, push `{ name: 'protect', variant }`.

**Protect check — two enforcement points:**

Protect blocks both damaging moves and status moves targeting a foe.

**Damaging moves** (inside the per-target loop, before damage is applied):

```ts
const protectEntry = target.volatileStatus.find(v => v.name === 'protect');
if (protectEntry) {
  events.push({ type: 'move-blocked', data: { slotId: targetSlotId, reason: 'protect', variant: protectEntry.variant } });
  if (move.makesContact) {
    handleProtectContactSideEffect(protectEntry.variant, attacker, attackerSlotId, events);
  }
  continue;
}
```

**Status moves** (before the registry handler dispatch): after resolving `targetSlotIds` and before calling `handler(ctx)`, filter out any target that has an active `protect` volatile. For each removed target, emit `move-blocked`. If all targets are filtered out, return without dispatching. Self-targeting status moves (target type `'self'`, `'allyTeam'`, etc.) are never filtered — Protect only shields against incoming foe-targeting moves.

**`handleProtectContactSideEffect`** — all eight variants:

| Variant | Contact side effect |
|---|---|
| `protect` | none |
| `detect` | none |
| `kingsshield` | −2 Atk on attacker |
| `spikyshield` | 1/8 max HP damage to attacker |
| `banefulbunker` | Poison attacker |
| `obstruct` | −2 Def on attacker |
| `silktrap` | −1 Spe on attacker |
| `burningbulwark` | Burn attacker |

**Bypass list:** Feint, Shadow Force, Phantom Force skip the protect check AND consume (remove) the `protect` volatile and reset the streak (`protect-streak` removed). No side effects trigger for bypass moves.

**Protect expiry:** The `protect` volatile is cleared in `EffectEngine.runEndOfTurn` after all EoT damage — it is a one-turn block only. `protect-streak` survives across turns (reset only on failure or non-protect-family move use).

**Protect-streak reset on non-protect move:** In the protect factory, if the user does NOT use a protect-family move (the factory is not called), the streak must still be reset. The simplest approach: at the start of `executeMove`, before the registry dispatch for status moves, record whether the move being used is in the protect family. After successful move resolution, if it was NOT a protect-family move, clear `protect-streak`. Define a `PROTECT_FAMILY_MOVES` set for this check.

### Endure

Registered separately from the protect factory. Handler: same streak mechanic; on success, pushes `{ name: 'endure' }`.

In the damage application block in `executeMove`, after computing `actualDamage`:

```ts
if (target.currentHp - actualDamage <= 0 && target.volatileStatus.some(v => v.name === 'endure')) {
  actualDamage = target.currentHp - 1;
  events.push({ type: 'endure-survived', data: { slotId: targetSlotId } });
}
```

Indirect damage (EoT status, leech seed, hazards) does NOT trigger Endure — these code paths run separately and are not modified.

### Imprison

Registered in 4.1 with:

```ts
r.register('imprison', custom(() => ({
  events: [{ type: 'move-failed', data: { moveId: 'imprison', reason: 'unimplemented' } }],
})));
```

This satisfies the spec's non-goal ("mark as `unimplemented-move` per doc 01").

### Files touched (4.1)

- `shared/types/battle.ts` — `VolatileStatusEntry` extensions, `lastMoveId` on `PartyMember`
- `shared/types/pokemon.ts` — `soundMove` on `Move`
- `shared/types/events.ts` — `endure-survived` event type
- `engine/volatileClearRules.ts` — new file
- `engine/effectFactories.ts` — `protect(variant)` factory
- `engine/registrations.ts` — all 8 protect-family moves, Endure, Imprison
- `engine/BattleEngine.ts` — protect check + contact side effects + bypass list + Endure clamp + `protect-streak` reset on non-protect move + `executeSwitch` volatile/stat/lastMoveId clear
- `engine/EffectEngine.ts` — clear `protect` at EoT

### Tests (4.1)

- Protect blocks a damaging move; EoT leech-seed drain still hits
- King's Shield: contact move triggers −2 Atk on attacker; non-contact does not
- Obstruct: contact triggers −2 Def; Silk Trap: contact triggers −1 Spe
- Baneful Bunker poisons contact attacker; Burning Bulwark burns contact attacker
- Feint removes the protect volatile and the move connects
- Shadow Force bypasses protect without triggering side effects
- Consecutive Protect: second use ~33% (seeded rng test); failure resets streak
- Non-protect move clears `protect-streak`
- Endure: lethal hit leaves user at 1 HP; subsequent EoT poison can still faint
- Switch-out clears confusion, leech-seed, bound, protect, endure, flinch; resets statBoosts and lastMoveId

---

## 4.2 — Substitute

### Application

Handler in `effectFactories.ts`. On use:
- If `user.currentHp <= Math.floor(user.maxHp / 4)`: emit `move-failed` with `reason: 'too-weak-for-sub'`.
- Otherwise: deduct `cost = Math.floor(user.maxHp / 4)` from user (emit `damage-dealt` with `source: 'substitute'`); if user reaches 0 HP, faint and return; push `{ name: 'substitute', hp: cost }`.

### Damage interception

At the top of each hit iteration in the `executeMove` hit loop:

```ts
const subEntry = target.volatileStatus.find(v => v.name === 'substitute');
if (subEntry && !move.soundMove) {
  const subDamage = Math.min(finalDamage, subEntry.hp!);
  subEntry.hp! -= subDamage;
  totalDamage += subDamage;
  events.push({ type: 'damage-dealt', data: { source: 'substitute', targetSlotId, damage: subDamage, remainingHp: subEntry.hp } });
  if (subEntry.hp! <= 0) {
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'substitute');
    events.push({ type: 'volatile-cured', data: { slotId: targetSlotId, volatile: 'substitute' } });
  }
  continue;
}
```

Multi-hit moves: if the substitute breaks on hit N, hits N+1 onward find no sub entry and hit the real Pokémon. This resolves open question 1 from the spec — Gen 5+ behavior is confirmed.

Sound moves (`move.soundMove === true`) skip the sub check entirely and hit the real Pokémon.

Crits and effectiveness messages still emit through Substitute (the main series shows them).

### Status and volatile application through Substitute

In `applyVolatile` (and `applyStatus` for direct status-move paths), add a guard:

```ts
if (target.volatileStatus.some(v => v.name === 'substitute')) return null;
```

This blocks leech-seed, confusion, and all other volatiles applied via move effect handlers. Sound moves bypass Substitute entirely upstream (before reaching `applyVolatile`), so the guard does not need a sound-move exception at this level. Own-team moves (Aromatherapy, Heal Bell) already target the user's own team and never cross into the opponent's Substitute check.

### Secondaries gate

In `applySecondaries` in `BattleEngine.executeMove`, the existing `!target.fainted` guard is joined by `!target.volatileStatus.some(v => v.name === 'substitute')`. Status, confusion, and flinch secondaries do not apply through Substitute.

### Substitute on switch

Substitute is NOT in `SWITCH_CLEAR_NAMES`. It persists on the Pokémon. Baton Pass transfer is deferred.

### Files touched (4.2)

- `engine/effectFactories.ts` — `substitute()` factory
- `engine/registrations.ts` — register `substitute`
- `engine/BattleEngine.ts` — hit-loop sub intercept, sound-move bypass, secondary gate
- `engine/effects.ts` — sub guard in `applyVolatile` and `applyStatus`
- move data — `soundMove: true` on Boomburst, Hyper Voice, Bug Buzz, Clangorous Soul, and other sound moves

### Tests (4.2)

- Sub absorbs exactly `floor(maxHp/4)` total damage before breaking; next hit hits real HP
- Multi-hit: sub breaks on hit 2, hits 3–N hit real Pokémon in the same move
- Status move (Will-O-Wisp) fails against sub; sound move (Boomburst) connects
- Confusion secondary not applied through sub
- EoT leech-seed drain still damages (and heals source) through sub — sub only blocks incoming moves
- Using Substitute at exactly 25% HP (≤ threshold) fails
- Substitute does not clear on switch; persists on the Pokémon

---

## 4.3 — Move-selection locks (Disable, Taunt, Encore, Torment)

### `lastMoveId` tracking

In `executeMove`, after PP is spent and the move is confirmed to execute (not blocked in runPreMove, not missed), set `attacker.lastMoveId = moveSlot.moveId`. Set this before returning. `lastMoveId` is cleared on switch-out (already handled in the 4.1 `executeSwitch` step).

### Disable (FR-10 to FR-12)

**Application:** Registry handler checks `ctx.targets[0].lastMoveId`. If absent, emit `move-failed` with `reason: 'no-move-to-disable'`. Otherwise push `{ name: 'disable', moveId: lastMoveId, turnsRemaining: 4 }`.

**Decrement timing:** Per spec FR-10, `turnsRemaining` decrements **at the start of the disabled Pokémon's turns** — in `EffectEngine.runPreMove`, before the existing flinch/recharge/sleep checks. When `turnsRemaining` reaches 0, remove the entry and emit `volatile-cured`.

**Enforcement in `executeMove`:** After resolving the move slot but before PP spend, check if `attackerSlotId`'s active Pokémon has `disable` and the chosen `moveSlot.moveId` matches `disable.moveId`. If so: emit `move-blocked` with `reason: 'disabled'`, return early. No PP deducted (turn is lost, PP is not spent — main-series behavior).

### Taunt (FR-13)

**Application:** Push `{ name: 'taunt', turnsRemaining: 3 }`.

**Decrement:** EoT in `EffectEngine.runEndOfTurn`. Remove at 0, emit `volatile-cured`.

**Enforcement:** After move resolution in `executeMove`, if attacker has `taunt` and `move.category === 'status'`: emit `move-blocked` with `reason: 'taunted'`, return early. No PP deducted.

### Encore (FR-14)

**Application:** Check `ctx.targets[0].lastMoveId`. If absent, emit `move-failed`. Otherwise push `{ name: 'encore', moveId: lastMoveId, turnsRemaining: 3 }`.

**Decrement:** EoT in `runEndOfTurn`. Also check: if the encored move slot has `currentPp === 0`, remove immediately and emit `volatile-cured` (open question 2 from spec: Encore ends when PP runs out — confirmed).

**Enforcement:** In `executeMove`, if attacker has `encore`, silently replace the submitted `action.moveIndex` with the index of the encored move. If the encored move now has 0 PP (just ran out this very turn), treat Encore as expired — clear the volatile and proceed with the submitted move. No `move-blocked` event; the substitution is silent.

### Torment (FR-15)

**Application:** Push `{ name: 'torment' }`. No counter — persists until switch-out.

**Enforcement:** In `executeMove`, if attacker has `torment` and `moveSlot.moveId === attacker.lastMoveId`: emit `move-blocked` with `reason: 'torment'`, return early. No PP deducted. If the Pokémon has no other move with PP > 0, emit `move-failed` with `reason: 'struggle-not-implemented'` as a placeholder (open question 3 from spec: Struggle is the correct answer, deferred).

### `buildValidMoves` in BattleRoom

Signature becomes `buildValidMoves(slotId: string, active: PartyMember)`. The `disabled` flag is set to `true` if any of:
- `disable` volatile's `moveId` matches this move
- `taunt` is active and move category is `'status'`
- `encore` is active and this move's id does not match `encore.moveId`
- `torment` is active and this move's id matches `active.lastMoveId`

`canSwitch` is already computed per slot — no change needed in 4.3 (Ingrain handles it in 4.4).

### Clear-on-switch additions (4.3)

Add to `SWITCH_CLEAR_NAMES`: `'disable'`, `'taunt'`, `'encore'`, `'torment'`.

### Files touched (4.3)

- `engine/effectFactories.ts` — disable, taunt, encore, torment handlers (or `custom()` in registrations where `lastMoveId` read is needed from `ctx.targets`)
- `engine/registrations.ts` — register disable, taunt, encore, torment
- `engine/BattleEngine.ts` — set `lastMoveId`, enforce Disable/Taunt/Torment in `executeMove`, Encore substitution logic
- `engine/EffectEngine.ts` — Disable decrement in `runPreMove`; Taunt/Encore decrements and PP-expiry check in `runEndOfTurn`
- `engine/volatileClearRules.ts` — add to `SWITCH_CLEAR_NAMES`
- `socket/BattleRoom.ts` — `buildValidMoves` passes active member, evaluates `disabled` flag

### Tests (4.3)

- Disable: blocks the last-used move for 4 turns (counter decrements in runPreMove); `disabled: true` in validMoves; no PP spent on blocked turn; expires cleanly
- Disable fails when target has not moved yet
- Taunt: blocks status moves for 3 turns; PP not spent; expires; physical/special moves unaffected
- Encore: forces the encored move for 3 turns; submitted move index is silently replaced; expires if encored move hits 0 PP
- Torment: blocks consecutive use; second use of same move emits move-blocked; different move is allowed

---

## 4.4 — EoT passive volatiles + Perish Song

### Focus Energy (FR-16)

`computeCritStage` in `accuracy.ts` already checks for `'focusenergy'` (no hyphen). 4.4 just registers the move:

```ts
r.register('focusenergy', applyVolatileSelf('focusenergy'));
```

Canonical volatile name is `'focusenergy'` (no hyphen) everywhere. The spec's clear list entry `focus-energy` is a typo in the spec — the implementation uses `'focusenergy'`.

Add `'focusenergy'` to `SWITCH_CLEAR_NAMES` in 4.4.

### Aqua Ring (FR-17)

`applyVolatileSelf('aquaring')`. No tick — persists until switch-out.

EoT in `runEndOfTurn`: heal `Math.floor(pokemon.maxHp / 16)` clamped to available headroom, emit `heal`. Big Root doubling is deferred to doc 08.

Add `'aquaring'` to `SWITCH_CLEAR_NAMES`.

### Ingrain (FR-18)

`applyVolatileSelf('ingrain')`.

EoT heal: same as Aqua Ring.

**Switching prevention:** In `BattleRoom`, `canSwitch` is set to `false` if the active Pokémon has `ingrain`. In `executeSwitch`, if the switching-out Pokémon has `ingrain`, return early with no events. Phazing move enforcement (Roar, Whirlwind failing) is deferred — those moves are not yet implemented.

**Grounding:** Ingrain grounds the Pokémon (removes Flying-type immunity to Ground). Introduce helper `isGrounded(pokemon, field): boolean` — returns `true` if: has `ingrain`, OR `field.gravity > 0`, OR does NOT have `magnetrise` volatile. In `executeMove`, before calling `getCombinedEffectiveness`, if the move type is Ground and `!isGrounded(target, s.field)`, skip (immunity, emit no-effect). If the move type is Ground and `isGrounded(target, s.field)` overrides a normally immune Flying type, strip Flying from `defTypes` before the effectiveness call.

`ingrain` is NOT added to `SWITCH_CLEAR_NAMES` (the Pokémon can't switch while Ingrained).

### Magnet Rise (FR-19)

Push `{ name: 'magnetrise', turnsRemaining: 5 }`.

EoT: decrement, remove at 0, emit `volatile-cured`.

Effect: `isGrounded()` returns `false` when `magnetrise` is active, granting Ground immunity. Uses the same `isGrounded` helper from Ingrain.

Add `'magnetrise'` to `SWITCH_CLEAR_NAMES`.

### Perish Song (FR-20)

Registry handler iterates `ctx.battle.teams`, applies `{ name: 'perishsong', counter: 3 }` to every non-fainted active Pokémon that does not already have it. Emits `volatile-applied` per target.

EoT in `runEndOfTurn`: find `perishsong`, decrement `counter`. If `counter <= 0`: set `pokemon.currentHp = 0`, `pokemon.fainted = true`, emit `damage-dealt` (source `'perish-song'`), emit `faint`. The win-condition check in `BattleEngine` already runs after the full EoT pass — simultaneous double faint is handled there.

Add `'perishsong'` to `SWITCH_CLEAR_NAMES`. (Spec body says switching removes it; the spec's formal clear list omits it — this is a spec error, corrected here.)

### Files touched (4.4)

- `engine/registrations.ts` — register focusenergy, aquaring, ingrain, magnetrise, perishsong
- `engine/EffectEngine.ts` — EoT heals (aquaring, ingrain), magnetrise decrement, perishsong countdown + faint
- `engine/BattleEngine.ts` — `isGrounded()` helper, Ground-immunity + defTypes strip, ingrain switch prevention in `executeSwitch`, `canSwitch` override in BattleRoom call site
- `engine/volatileClearRules.ts` — add focusenergy, aquaring, magnetrise, perishsong
- `socket/BattleRoom.ts` — set `canSwitch: false` when active has ingrain

### Tests (4.4)

- Focus Energy: `computeCritStage` returns +2 (already passes); registration wires correctly
- Aqua Ring heals `floor(maxHp/16)` per turn; stops at full HP; cleared on switch
- Ingrain heals same; Ingrained Pokémon cannot switch (canSwitch: false); executeSwitch rejects it
- Ingrain grounds Flying-type: Ground move connects
- Magnet Rise: Ground move misses for 5 turns; expires turn 5 and Ground connects; cleared on switch
- Perish Song: both active Pokémon faint at end of turn 3; switching Pokémon loses the volatile (does not carry); simultaneous double-faint triggers win-condition correctly

---

## 4.5 — Type overrides, Roost, Destiny Bond, Embargo, Heal Block

### Foresight / Odor Sleuth (FR-21)

`applyVolatileTarget('foresight')`. Applied to the **target**. Persists until target switches out.

Effect in `executeMove` when the target has `foresight`:
1. If attacker's move type is Normal or Fighting and target has Ghost type: strip Ghost from `defTypes` before `getCombinedEffectiveness`.
2. Clamp `defenderEvasionStage` to `Math.min(0, stage)` in the `computeHitChance` call (positive evasion boosts ignored).

Register both `foresight` and `odorsleuth` to the same factory.

Add `'foresight'` to `SWITCH_CLEAR_NAMES`.

### Miracle Eye (FR-22)

`applyVolatileTarget('miracleeye')`. Applied to target.

Effect:
1. If attacker's move type is Psychic and target has Dark type: strip Dark from `defTypes`.
2. Same evasion clamp as Foresight.

Add `'miracleeye'` to `SWITCH_CLEAR_NAMES`.

### Roost (FR-23)

Replace the existing `healPercent(0.5)` registration for `roost` with a `custom` handler that:
1. Heals 50% max HP.
2. Pushes `{ name: 'roost' }` on the user.

Effect in `executeMove`: when resolving `defTypes` for the target, if target has `roost`, remove `'Flying'` from the type list. A pure-Flying Pokémon becomes `['Normal']`.

**Turn-order resolution (resolves open question 4):** Roost is a status move and fires in action order. If Charizard uses Roost (goes first) and the opponent uses an Electric move (goes second), when the Electric move's `executeMove` runs, Charizard already has `roost` volatile — its `defTypes` becomes `['Fire']` and Electric is now normally effective. This is the correct main-series behavior and follows naturally from the existing turn-resolution architecture.

**Expiry:** Roost is cleared at the start of `EffectEngine.runEndOfTurn` — before any EoT effects — so EoT weather/hazard damage sees the restored type. Also add to `SWITCH_CLEAR_NAMES`.

### Destiny Bond (FR-24)

`applyVolatileSelf('destinybond')`.

Effect in `executeMove` hit loop: after `target.fainted = true` is set, check if `target.volatileStatus.some(v => v.name === 'destinybond')`. If so: set `attacker.currentHp = 0`, `attacker.fainted = true`, emit `damage-dealt` with `source: 'destiny-bond'` for the attacker, emit `faint` for the attacker. The attacker reference is already in scope.

Destiny Bond does **not** trigger on indirect damage (EoT poison, leech seed, hazards) — those code paths do not check for it.

**Expiry:** Remove `destinybond` in `EffectEngine.runEndOfTurn` whether or not it triggered.

Add `'destinybond'` to `SWITCH_CLEAR_NAMES`.

### Embargo (FR-25)

Push `{ name: 'embargo', turnsRemaining: 5 }` to the target.

EoT: decrement, remove at 0, emit `volatile-cured`.

Effect: introduce helper `resolveItemHooks(pokemon)` that returns `getItemHooks(pokemon.volatileStatus.some(v => v.name === 'embargo') ? undefined : pokemon.heldItem)`. Replace all `getItemHooks(pokemon.heldItem)` call sites in `BattleEngine` and `EffectEngine` with `resolveItemHooks(pokemon)`.

Add `'embargo'` to `SWITCH_CLEAR_NAMES`.

### Heal Block (FR-26)

Push `{ name: 'healblock', turnsRemaining: 5 }` to the target.

EoT: decrement, remove at 0, emit `volatile-cured`.

Introduce helper `isHealBlocked(pokemon): boolean`.

Gate every HP-increase path:
- `healPercent` factory: if `isHealBlocked(ctx.user)`, emit `move-failed` with `reason: 'heal-blocked'`, return.
- `applySecondaries` drain case: if `isHealBlocked(ctx.user)`, skip the heal portion (drain damage still applies to target).
- `EffectEngine.runEndOfTurn` leech-seed source heal: if `isHealBlocked(sourceCtx.member)`, skip heal.
- `EffectEngine.runEndOfTurn` Aqua Ring / Ingrain heals (4.4): if `isHealBlocked(pokemon)`, skip.
- `BattleEngine.endOfTurn` item `onEndOfTurn` heal: if `isHealBlocked(active)`, skip.

Add `'healblock'` to `SWITCH_CLEAR_NAMES`.

### Files touched (4.5)

- `engine/effectFactories.ts` — `isHealBlocked()`, `resolveItemHooks()` helpers; Roost replacement handler
- `engine/registrations.ts` — register foresight, odorsleuth, miracleeye, roost (replace), destinybond, embargo, healblock
- `engine/BattleEngine.ts` — Foresight/Miracle Eye defTypes strip + evasion clamp, Roost defTypes strip, Destiny Bond faint chain, `resolveItemHooks` at all `getItemHooks` call sites, Heal Block guard on drain and item EoT heal
- `engine/EffectEngine.ts` — Roost clear at start of EoT; Destiny Bond remove at EoT; Embargo/Heal Block EoT decrements; Heal Block guard on leech-seed source heal and Aqua Ring/Ingrain heals
- `engine/volatileClearRules.ts` — add foresight, miracleeye, roost, destinybond, embargo, healblock

### Tests (4.5)

- Foresight: Normal hits Ghost; Fighting hits Ghost; positive evasion boost ignored
- Miracle Eye: Psychic hits Dark; positive evasion boost ignored
- Roost: heals 50%; Electric connects against pure-Flying Charizard on the same turn; next turn Flying immunity restored
- Destiny Bond: faint via direct damage triggers attacker faint; faint via EoT poison does not
- Embargo: Speed item, damage modifier, and EoT heal all suppressed for 5 turns; expires turn 5
- Heal Block: Recover fails; drain move heals nothing (but still damages); Leftovers has no effect; leech-seed source gets no HP; expires turn 5

---

## Resolved open questions

| # | Question | Resolution |
|---|---|---|
| 1 | Multi-hit through Substitute once it breaks? | Yes — sub breaks on hit N, hits N+1+ go through to real HP (Gen 5+ behavior, implemented in 4.2) |
| 2 | Encore + PP=0: Struggle or Encore ends? | Encore ends immediately (4.3) |
| 3 | Torment + only one move available? | Struggle placeholder — emits `move-failed: struggle-not-implemented` (4.3) |
| 4 | Roost type-removal turn-order interaction? | Roost fires first by action order; incoming moves that turn see the modified type; EoT restores before hazard damage (4.5) |
| 5 | Imprison: unimplemented-move or no-op? | Emits `unimplemented-move` per doc 01 non-goals (4.1) |

## Deferred

- Baton Pass (Substitute and stat boost transfer)
- Struggle when no PP available (Torment edge case)
- Phazing moves vs. Ingrain (Roar, Whirlwind not yet implemented)
- Wish healing (not yet implemented)
- Big Root doubling of Aqua Ring / Ingrain heals (doc 08)
- Sleep Talk and Snore
- Grudge, Spite, Lucky Chant
- Imprison full implementation
- Curse (Ghost form)
