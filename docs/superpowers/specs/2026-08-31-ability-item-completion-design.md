# Ability & Item Completion — Design

**Date:** 2026-08-31
**Spec source:** `docs/upcoming-features/08-ability-and-item-completion.md`
**Approach:** B — Infrastructure first, then ability content, then item content

---

## Scope

### In scope
- Wire `onDefenderModifier` hook into `executeMove`
- Wire `onMoveImmunity` hook into `executeMove` (new hook, replaces misuse of `onStatusImmunity` for type immunity)
- Refactor `onStatusImmunity` out of hardcoded `canApplyStatus` and through the hook system
- Expand `onAfterHit` return type to support stat boosts, ability override, direct damage, volatiles
- Add `onSwitchIn` weather-summoning for all seven weather abilities (including primordial)
- Mold Breaker / Turboblaze / Teravolt ability suppression via `ignoresAbilities` flag
- Gorilla Tactics (Choice Band as ability)
- Item implementations: Focus Sash, Rocky Helmet, Assault Vest, Weakness Policy, Air Balloon, Sitrus Berry, Lum Berry, pinch-stat berries, Choice lockup logic, Light Clay, Big Root, Serene Grace (as ability), Sheer Force (as ability), Scope Lens / Razor Claw, Eviolite fix
- New event types: `focus-sash`, `item-consumed`, `status-blocked`, `ability-triggered`
- Tests in `abilities.test.ts` and `items.test.ts`

### Deferred
- Primordial weather: implemented (all seven weather summoners are in scope)
- Wandering Spirit, Perish Body (complex multi-slot state)
- Defeatist, Slow Start, Truant (passive turn-by-turn penalty abilities)
- Neutralizing Gas (global field effect requiring different architecture)
- Mega-form ability changes
- Protean / Libero type changes

---

## Phase 1 — Schema & Type Changes

### `packages/shared/src/types/battle.ts`

```typescript
// Add primordial weather types
export type WeatherType = 'sun' | 'rain' | 'sand' | 'snow' | 'heavy-rain' | 'harsh-sun' | 'strong-winds';

// Add permanent flag to weather object
weather?: { type: WeatherType; turnsRemaining: number; fromAbility: boolean; permanent?: boolean };

// Add Choice lockup tracking to PartyMember
lockedMoveId?: string;
```

Permanent weather is never decremented in `endOfTurn`. A new setter attempts to write `field.weather` only if `!state.field.weather?.permanent || newWeather.permanent` — permanent weather cannot be overwritten by non-permanent weather.

### `packages/shared/src/types/events.ts`

Add four new literals to the `TurnResolveEvent` type union:

```typescript
| 'focus-sash'        // holder survived at 1 HP; data: { slotId }
| 'item-consumed'     // one-time item triggered; data: { slotId, item, reason }
| 'status-blocked'    // status prevented by ability; data: { slotId, status, reason: 'ability' }
| 'ability-triggered' // ability fired on immunity/contact; data: { slotId, ability, effect }
```

### `packages/server/src/engine/abilities.ts` — interface extensions

```typescript
// New hook for type-based move immunity
interface MoveImmunityCtx {
  move: Move;
  defender: PartyMember;
  state: BattleState;
}

interface MoveImmunityResult {
  immune: true;
  hpHealFraction?: number;       // e.g. 0.25 → heal 25% maxHp (Volt Absorb, Water Absorb, Dry Skin)
  statBoostDeltas?: Partial<StatBoosts>;  // Motor Drive, Sap Sipper, Storm Drain, Lightning Rod
  chargeFlashFire?: boolean;     // set flash-fire-charged volatile (Flash Fire)
}

// onAfterHit: expand return type
interface AfterHitResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<StatBoosts>;  // applied to attacker (Gooey: -1 Spe)
  abilityOverride?: string;               // attacker's ability becomes this (Mummy)
  directDamage?: number;                  // absolute HP damage to attacker (Rough Skin, Iron Barbs)
  volatileToApply?: string;              // volatile to push on attacker (Cursed Body: 'disable')
  disableMoveId?: string;               // paired with volatileToApply='disable'
}

// onAfterHit ctx: add makesContact
onAfterHit?: (ctx: AttackContext & { isPhysical: boolean; makesContact: boolean }) => AfterHitResult | null;

// SwitchInResult: add weather setter
setWeather?: { type: WeatherType; turnsRemaining: number; permanent?: boolean };

// New hook added to AbilityHooks
onMoveImmunity?: (ctx: MoveImmunityCtx) => MoveImmunityResult | null;

// New flag on AbilityHooks (not a function — just a marker)
doublesSecondaryChance?: true;   // Serene Grace — read in applySecondaries
removesSecondaries?: true;       // Sheer Force — read in applySecondaries / executeMove
```

### `packages/server/src/engine/items.ts` — interface extensions

```typescript
interface ItemHooks {
  // existing
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number };
  onAfterDamageTaken?: (ctx: ItemContext & { damageTaken: number; effectiveness?: number }) => {
    hpDelta: number;
    statBoostDeltas?: Partial<StatBoosts>;
    consume?: boolean;
  };
  onSpeedModifier?: (ctx: ItemContext) => number;

  // new
  onDefenderModifier?: (ctx: ItemAttackContext) => number;
  onAfterHit?: (ctx: ItemAttackContext & { makesContact: boolean; totalDamage: number }) => {
    directDamageToAttacker?: number;
    consume?: boolean;
  } | null;
  onStatusApplied?: (ctx: ItemContext & { status: string }) => { cureStatus: boolean; consume?: boolean } | null;
  critStageBonus?: number;    // Scope Lens, Razor Claw — read in computeCritStage
  weatherExtension?: number;  // Light Clay — read in screen-set factory; not weather-related despite name
  drainMultiplier?: number;   // Big Root — read in drain secondary handler
}
```

Note: `weatherExtension` is a misnomer from the spec — for `light-clay` it extends **screen** duration (not weather). The field name is kept as `screenExtension` in the actual implementation.

---

## Phase 2 — Hook Wiring in BattleEngine & status.ts

### `executeMove` — execution context

At the top of the per-target loop, construct:

```typescript
const ignoresAbilities = ['mold-breaker', 'turboblaze', 'teravolt']
  .includes(effectiveAbilityId(attacker));
```

This flag gates all `onMoveImmunity` and `onDefenderModifier` calls.

### `executeMove` — `onMoveImmunity` call site

Inserted after the `effectiveness === 0` type-chart check, before damage computation. Runs only if `!ignoresAbilities`:

```typescript
const immunityResult = getAbilityHooks(effectiveAbilityId(target))
  .onMoveImmunity?.({ move, defender: target, state: s });
if (immunityResult) {
  // apply hpHealFraction, statBoostDeltas, chargeFlashFire volatile
  events.push({ type: 'ability-triggered', data: { slotId: targetSlotId, ability: target.ability, effect: 'immune' } });
  events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, ... } });
  continue;
}

// Air Balloon Ground immunity (item, checked same location)
if (target.heldItem === 'air-balloon' && effectiveMoveType === 'Ground') {
  events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, ... } });
  continue;
}
```

### `executeMove` — `onDefenderModifier` call site

Inserted into `otherModifiers` accumulation, after the screen multiplier:

```typescript
if (!ignoresAbilities) {
  const defMod = getAbilityHooks(effectiveAbilityId(target))
    .onDefenderModifier?.({ user: target, state: s, moveType: effectiveMoveType,
      basePower: effectiveBasePower, target: attacker, isPhysical, effectiveness });
  if (defMod !== undefined) otherModifiers *= defMod;
}

// Item-based defender modifier (Assault Vest SpD boost)
const defItemMod = getItemHooks(target.heldItem)
  .onDefenderModifier?.({ holder: target, state: s, moveType: effectiveMoveType,
    basePower: effectiveBasePower, target: attacker, isPhysical });
if (defItemMod !== undefined) otherModifiers *= defItemMod;
```

`onDefenderModifier` for abilities receives a `DefenderModifierCtx` (not `AttackContext`) — it includes `effectiveness: number` and `isPhysical: boolean` which the existing `AttackContext` does not carry.

### `executeMove` — Focus Sash (inline, inside damage application block)

In the block where `cappedDamage` is computed (just before `target.currentHp -= cappedDamage`):

```typescript
const wouldFaint = target.currentHp - actualDamage <= 0;
if (wouldFaint && target.currentHp === target.maxHp && target.heldItem === 'focus-sash') {
  cappedDamage = target.currentHp - 1;
  target.heldItem = undefined;
  events.push({ type: 'focus-sash', data: { slotId: targetSlotId } });
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'focus-sash', reason: 'triggered' } });
}
```

### `executeMove` — post-hit item hooks

After the existing `defenderAbilityHooks.onAfterHit` block:

```typescript
// Rocky Helmet
if (move.makesContact && totalDamage > 0 && !target.fainted) {
  const helmetResult = getItemHooks(target.heldItem)
    .onAfterHit?.({ holder: target, state: s, ..., makesContact: true, totalDamage });
  if (helmetResult?.directDamageToAttacker) {
    const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
    attacker.currentHp -= dmg;
    events.push({ type: 'damage-dealt', data: { source: 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
    if (attacker.currentHp <= 0) { /* faint */ }
  }
}

// Air Balloon pop — any damaging move
if (target.heldItem === 'air-balloon' && totalDamage > 0) {
  target.heldItem = undefined;
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'air-balloon', reason: 'popped' } });
}

// Weakness Policy
if (effectiveness > 1 && totalDamage > 0 && !target.fainted && target.heldItem === 'weakness-policy') {
  target.heldItem = undefined;
  const wpEvent = applyStatBoost(target, targetSlotId, { atk: 2, spa: 2 });
  events.push(wpEvent);
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'weakness-policy', reason: 'triggered' } });
}

// Sitrus Berry
if (!target.fainted && getItemHooks(target.heldItem).onAfterDamageTaken) {
  const berryResult = getItemHooks(target.heldItem).onAfterDamageTaken!({ holder: target, state: s, damageTaken: totalDamage });
  if (berryResult.hpDelta !== 0) {
    // apply heal / stat boost, consume item if berryResult.consume
  }
}
```

### `canApplyStatus` in `status.ts`

Remove the five hardcoded ability checks. Replace with:

```typescript
if (getAbilityHooks(ability).onStatusImmunity?.({ user: target, state: field, status })) return false;
```

`canApplyStatus` signature remains `({ status, types, currentStatus, ability }: CanApplyInput): boolean`. The `status-blocked` event is emitted at the `applyStatus` call site in `BattleEngine` (not inside `canApplyStatus`), by comparing the return value before/after the hook call.

Practically: `applyStatus` in `effects.ts` already returns an event or `null`. When `canApplyStatus` returns `false` due to the ability hook, the caller emits `{ type: 'status-blocked', data: { slotId, status, reason: 'ability' } }`.

### `performSwitch` — Choice lock clear

In the switch-out cleanup block:

```typescript
delete outgoing.lockedMoveId;
```

### `applySwitchInResult` — weather setter

```typescript
if (result.setWeather) {
  const { type, turnsRemaining, permanent } = result.setWeather;
  if (!s.field.weather?.permanent || permanent) {
    s.field.weather = { type, turnsRemaining, fromAbility: true, permanent };
    events.push({ type: 'weather-started', data: { weather: type } });
  }
}
```

### `endOfTurn` — permanent weather skip

```typescript
if (s.field.weather && !s.field.weather.permanent) {
  s.field.weather.turnsRemaining -= 1;
  if (s.field.weather.turnsRemaining <= 0) { ... }
}
```

### Choice lockup in `battleHandlers.ts`

Before accepting a `move` action:

```typescript
const isChoiceLocked =
  ['choice-band', 'choice-specs', 'choice-scarf'].includes(pkmn.heldItem ?? '') ||
  effectiveAbilityId(pkmn) === 'gorilla-tactics';

if (isChoiceLocked) {
  if (pkmn.lockedMoveId && move.moveId !== pkmn.lockedMoveId) {
    // reject — re-send action:request
    return;
  }
  if (!pkmn.lockedMoveId) {
    pkmn.lockedMoveId = move.moveId;  // set lock on first use
  }
}
```

Struggle bypasses this check (PP-exhausted logic runs first).

---

## Phase 3 — Ability Implementations

### `onDefenderModifier` entries

```typescript
'filter': {
  onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
},
'solid-rock': { /* same as filter */ },
'prism-armor': { /* same as filter */ },
'thick-fat': {
  // MOVED from onDamageModifier
  onDefenderModifier: ({ moveType }) =>
    moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
},
'fluffy': {
  onDefenderModifier: ({ moveType, makesContact }) => {
    let mod = 1;
    if (makesContact) mod *= 0.5;
    if (moveType === 'Fire') mod *= 2;
    return mod;
  },
},
'fur-coat': {
  onDefenderModifier: ({ isPhysical }) => isPhysical ? 0.5 : 1,
},
'multiscale': {
  onDefenderModifier: ({ defender }) =>
    defender.currentHp === defender.maxHp ? 0.5 : 1,
},
'shadow-shield': { /* same as multiscale */ },
'ice-scales': {
  onDefenderModifier: ({ isPhysical }) => !isPhysical ? 0.5 : 1,
},
'punk-rock': {
  onDefenderModifier: ({ move }) => move.soundMove ? 0.5 : 1,
},
'heatproof': {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
},
'dry-skin': {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 1.25 : 1,
  // Water immunity handled via onMoveImmunity (see below)
},
'water-bubble': {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
  // Water-type attacker modifier (×2 Water power on offense): onAttackerModifier
  onAttackerModifier: ({ moveType }) => moveType === 'Water' ? 2 : 1,
  // Burn immunity: onStatusImmunity
  onStatusImmunity: ({ status }) => status === 'brn',
},
```

### `onMoveImmunity` entries (migrate from `onStatusImmunity`)

```typescript
'levitate': {
  onMoveImmunity: ({ move }) => move.type === 'Ground' ? { immune: true } : null,
},
'flash-fire': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Fire' ? { immune: true, chargeFlashFire: true } : null,
  onAttackerModifier: ({ user, moveType }) =>
    moveType === 'Fire' && user.volatileStatus.some(v => v.name === 'flash-fire-charged') ? 1.5 : 1,
},
'volt-absorb': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, hpHealFraction: 0.25 } : null,
},
'water-absorb': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
},
'dry-skin': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
  // Fire modifier: onDefenderModifier (see above)
},
'motor-drive': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, statBoostDeltas: { spe: 1 } } : null,
},
'sap-sipper': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Grass' ? { immune: true, statBoostDeltas: { atk: 1 } } : null,
},
'storm-drain': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
},
'lightning-rod': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
},
```

Remove `onStatusImmunity` entries for `levitate`, `flash-fire`, `water-absorb`, `volt-absorb`.

### `onStatusImmunity` entries (now properly called via `canApplyStatus`)

```typescript
'limber':        { onStatusImmunity: ({ status }) => status === 'par' },
'immunity':      { onStatusImmunity: ({ status }) => status === 'psn' || status === 'tox' },
'magma-armor':   { onStatusImmunity: ({ status }) => status === 'frz' },
'water-veil':    { onStatusImmunity: ({ status }) => status === 'brn' },
'insomnia':      { onStatusImmunity: ({ status }) => status === 'slp' },
'vital-spirit':  { onStatusImmunity: ({ status }) => status === 'slp' },
'sweet-veil':    { onStatusImmunity: ({ status }) => status === 'slp' },
'comatose':      { onStatusImmunity: () => true },
'leaf-guard':    { onStatusImmunity: ({ status, state }) =>
    state.field.weather?.type === 'sun' },
```

Volatile-based immunities (Own Tempo, Inner Focus, Oblivious) are handled in `applySecondaries` / `evaluateVolatileEffect` in `effects.ts` by checking the defender's ability before applying confusion, flinch, or attract volatiles. They are not wired through `onStatusImmunity`.

### `onAfterHit` entries

```typescript
'static': {
  onAfterHit: ({ makesContact, state }) =>
    makesContact && state.rng() < 0.3 ? { statusToApply: 'par' } : null,
},
'flame-body': {
  onAfterHit: ({ makesContact, state }) =>
    makesContact && state.rng() < 0.3 ? { statusToApply: 'brn' } : null,
},
'poison-point': {
  onAfterHit: ({ makesContact, state }) =>
    makesContact && state.rng() < 0.3 ? { statusToApply: 'psn' } : null,
},
'effect-spore': {
  onAfterHit: ({ makesContact, state }) => {
    if (!makesContact) return null;
    const r = state.rng();
    if (r >= 0.3) return null;
    if (r < 0.1) return { statusToApply: 'par' };
    if (r < 0.2) return { statusToApply: 'psn' };
    return { statusToApply: 'slp' };
  },
},
'rough-skin': {
  onAfterHit: ({ makesContact, target }) =>
    makesContact ? { directDamage: Math.floor(target.maxHp / 8) } : null,
},
'iron-barbs': { /* same as rough-skin */ },
'gooey': {
  onAfterHit: ({ makesContact }) =>
    makesContact ? { statBoostDeltas: { spe: -1 } } : null,
},
'tangling-hair': { /* same as gooey */ },
'mummy': {
  onAfterHit: ({ makesContact, user }) =>
    makesContact ? { abilityOverride: 'mummy' } : null,
},
'cursed-body': {
  onAfterHit: ({ makesContact, move, state }) =>
    makesContact && state.rng() < 0.3
      ? { volatileToApply: 'disable', disableMoveId: move.id }
      : null,
},
```

Note: `rng` needs to be accessible in `onAfterHit` ctx. The ctx currently takes `state: BattleState`. Since `rng` is a method on `BattleEngine`, not on `BattleState`, it should be passed directly in the ctx, or the hook returns a probability and the engine rolls. The cleaner pattern: pass `rng: () => number` in the ctx (same approach as `applySecondaries`).

### `onSwitchIn` weather entries

```typescript
'drizzle':       { onSwitchIn: ({ user }) => ({ setWeather: { type: 'rain', turnsRemaining: user.heldItem === 'damp-rock' ? 8 : 5 } }) },
'drought':       { onSwitchIn: ({ user }) => ({ setWeather: { type: 'sun',  turnsRemaining: user.heldItem === 'heat-rock' ? 8 : 5 } }) },
'sand-stream':   { onSwitchIn: ({ user }) => ({ setWeather: { type: 'sand', turnsRemaining: user.heldItem === 'smooth-rock' ? 8 : 5 } }) },
'snow-warning':  { onSwitchIn: ({ user }) => ({ setWeather: { type: 'snow', turnsRemaining: user.heldItem === 'icy-rock' ? 8 : 5 } }) },
'primordial-sea':  { onSwitchIn: () => ({ setWeather: { type: 'heavy-rain', turnsRemaining: 999, permanent: true } }) },
'desolate-land':   { onSwitchIn: () => ({ setWeather: { type: 'harsh-sun',  turnsRemaining: 999, permanent: true } }) },
'delta-stream':    { onSwitchIn: () => ({ setWeather: { type: 'strong-winds', turnsRemaining: 999, permanent: true } }) },
```

`turnsRemaining: 999` for permanent weather is never decremented, so its value is arbitrary. A named constant `PERMANENT_WEATHER_TURNS = 999` makes intent clear.

### Gorilla Tactics

```typescript
'gorilla-tactics': {
  onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.5 : 1,
  // Choice lockup enforced in battleHandlers.ts by checking effectiveAbilityId(pkmn) === 'gorilla-tactics'
},
```

### Serene Grace & Sheer Force (ability flags)

```typescript
'serene-grace': { doublesSecondaryChance: true },
'sheer-force':  { removesSecondaries: true },
```

In `applySecondaries`:
- If `getAbilityHooks(user.ability).doublesSecondaryChance`, multiply each secondary's chance by 2 before rolling.
- If `getAbilityHooks(user.ability).removesSecondaries`, skip `applySecondaries` entirely.

In `executeMove`, before calling `applySecondaries`: if Sheer Force is active, also apply a ×1.3 power boost via `otherModifiers` and skip secondaries.

---

## Phase 3 — Item Implementations

```typescript
'assault-vest': {
  onDefenderModifier: ({ isPhysical }) => !isPhysical ? (2/3) : 1,
  // 2/3 modifier on the damage side = effectively ×1.5 SpD
  // Move selection enforcement (no status moves) handled in battleHandlers.ts
},
'scope-lens':  { critStageBonus: 1 },
'razor-claw':  { critStageBonus: 1 },
'light-clay':  { screenExtension: 3 },  // adds 3 turns to the base 5 → 8 total
'big-root':    { drainMultiplier: 2 },
'rocky-helmet': {
  onAfterHit: ({ makesContact, holder, totalDamage }) =>
    makesContact && totalDamage > 0
      ? { directDamageToAttacker: Math.floor(holder.maxHp / 6) }
      : null,
},
'weakness-policy': {
  // Inline in BattleEngine post-hit block (effectiveness check not available in hook ctx)
},
'air-balloon': {
  // Immunity inline in executeMove; pop inline in post-hit block
},
'focus-sash': {
  // Fully inline in damage application block
},
'sitrus-berry': {
  onAfterDamageTaken: ({ holder, damageTaken }) =>
    holder.currentHp <= holder.maxHp / 2
      ? { hpDelta: Math.floor(holder.maxHp / 4), consume: true }
      : { hpDelta: 0 },
},
'lum-berry': {
  onStatusApplied: ({ status }) => ({ cureStatus: true, consume: true }),
},
'salac-berry':  { onAfterDamageTaken: ({ holder }) => holder.currentHp <= holder.maxHp / 4 ? { hpDelta: 0, statBoostDeltas: { spe: 1 }, consume: true } : { hpDelta: 0 } },
'petaya-berry': { onAfterDamageTaken: ({ holder }) => holder.currentHp <= holder.maxHp / 4 ? { hpDelta: 0, statBoostDeltas: { spa: 1 }, consume: true } : { hpDelta: 0 } },
'liechi-berry': { onAfterDamageTaken: ({ holder }) => holder.currentHp <= holder.maxHp / 4 ? { hpDelta: 0, statBoostDeltas: { atk: 1 }, consume: true } : { hpDelta: 0 } },
'ganlon-berry': { onAfterDamageTaken: ({ holder }) => holder.currentHp <= holder.maxHp / 4 ? { hpDelta: 0, statBoostDeltas: { def: 1 }, consume: true } : { hpDelta: 0 } },
'apicot-berry': { onAfterDamageTaken: ({ holder }) => holder.currentHp <= holder.maxHp / 4 ? { hpDelta: 0, statBoostDeltas: { spd: 1 }, consume: true } : { hpDelta: 0 } },
'eviolite': {
  onDefenderModifier: ({ holder, isPhysical, dataLoader }) =>
    dataLoader.isEvioliteEligible(holder.speciesId) ? (2/3) : 1,
  // 2/3 on damage = ×1.5 Def AND SpD
},
```

`Eviolite` boost applies to both physical and special damage. It requires `DataLoader` to be passed into the item hook ctx, or a simpler approach: pre-compute eligibility at battle setup and store on `PartyMember`. The simpler approach: add `isEvioliteEligible?: boolean` to `PartyMember`, set during `BattleConfigurator`. Then `eviolite` checks `holder.isEvioliteEligible`.

`computeCritStage` in `accuracy.ts` gains a parameter: `itemCritBonus: number` (0 if no item, 1 for Scope Lens/Razor Claw). Called from `executeMove` where item is already resolved.

---

## Phase 4 — Test Strategy

### `packages/server/src/engine/__tests__/abilities.test.ts` (new file)

**`onDefenderModifier`**
- Multiscale halves damage at full HP; does not halve when HP < max
- Filter/Solid Rock: super-effective move deals ×0.75 of expected; neutral move unaffected
- Thick Fat: Fire-type move to holder deals ×0.5; Ice-type move ×0.5; Water-type move unaffected
- Fluffy: contact move ×0.5; Fire-type move ×2; contact Fire move ×1.0 (net)
- Mold Breaker bypasses Multiscale (Mold Breaker attacker, full-HP Multiscale target → no reduction)

**`onMoveImmunity`**
- Levitate: Ground move emits `no-effect`; Electric move hits normally
- Volt Absorb: Electric move blocked; `ability-triggered` event; holder healed 25% maxHp
- Flash Fire: Fire move blocked; `flash-fire-charged` volatile on holder; subsequent Fire move by holder ×1.5
- Flash Fire: Mold Breaker bypasses immunity (Fire move hits)
- Motor Drive: Electric move blocked; +1 Spe on holder
- Sap Sipper: Grass move blocked; +1 Atk on holder

**`onStatusImmunity`**
- Limber: `par` blocked; `status-blocked` event emitted; `brn` applied normally
- Leaf Guard: all status blocked in sun; status applies normally outside of sun
- Comatose: all status blocked

**Volatile immunity (Own Tempo, Inner Focus)**
- Own Tempo holder: confusion secondary from Psybeam does not apply
- Inner Focus holder: flinch secondary does not apply

**`onAfterHit`**
- Static: seeded rng below 0.3 → `par` applied to attacker; non-contact move → no trigger
- Rough Skin: contact move → attacker takes ⌊maxHp/8⌋; non-contact → no damage
- Gooey: contact move → −1 Spe on attacker
- Mummy: contact move → attacker's ability changes to `mummy`
- Effect Spore: three seeded-rng tests covering each outcome

**Weather summoners**
- Drizzle: switch-in sets `field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: true }`
- Drizzle + Damp Rock: turnsRemaining = 8
- Drought overrides Drizzle rain (non-permanent → non-permanent replacement)
- Primordial Sea: permanent flag; Drought switch-in cannot overwrite it
- Delta Stream: permanent flag

### `packages/server/src/engine/__tests__/items.test.ts` (new file)

**Passive modifiers**
- Assault Vest: special move damage reduced (~×0.67); physical move unaffected
- Scope Lens: crit stage +1 in seeded test
- Eviolite: Def and SpD effectively ×1.5 for eligible species; ineligible species unaffected

**One-time items**
- Focus Sash: full-HP holder survives OHKO at 1 HP, item consumed, `focus-sash` event emitted
- Focus Sash: already-damaged holder does not trigger; item not consumed
- Weakness Policy: super-effective hit → +2 Atk +2 SpA, item consumed; neutral hit → no trigger
- Air Balloon: Ground move blocked; non-Ground move pops balloon (`item-consumed` event); subsequent Ground move hits
- Sitrus Berry: damage drops HP to ≤50% → heal ¼ maxHp, item consumed; HP above 50% after hit → no trigger
- Lum Berry: burn applied → status immediately cured, item consumed
- Salac Berry: HP drops to ≤25% → +1 Spe, item consumed; HP at 26% → no trigger
- Rocky Helmet: contact move → attacker takes ⌊maxHp/6⌋; non-contact → no damage

**Choice lockup**
- Choice Band: first move sets `lockedMoveId`; second different move rejected (re-request sent)
- Choice Band: switching clears `lockedMoveId`
- Gorilla Tactics: same lockup behaviour as Choice Band

### Updates to existing tests

`damage.test.ts` — add Thick Fat test via defender ability (now `onDefenderModifier`); confirm attacker with Thick Fat does nothing on offense.

`status.test.ts` — confirm `canApplyStatus` no longer has hardcoded branches; Limber immunity routes through hook.

---

## Open Questions Resolved

1. **Mold Breaker scope:** Does NOT suppress Rough Skin / Rocky Helmet (these fire on the attacker, not the defender). Only abilities checked at `onDefenderModifier` and `onMoveImmunity` call sites are suppressed.
2. **Effect Spore timing:** No changes needed. `canApplyStatus` already blocks stacking — if attacker has a status, `statusToApply` from Effect Spore will silently fail at `applyStatus`.
3. **Gorilla Tactics:** Included. Handled as Choice Band equivalent in `battleHandlers.ts`.
4. **Defeatist / Slow Start / Truant:** Deferred to a separate pass.
5. **Neutralizing Gas:** Deferred.
6. **Berry timing:** After-damage only (Gen 5+). No start-of-turn check.
