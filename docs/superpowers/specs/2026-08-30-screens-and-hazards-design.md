# Screens & Entry Hazards — Design

**Date:** 2026-08-30
**Feature doc:** `docs/upcoming-features/06-screens-and-hazards.md`
**Scope:** L — screens (Reflect, Light Screen, Aurora Veil), entry hazards (Stealth Rock, Spikes, Toxic Spikes, Sticky Web), clearers (Rapid Spin, Defog, Court Change), screen-breaking moves
**Approach:** Approach B — new `sideConditions.ts` helper module, secondary kinds for post-hit effects

---

## What's already in place

- `SideConditions` already uses `reflect: number`, `lightScreen: number`, `auroraVeil: number` (0 = inactive, >0 = turns remaining) — no type changes needed to the existing fields
- `setSideCondition` factory exists and is already registered for Reflect (5), Light Screen (5), Aurora Veil (5), Stealth Rock (true), Sticky Web (true) — but with no guards
- Spikes and Toxic Spikes already have custom handlers with cap checks
- `isGrounded` already exists in `fieldState.ts`
- `side-condition-set` event already exists in `TurnResolveEvent.type`

---

## Files touched

| File | Change |
|------|--------|
| `shared/src/types/events.ts` | Add 5 new event types |
| `shared/src/types/secondary.ts` | Add 2 new secondary kinds |
| `server/src/engine/sideConditions.ts` | **New** — helper module for all side-condition logic |
| `server/src/engine/effectFactories.ts` | Extend `setSideCondition` with optional guard options |
| `server/src/engine/registrations.ts` | Update screen/hazard registrations; add Defog, Court Change |
| `server/src/engine/effects.ts` | Add `clear-hazards-self` and `break-screens` branches to `applySecondaries` |
| `server/src/engine/BattleEngine.ts` | Wire screen halving in `executeMove`; entry hazards in `executeSwitch`; screen decrements in `endOfTurn` |
| `data/scripts/seed.ts` | Add `clear-hazards-self` to Rapid Spin; add `break-screens` to Brick Break, Psychic Fangs, Raging Bull |
| `data/moves.json` | Regenerated |

Tests added in existing `__tests__` siblings alongside each change. A new `__tests__/sideConditions.test.ts` covers the helper module in isolation.

---

## Section 1 — Type changes

### `shared/src/types/events.ts`

Add to the `TurnResolveEvent.type` union:

```typescript
| 'screen-ended'   // data: { screen: 'reflect'|'lightScreen'|'auroraVeil', side: 0|1 }
| 'screen-broken'  // data: { screen: string, side: 0|1 }
| 'hazard-damage'  // data: { slotId: string, hazard: string, damage: number, remainingHp: number }
| 'hazard-cleared' // data: { hazard: string, side: 0|1 }
| 'court-change'   // data: {}
```

The existing `'side-condition-set'` is kept as-is and emitted when a screen or hazard is first placed.

### `shared/src/types/secondary.ts`

Add two new secondary kinds:

```typescript
| { kind: 'clear-hazards-self' }
| { kind: 'break-screens'; screensOnly: boolean }
```

`clear-hazards-self` — Rapid Spin: clears user's side hazards + grants +1 Spe.
`break-screens` — Brick Break (`screensOnly: true`): removes Reflect and Light Screen only. Psychic Fangs and Raging Bull (`screensOnly: false`): also removes Aurora Veil.

### `shared/src/types/battle.ts`

No changes. The existing `reflect: number`, `lightScreen: number`, `auroraVeil: number` fields already carry turn-counter semantics (0 = inactive). The feature doc's proposed `reflectTurns` / `lightScreenTurns` / `auroraVeilTurns` additions are unnecessary.

---

## Section 2 — `sideConditions.ts` (new module)

Location: `packages/server/src/engine/sideConditions.ts`

### `decrementScreens`

```typescript
function decrementScreens(
  side: SideConditions,
  sideIdx: 0 | 1,
  events: TurnResolveEvent[],
): void
```

Called from `endOfTurn`. Decrements `reflect`, `lightScreen`, and `auroraVeil` each by 1 if > 0. When any reaches 0, emits `screen-ended`.

### `getScreenMultiplier`

```typescript
function getScreenMultiplier(
  side: SideConditions,
  category: 'physical' | 'special',
  isCritical: boolean,
): number
```

Returns 0.5 if the relevant screen is active and the move is not a crit; 1.0 otherwise.
- `reflect > 0` applies to physical moves
- `lightScreen > 0` applies to special moves
- `auroraVeil > 0` applies to both (same halving for the appropriate category)

Critical hits bypass all screens (Gen 6+ rule).

### `applyEntryHazards`

```typescript
function applyEntryHazards(
  incoming: PartyMember,
  slotId: string,
  side: SideConditions,
  effectiveTypes: PokemonType[],
  grounded: boolean,
  data: DataLoader,
): TurnResolveEvent[]
```

Called from `executeSwitch` after the incoming Pokémon is set. Applies hazards in order:

1. **Stealth Rock** — hits everyone (including Flying types). `damage = floor(maxHp × 0.125 × getCombinedEffectiveness('Rock', effectiveTypes))`. Emits `hazard-damage`, then `faint` if HP reaches 0.
2. **Spikes** — grounded only. Layer 1 → 1/8, layer 2 → 1/6, layer 3 → 1/4 (all floored). Emits `hazard-damage`.
3. **Toxic Spikes** — grounded, non-Flying, non-Steel:
   - If a grounded Poison-type switches in: absorb all layers (set to 0), emit `hazard-cleared`. No damage or status.
   - Otherwise: layer 1 → `psn`, layer 2 → `tox` (applied via `applyStatus`).
4. **Sticky Web** — grounded only. Applies −1 Spe via `applyStatBoost`. Emits `stat-change`.

Immunities checked inline per hazard. `grounded` is pre-computed by the caller (uses `isGrounded` from `fieldState.ts`).

### `clearHazards`

```typescript
function clearHazards(side: SideConditions, sideIdx: 0 | 1): TurnResolveEvent[]
```

Clears `stealthRock`, `spikes`, `toxicSpikes`, `stickyWeb` if set. Emits `hazard-cleared` per removed hazard.

### `clearScreens`

```typescript
function clearScreens(side: SideConditions, sideIdx: 0 | 1): TurnResolveEvent[]
```

Sets `reflect`, `lightScreen`, `auroraVeil` to 0 if currently > 0. Emits `screen-broken` per removed screen.

---

## Section 3 — `effectFactories.ts` changes

Extend `setSideCondition` signature:

```typescript
export function setSideCondition(
  key: keyof SideConditions,
  value: number | boolean,
  side: 'ally' | 'foe',
  options?: {
    failIfActive?: boolean;
    weatherRequired?: WeatherType[];
  },
): MoveEffectHandler
```

Guard logic (runs before setting the value):
1. If `failIfActive` and the current field value is truthy → emit `move-failed` with `reason: 'already-active'`
2. If `weatherRequired` and `field.weather?.type` is not in the list → emit `move-failed` with `reason: 'no-hail'`

Happy path unchanged: mutate the field, emit `side-condition-set`.

---

## Section 4 — `registrations.ts` changes

### Screens — add `failIfActive: true`

```typescript
r.register('reflect',     setSideCondition('reflect',     5, 'ally', { failIfActive: true }));
r.register('lightscreen', setSideCondition('lightScreen', 5, 'ally', { failIfActive: true }));
r.register('auroraveil',  setSideCondition('auroraVeil',  5, 'ally', { failIfActive: true, weatherRequired: ['snow'] }));
```

### Hazard setters — add `failIfActive: true` to boolean hazards

```typescript
r.register('stealthrock', setSideCondition('stealthRock', true, 'foe', { failIfActive: true }));
r.register('stickyweb',   setSideCondition('stickyWeb',   true, 'foe', { failIfActive: true }));
```

Spikes and Toxic Spikes keep their existing custom handlers (already cap at max layers).

### Defog — new custom handler

```typescript
r.register('defog', custom((ctx) => {
  const events: TurnResolveEvent[] = [];
  const userIdx = ctx.userTeamIndex as 0 | 1;
  const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;

  // -1 evasion on target
  for (let i = 0; i < ctx.targets.length; i++) {
    events.push(applyStatBoost(ctx.targets[i]!, ctx.targetSlotIds[i]!, { evasion: -1 }));
  }

  // Clear hazards from both sides
  events.push(...clearHazards(ctx.battle.field.sideConditions[userIdx]!, userIdx));
  events.push(...clearHazards(ctx.battle.field.sideConditions[foeIdx]!, foeIdx));

  // Clear screens from the target's (foe's) side only
  events.push(...clearScreens(ctx.battle.field.sideConditions[foeIdx]!, foeIdx));

  // Clear active terrain
  if (ctx.battle.field.terrain) {
    const terrainType = ctx.battle.field.terrain.type;
    delete ctx.battle.field.terrain;
    events.push({ type: 'terrain-ended', data: { terrain: terrainType } });
  }

  return { events };
}));
```

### Court Change — new custom handler

```typescript
r.register('courtchange', custom((ctx) => {
  const [side0, side1] = ctx.battle.field.sideConditions;
  ctx.battle.field.sideConditions = [side1!, side0!];
  return { events: [{ type: 'court-change', data: {} }] };
}));
```

### Rapid Spin, Brick Break, Psychic Fangs, Raging Bull — seed script

In `data/scripts/seed.ts`, add to the move mapping:

```typescript
// Rapid Spin: clear-hazards-self secondary (guaranteed, no chance)
// Brick Break: break-screens screensOnly:true secondary
// Psychic Fangs: break-screens screensOnly:false secondary
// Raging Bull: break-screens screensOnly:false secondary
```

These become entries in `moves.json` under `secondaries`. The existing `applySecondaries` loop picks them up.

---

## Section 5 — `BattleEngine.ts` changes

### `executeMove` — screen damage halving

Inside the per-target hit loop, after computing `isCritical` and before the `calcDamage` call, fold the screen multiplier into `otherModifiers`:

```typescript
const defenderTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === targetSlotId)) as 0 | 1;
otherModifiers *= getScreenMultiplier(
  s.field.sideConditions[defenderTeamIndex]!,
  move.category as 'physical' | 'special',
  isCritical,
);
```

### `executeSwitch` — entry hazards

After the incoming Pokémon's ability switch-in hook:

```typescript
if (incoming) {
  const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId)) as 0 | 1;
  const incomingSide = s.field.sideConditions[incomingTeamIndex]!;
  const incomingTypes = this.resolveEffectiveTypes(incoming);
  const grounded = isGrounded(incoming, incomingTypes, s.field.gravity > 0);
  events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTypes, grounded, this.data));
}
```

### `endOfTurn` — screen decrements

In the field counter decrement block (alongside weather/terrain/trickroom/gravity):

```typescript
for (let i = 0; i < 2; i++) {
  decrementScreens(s.field.sideConditions[i]!, i as 0 | 1, events);
}
```

---

## Section 6 — `effects.ts` / `applySecondaries` changes

Add two new branches to the secondary kind switch in `applySecondaries`. Both execute only when `totalDamage > 0` (the existing outer guard), so they don't fire on misses or substitute hits.

### `clear-hazards-self`

```typescript
case 'clear-hazards-self': {
  const userTeamIndex = battle.teams.findIndex(t =>
    t.slots.some(sl => sl.slotId === userSlotId)
  ) as 0 | 1;
  const userSide = battle.field.sideConditions[userTeamIndex]!;
  events.push(...clearHazards(userSide, userTeamIndex));
  events.push(applyStatBoost(user, userSlotId, { spe: 1 }));
  break;
}
```

### `break-screens`

```typescript
case 'break-screens': {
  const targetTeamIndex = battle.teams.findIndex(t =>
    t.slots.some(sl => sl.slotId === targetSlotId)
  ) as 0 | 1;
  const targetSide = battle.field.sideConditions[targetTeamIndex]!;
  if (targetSide.reflect > 0) {
    targetSide.reflect = 0;
    events.push({ type: 'screen-broken', data: { screen: 'reflect', side: targetTeamIndex } });
  }
  if (targetSide.lightScreen > 0) {
    targetSide.lightScreen = 0;
    events.push({ type: 'screen-broken', data: { screen: 'lightScreen', side: targetTeamIndex } });
  }
  if (!sec.screensOnly && targetSide.auroraVeil > 0) {
    targetSide.auroraVeil = 0;
    events.push({ type: 'screen-broken', data: { screen: 'auroraVeil', side: targetTeamIndex } });
  }
  break;
}
```

---

## Open questions resolved

1. **SideConditions type** — no change needed; `reflect: number` etc. already carry turn-counter semantics.
2. **Post-hit move effects** — new `Secondary` kinds (`clear-hazards-self`, `break-screens`) handled in `applySecondaries`.
3. **Screen guards** — `setSideCondition` factory extended with `failIfActive` and `weatherRequired` options.
4. **Screen damage halving** — applied via `otherModifiers` in `BattleEngine.executeMove`, consistent with terrain modifiers.
5. **Defog terrain interaction** — reuses existing `terrain-ended` event for consistency.
6. **Toxic Spikes + Poison-type** — grounded Poison-type absorbs the spikes (clears all layers) on switch-in; Magic Guard does not block the poison status (only blocks EoT damage, handled by the existing `magic-guard` check in `EffectEngine`).

---

## Success criteria

- Reflect is placed on the user's side; physical damage to that side is ×0.5 for 5 turns; crit deals full damage; turn 5 end emits `screen-ended`.
- Reflect fails with `already-active` if already set; Aurora Veil fails with `no-hail` if weather is not snow.
- Stealth Rock placed on foe's side; Charizard (4× Rock weakness) switching in takes 50% max HP (`hazard-damage` event).
- Spikes at 3 layers deals 1/4 max HP to a grounded switch-in.
- Toxic Spikes at 2 layers badly poisons a switch-in; 1 layer gives regular poison.
- A grounded Poison-type absorbs Toxic Spikes on switch-in (`hazard-cleared` event, no status).
- Rapid Spin after Stealth Rock: hazard cleared (`hazard-cleared`), user gets +1 Spe.
- Brick Break removes Reflect and Light Screen but not Aurora Veil from the target's side.
- Psychic Fangs and Raging Bull remove all three screens.
- Defog: −1 evasion on target, clears hazards from both sides, clears screens from target's side, removes terrain.
- Court Change swaps both sides' full `sideConditions` wholesale.
- Screen counters decrement each turn; `screen-ended` emitted at expiry.
