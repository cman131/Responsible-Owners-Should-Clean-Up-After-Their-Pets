# Field State Activation — Design

**Date:** 2026-08-30  
**Feature doc:** `docs/upcoming-features/05-field-state-activation.md`  
**Scope:** L — weather residual, terrain effects, Trick Room, Gravity, move-specific weather interactions  
**Approach:** Monolithic BattleEngine with `fieldState.ts` helper module

---

## What's already in place

The following were built in earlier docs and require no structural change:

- `setWeather`, `setTerrain`, `trickRoom`, `gravity` factories exist in `effectFactories.ts` and are registered
- Weather power modifiers (rain/sun × water/fire) already in `calcDamage`
- Weather counter decrement runs in `endOfTurn`
- Solar Beam charge-skip in sun already wired (`BattleEngine.ts` charge-turn check reads `s.field.weather?.type === 'sun'`)
- All `FieldState` types (`weather`, `terrain`, `trickroom`, `gravity`) exist in `shared/types/battle.ts`

---

## Files touched

| File | Change |
|------|--------|
| `shared/src/types/events.ts` | Drop 3 old event types; add 8 new specific types |
| `server/src/engine/fieldState.ts` | **New** — `isGrounded()` + lookup maps |
| `server/src/engine/effectFactories.ts` | Update 4 factories to emit new event types |
| `server/src/engine/effects.ts` | `applyStatus` optional `field` param → terrain immunity |
| `server/src/engine/EffectEngine.ts` | Thread `field` into `applyStatus` call for Yawn |
| `server/src/engine/BattleEngine.ts` | `buildActionOrder`, `executeMove`, `endOfTurn` |

Tests added alongside each change in existing `__tests__` siblings.

---

## Section 1: Event types

Remove from `TurnResolveEvent.type`:
```
'weather-change' | 'terrain-change' | 'field-effect-set'
```

Add:
```
'weather-started' | 'weather-ended'
'terrain-started' | 'terrain-ended'
'trickroom-started' | 'trickroom-ended'
'gravity-started'  | 'gravity-ended'
```

Payloads (`data: Record<string, unknown>`):
- `weather-started`: `{ weather: WeatherType, turnsRemaining: number }`
- `weather-ended`: `{ weather: WeatherType }`
- `terrain-started`: `{ terrain: TerrainType }`
- `terrain-ended`: `{ terrain: TerrainType }`
- `trickroom-started` / `trickroom-ended`: `{}`
- `gravity-started` / `gravity-ended`: `{}`

`side-condition-set` is unchanged.

Any existing tests asserting on old event names are updated as part of the plan.

---

## Section 2: `fieldState.ts` (new file)

```typescript
export function isGrounded(
  pokemon: PartyMember,
  effectiveTypes: PokemonType[],
  gravityActive: boolean,
): boolean {
  if (gravityActive) return true;
  if (effectiveTypes.includes('Flying')) return false;
  if (pokemon.ability === 'levitate') return false;
  if (pokemon.volatileStatus.some(v => v.name === 'magnet-rise')) return false;
  return true;
}

// Weather accuracy overrides: true = always hits, number = fixed %
export const WEATHER_ACCURACY: Partial<Record<string, Partial<Record<WeatherType, number | true>>>> = {
  thunder:   { rain: true, sun: 50 },
  blizzard:  { snow: true },
  hurricane: { rain: true, sun: 50 },
};

// Solar Beam / Solar Blade fire at half power in any non-sun weather
export const SOLAR_MOVES = new Set(['solarbeam', 'solarblade']);

// Weather Ball type by weather
export const WEATHER_BALL_TYPE: Partial<Record<WeatherType, PokemonType>> = {
  sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice',
};

// Moves blocked entirely by Gravity
export const GRAVITY_BLOCKED_MOVES = new Set([
  'fly', 'bounce', 'skydrop', 'skyattack', 'jumpkick', 'highjumpkick',
]);

// Moves halved by Grassy Terrain
export const GRASSY_TERRAIN_HALVED = new Set(['earthquake', 'magnitude', 'bulldoze']);
```

Notes:
- Air Balloon item grounding deferred to doc 08
- `ability === 'levitate'` uses raw string compare, consistent with how abilities are handled everywhere

---

## Section 3: `effectFactories.ts` changes

**`setWeather`:**
```typescript
ctx.battle.field.weather = { type, turnsRemaining: turns, fromAbility: false };
return { events: [{ type: 'weather-started', data: { weather: type, turnsRemaining: turns } }] };
```

**`setTerrain`:**
```typescript
ctx.battle.field.terrain = { type, turnsRemaining: 5 };
return { events: [{ type: 'terrain-started', data: { terrain: type } }] };
```

**`trickRoom`:**
```typescript
if (ctx.battle.field.trickroom > 0) {
  ctx.battle.field.trickroom = 0;
  return { events: [{ type: 'trickroom-ended', data: {} }] };
}
ctx.battle.field.trickroom = 5;
return { events: [{ type: 'trickroom-started', data: {} }] };
```

**`gravity`:** Same toggle pattern → `gravity-started` / `gravity-ended`.

---

## Section 4: `effects.ts` — terrain status immunity

`applyStatus` gains an optional `field` param:

```typescript
export function applyStatus(
  pokemon: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean },
  field?: { terrain?: { type: TerrainType }; gravity: number },
): TurnResolveEvent | null {
  // Misty Terrain: grounded Pokémon immune to all status
  if (field?.terrain?.type === 'misty' && isGrounded(pokemon, types, field.gravity > 0)) {
    return null;
  }
  // Electric Terrain: grounded Pokémon immune to sleep
  if (status === 'slp' && field?.terrain?.type === 'electric' && isGrounded(pokemon, types, field.gravity > 0)) {
    return null;
  }
  // ... existing logic unchanged
}
```

All existing callers continue to compile — `field` is optional. The param is threaded from BattleEngine at these sites:
- Direct status move handler result
- Secondary status application (`applySecondaries`)
- Ability after-hit trigger (Static, Flame Body, etc.)
- Protect-contact variants (Baneful Bunker)
- Yawn → sleep application in `EffectEngine.runEndOfTurn`

---

## Section 5: `BattleEngine.endOfTurn` changes

New execution order:

```
1. Per-Pokémon EoT loop (existing: EffectEngine.runEndOfTurn + item hooks)
2. Weather residual damage pass        [new]
3. Terrain EoT heal pass               [new]
4. Field counter decrements + expiry   [expanded]
```

**Pass 2 — Weather residual:**
```typescript
if (s.field.weather?.type === 'sand' || s.field.weather?.type === 'snow') {
  const w = s.field.weather.type;
  for (const team of s.teams) for (const slot of team.slots) {
    const active = slot.party[slot.activePokemonIndex];
    if (!active || active.fainted) continue;
    const types = this.resolveEffectiveTypes(active);
    const immune =
      (w === 'sand' && types.some(t => ['Rock','Ground','Steel'].includes(t))) ||
      (w === 'snow' && types.includes('Ice'));
    if (!immune) {
      const chip = Math.floor(active.maxHp / 16);
      // deal chip damage, emit damage-dealt, emit faint if needed
    }
  }
}
```

**Pass 3 — Terrain EoT heal (Grassy):**
```typescript
if (s.field.terrain?.type === 'grassy') {
  const gravityActive = s.field.gravity > 0;
  for (const team of s.teams) for (const slot of team.slots) {
    const active = slot.party[slot.activePokemonIndex];
    if (!active || active.fainted) continue;
    const types = this.resolveEffectiveTypes(active);
    if (isGrounded(active, types, gravityActive)) {
      const heal = Math.floor(active.maxHp / 16);
      const actual = Math.min(heal, active.maxHp - active.currentHp);
      if (actual > 0) {
        active.currentHp += actual;
        events.push({ type: 'heal', data: { slotId: slot.slotId, amount: actual, remainingHp: active.currentHp, reason: 'grassy-terrain' } });
      }
    }
  }
}
```

**Pass 4 — Field counter decrements:**
```typescript
if (s.field.weather) {
  s.field.weather.turnsRemaining -= 1;
  if (s.field.weather.turnsRemaining <= 0) {
    events.push({ type: 'weather-ended', data: { weather: s.field.weather.type } });
    delete s.field.weather;
  }
}
if (s.field.terrain) {
  s.field.terrain.turnsRemaining -= 1;
  if (s.field.terrain.turnsRemaining <= 0) {
    events.push({ type: 'terrain-ended', data: { terrain: s.field.terrain.type } });
    delete s.field.terrain;
  }
}
if (s.field.trickroom > 0) {
  s.field.trickroom -= 1;
  if (s.field.trickroom === 0) events.push({ type: 'trickroom-ended', data: {} });
}
if (s.field.gravity > 0) {
  s.field.gravity -= 1;
  if (s.field.gravity === 0) events.push({ type: 'gravity-ended', data: {} });
}
```

---

## Section 6: `BattleEngine.buildActionOrder` — Trick Room

```typescript
const trickRoomActive = state.field.trickroom > 0;
return entries
  .sort((a, b) =>
    b.priority - a.priority ||
    (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
    Math.random() - 0.5
  )
  .map((e) => e.slotId);
```

Priority tiers are unaffected. Speed ties within a tier break randomly in both directions.

---

## Section 7: `BattleEngine.executeMove` — six combat hooks

In order of execution:

**Hook 1 — Gravity: block airborne moves** (after PP spend, before status/damage split):
```typescript
if (s.field.gravity > 0 && GRAVITY_BLOCKED_MOVES.has(move.id)) {
  events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'gravity' } });
  return { newState: s, events };
}
```

**Hook 2 — Weather accuracy + Gravity accuracy boost** (replaces `computeHitChance` block for damage moves):
```typescript
let hitChance = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
const weatherOverride = s.field.weather && WEATHER_ACCURACY[move.id]?.[s.field.weather.type];
if (weatherOverride === true) hitChance = 'always';
else if (typeof weatherOverride === 'number') hitChance = weatherOverride;
if (s.field.gravity > 0 && hitChance !== 'always') {
  hitChance = Math.min(100, Math.floor((hitChance as number) * 5 / 3));
}
```

**Hook 3 — Psychic Terrain priority block** (per-target, inside target loop, before damage):
```typescript
if (s.field.terrain?.type === 'psychic' && move.priority > 0) {
  if (isGrounded(target, defTypes, s.field.gravity > 0)) {
    events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'psychic-terrain', targetSlotId } });
    continue;
  }
}
```

**Hook 4 — Solar Beam/Blade half power in non-sun weather** (before `calcDamage`):
```typescript
let effectiveBasePower = move.basePower;
if (SOLAR_MOVES.has(move.id) && s.field.weather && s.field.weather.type !== 'sun') {
  effectiveBasePower = Math.floor(effectiveBasePower / 2);
}
```

**Hook 5 — Weather Ball type + power** (before `calcDamage`):
```typescript
let effectiveMoveType = move.type;
if (move.id === 'weatherball' && s.field.weather) {
  effectiveBasePower = 80;
  effectiveMoveType = WEATHER_BALL_TYPE[s.field.weather.type] ?? move.type;
}
```
`effectiveMoveType` replaces `move.type` in the STAB check, effectiveness lookup, and `calcDamage` call.

**Hook 6 — Terrain power modifiers** (folded into `otherModifiers` before `calcDamage`):
```typescript
const attackerGrounded = isGrounded(attacker, attackerTypes, s.field.gravity > 0);
const defenderGrounded = isGrounded(target, defTypes, s.field.gravity > 0);
const terrain = s.field.terrain?.type;
if (terrain === 'electric' && effectiveMoveType === 'Electric' && attackerGrounded) otherModifiers *= 1.5;
if (terrain === 'grassy'   && effectiveMoveType === 'Grass'    && attackerGrounded) otherModifiers *= 1.5;
if (terrain === 'grassy'   && GRASSY_TERRAIN_HALVED.has(move.id))                  otherModifiers *= 0.5;
if (terrain === 'misty'    && effectiveMoveType === 'Dragon'   && defenderGrounded) otherModifiers *= 0.5;
if (terrain === 'psychic'  && effectiveMoveType === 'Psychic'  && attackerGrounded) otherModifiers *= 1.5;
```

---

## Open questions deferred per spec

1. Primordial Sea / Desolate Land / Delta Stream — doc 08
2. Cloud Nine / Air Lock weather suppression — deferred
3. Air Balloon item grounding — doc 08
4. Terrain seeds (Misty Seed, etc.) — doc 08
5. Weather-summoning abilities (Drizzle, Drought, etc.) — doc 08

---

## Success criteria (from spec)

- Sunny Day sets `field.weather = { type: 'sun', turnsRemaining: 5 }`. Turn 5 end emits `weather-ended`.
- Fire move in sun deals ×1.5 damage vs baseline; Water move in sun deals ×0.5.
- Sandstorm chips non-Rock/Ground/Steel Pokémon for 1/16 max HP each turn.
- Electric Terrain prevents a grounded Pokémon from falling asleep.
- Electric move by grounded attacker in Electric Terrain deals ×1.5.
- Trick Room inverts speed order: slowest Pokémon moves first.
- Gravity makes Thunder Wave hit a Flying-type Pokémon (Ground immunity removed — via `isGrounded` returning true).
- Gravity accuracy boost: 70% accuracy move becomes `min(100, floor(70 * 5/3))` = 100%.
