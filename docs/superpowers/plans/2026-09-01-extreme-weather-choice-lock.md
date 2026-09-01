# Extreme Weather, Solar Beam, Choice Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three reviewer-flagged issues: extreme weather (harsh-sun/heavy-rain/strong-winds) nullify/boost effects in the damage pipeline, Solar Beam not recognising harsh-sun, and choice lock being set before move execution.

**Architecture:** Six sequential tasks touching four files: `damage.ts`, `fieldState.ts`, `BattleEngine.ts`, `BattleRoom.ts`. Tasks 1–2 are pure unit-level fixes; Tasks 3–5 layer changes into `BattleEngine.ts` in safe increments; Task 6 is a two-file rename/move.

**Tech Stack:** TypeScript, Vitest, Node.js — `packages/server` (engine + socket).

**Test commands** (run from `packages/server/`):
- All tests: `npm test`
- Single file: `npx vitest run src/engine/__tests__/<file>.ts`
- Typecheck: `npm run typecheck`

**Damage reference** (L50, Atk=Def=100, `Math.random()=0.5` → factor 0.93):
- BP80 neutral, rng=1.0: **37 hp** (`floor(floor((floor(22×80×100)/100)/50)+2)`)
- BP90 neutral: **38 hp** (after rng=0.93: `floor(41×0.93)`)
- Thunderbolt (BP90) Electric vs Fire/Flying 2×: **76 hp** (`floor(38×2)`)
- Thunderbolt Electric vs Fire/Flying under strong-winds 1×: **38 hp**

---

### Task 1: damage.ts — harsh-sun and heavy-rain boost modifiers

**Files:**
- Modify: `packages/server/src/engine/damage.ts`
- Modify: `packages/server/src/engine/__tests__/damage.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/server/src/engine/__tests__/damage.test.ts`:

```typescript
describe('calcDamage — extreme weather modifiers', () => {
  it('Fire move in harsh-sun deals 1.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Fire',
    };
    const harshSun: DamageInput = { ...base, weather: 'harsh-sun' };
    expect(calcDamage(harshSun).damage).toBe(Math.floor(calcDamage(base).damage * 1.5));
  });

  it('Water move in heavy-rain deals 1.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Water',
    };
    const heavyRain: DamageInput = { ...base, weather: 'heavy-rain' };
    expect(calcDamage(heavyRain).damage).toBe(Math.floor(calcDamage(base).damage * 1.5));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/damage.test.ts
```

Expected: 2 new tests fail.

- [ ] **Step 3: Implement the fix**

In `packages/server/src/engine/damage.ts`, extend the weather block (lines 41–46):

```typescript
  if (weather && moveType) {
    if (weather === 'sun'       && moveType === 'Fire')  dmg = Math.floor(dmg * 1.5);
    if (weather === 'sun'       && moveType === 'Water') dmg = Math.floor(dmg * 0.5);
    if (weather === 'rain'      && moveType === 'Water') dmg = Math.floor(dmg * 1.5);
    if (weather === 'rain'      && moveType === 'Fire')  dmg = Math.floor(dmg * 0.5);
    if (weather === 'harsh-sun' && moveType === 'Fire')  dmg = Math.floor(dmg * 1.5);
    if (weather === 'heavy-rain'&& moveType === 'Water') dmg = Math.floor(dmg * 1.5);
  }
```

(No halving lines for harsh-sun Water or heavy-rain Fire — those moves fail before reaching damage calc, handled in Task 4.)

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/damage.test.ts
```

Expected: all damage tests pass.

- [ ] **Step 5: Typecheck**

```
cd packages/server && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/damage.ts packages/server/src/engine/__tests__/damage.test.ts
git commit -m "feat: add harsh-sun fire boost and heavy-rain water boost to calcDamage"
```

---

### Task 2: fieldState.ts — WEATHER_ACCURACY and WEATHER_BALL_TYPE entries

**Files:**
- Modify: `packages/server/src/engine/fieldState.ts`
- Modify: `packages/server/src/engine/__tests__/fieldState.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the `describe('lookup maps', ...)` block in `packages/server/src/engine/__tests__/fieldState.test.ts`:

```typescript
  it('WEATHER_ACCURACY: thunder always hits in heavy-rain', () => {
    expect(WEATHER_ACCURACY['thunder']?.['heavy-rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder is 50% in harsh-sun', () => {
    expect(WEATHER_ACCURACY['thunder']?.['harsh-sun']).toBe(50);
  });

  it('WEATHER_ACCURACY: hurricane always hits in heavy-rain', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['heavy-rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: hurricane is 50% in harsh-sun', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['harsh-sun']).toBe(50);
  });

  it('WEATHER_BALL_TYPE maps harsh-sun to Fire', () => {
    expect(WEATHER_BALL_TYPE['harsh-sun']).toBe('Fire');
  });

  it('WEATHER_BALL_TYPE maps heavy-rain to Water', () => {
    expect(WEATHER_BALL_TYPE['heavy-rain']).toBe('Water');
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/fieldState.test.ts
```

Expected: 6 new tests fail.

- [ ] **Step 3: Implement the fix**

In `packages/server/src/engine/fieldState.ts`, update both constants:

```typescript
export const WEATHER_ACCURACY: Partial<Record<string, Partial<Record<WeatherType, number | true>>>> = {
  thunder:   { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 },
  blizzard:  { snow: true },
  hurricane: { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 },
};

export const WEATHER_BALL_TYPE: Partial<Record<WeatherType, PokemonType>> = {
  sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice',
  'harsh-sun': 'Fire', 'heavy-rain': 'Water',
};
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/fieldState.test.ts
```

Expected: all fieldState tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/fieldState.ts packages/server/src/engine/__tests__/fieldState.test.ts
git commit -m "feat: add harsh-sun/heavy-rain entries to WEATHER_ACCURACY and WEATHER_BALL_TYPE"
```

---

### Task 3: BattleEngine.ts — Solar Beam / Solar Blade in harsh-sun

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `packages/server/src/engine/__tests__/abilities.test.ts`:

```typescript
describe('Solar Beam — harsh-sun interactions', () => {
  it('Solar Beam fires immediately in harsh-sun (no charge turn)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Move fires immediately — damage event is present
    expect(events.some(e => e.type === 'damage-dealt')).toBe(true);
    // No charging volatile left on the attacker
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'charging-solarbeam')).toBe(false);
  });

  it('Solar Beam power is NOT halved in harsh-sun (same damage as no weather)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const noWeather = make1v1State();
    noWeather.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    // Pre-charge so it fires immediately in no-weather
    noWeather.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'charging-solarbeam' });
    const { newState: ns1 } = engine.resolveTurn(noWeather, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const harshSun = make1v1State();
    harshSun.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    harshSun.field.weather = { type: 'harsh-sun', turnsRemaining: 999, fromAbility: true, permanent: true };
    const { newState: ns2 } = engine.resolveTurn(harshSun, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Same HP remaining means same damage → same base power (not halved in harsh-sun)
    expect(ns2.teams[1]!.slots[0]!.party[0]!.currentHp)
      .toBe(ns1.teams[1]!.slots[0]!.party[0]!.currentHp);
  });

  it('Solar Beam power IS halved in heavy-rain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Fire immediately from pre-charged state in no weather (full 120 BP)
    const noWeather = make1v1State();
    noWeather.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    noWeather.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'charging-solarbeam' });
    const { newState: ns1 } = engine.resolveTurn(noWeather, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Fire immediately from pre-charged state in heavy-rain (halved 60 BP)
    const heavyRain = make1v1State();
    heavyRain.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    heavyRain.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'charging-solarbeam' });
    heavyRain.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const { newState: ns2 } = engine.resolveTurn(heavyRain, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Heavy-rain version deals less damage (halved BP)
    expect(ns2.teams[1]!.slots[0]!.party[0]!.currentHp)
      .toBeGreaterThan(ns1.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the fix**

In `packages/server/src/engine/BattleEngine.ts`, find the charge-turn block (around line 316–328) and update the `isSun` check:

```typescript
    // Charge-turn check
    const chargeSec = secs.find(sec => sec.kind === 'charge');
    if (chargeSec) {
      const isSun = s.field.weather?.type === 'sun' || s.field.weather?.type === 'harsh-sun';
      const hasCharge = attacker.volatileStatus.some(v => v.name === chargeSec.chargeVolatile);
      if (!hasCharge && !isSun) {
        attacker.volatileStatus.push({ name: chargeSec.chargeVolatile });
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: chargeSec.chargeVolatile, note: 'charging' } });
        return { newState: s, events };
      }
      if (hasCharge) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== chargeSec.chargeVolatile);
      }
    }
```

Then find the Solar Beam power-halving check (around line 334–336) and update the weather condition:

```typescript
    // Solar Beam / Solar Blade: half power in any non-sun weather
    if (SOLAR_MOVES.has(move.id) && s.field.weather && !['sun', 'harsh-sun'].includes(s.field.weather.type)) {
      effectiveBasePower = Math.floor(effectiveBasePower / 2);
    }
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: all tests pass (including pre-existing ones).

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "fix: Solar Beam skips charge turn and keeps full power in harsh-sun"
```

---

### Task 4: BattleEngine.ts — Move nullification under extreme weather

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `packages/server/src/engine/__tests__/abilities.test.ts`:

```typescript
describe('Extreme weather — move nullification', () => {
  it('Fire move fails under heavy-rain (Primordial Sea)', () => {
    const state = make1v1State();
    // p1 uses flamethrower (Fire) vs p2
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower = Fire
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'heavy-rain')).toBe(true);
    // No damage dealt by the nullified move
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('Water move fails under harsh-sun (Desolate Land)', () => {
    const state = make1v1State();
    // p1 uses surf (Water) vs p2
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // surf = Water
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'harsh-sun')).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('non-Water/Fire moves still work under heavy-rain', () => {
    const state = make1v1State();
    // p1 uses airslash (Flying) — should not be nullified
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'airslash', currentPp: 15, maxPp: 15 };
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'damage-dealt')).toBe(true);
    expect(events.some(e => e.type === 'move-failed')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the fix**

In `packages/server/src/engine/BattleEngine.ts`, locate the comment `// Move type and base power overrides` (around line 331). After the Weather Ball block (around line 342), add the nullification check **before** the `for (const targetSlotId of targetSlotIds)` loop:

```typescript
    // Extreme-weather move nullification (must come after effectiveMoveType is resolved)
    if (s.field.weather) {
      const wt = s.field.weather.type;
      if (
        (wt === 'heavy-rain' && effectiveMoveType === 'Fire') ||
        (wt === 'harsh-sun'  && effectiveMoveType === 'Water')
      ) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: wt } });
        return { newState: s, events };
      }
    }
```

Place this block between the Weather Ball type change block and the `for (const targetSlotId of targetSlotIds)` loop.

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: nullify Fire moves in heavy-rain and Water moves in harsh-sun"
```

---

### Task 5: BattleEngine.ts — Strong Winds type effectiveness clamp

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `packages/server/src/engine/__tests__/abilities.test.ts`:

```typescript
describe('Strong Winds (Delta Stream) — type effectiveness clamp', () => {
  // Default fixture: both Pokémon are Charizard (speciesId=6, Fire/Flying).
  // Thunderbolt (Electric) is 2× vs Flying, 1× vs Fire → combined 2×.
  // Under strong-winds, 2× against a Flying target → clamped to 1×.

  it('Electric 2× vs Flying becomes 1× under strong-winds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    state.field.weather = { type: 'strong-winds', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // 38 damage (1× effective) → 100 - 38 = 62
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(62);
  });

  it('Electric is 2× vs Flying without strong-winds (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // 76 damage (2× effective) → 100 - 76 = 24
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(24);
  });

  it('Weakness Policy does NOT trigger under strong-winds (clamped to 1×)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'weakness-policy';
    state.field.weather = { type: 'strong-winds', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // No item-consumed event for weakness-policy (not super-effective after clamp)
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'weakness-policy')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: 2 tests fail (control test passes since it tests existing behavior).

- [ ] **Step 3: Implement the fix**

In `packages/server/src/engine/BattleEngine.ts`, inside the `for (const targetSlotId of targetSlotIds)` loop, find the line that declares `const effectiveness` (around line 422):

```typescript
      const effectiveness = this.data.getCombinedEffectiveness(effectiveMoveType, effectiveDefTypes);
```

Change `const` to `let`, then add the strong-winds clamp immediately after the `effectiveness === 0` early-return:

```typescript
      let effectiveness = this.data.getCombinedEffectiveness(effectiveMoveType, effectiveDefTypes);
      if (effectiveness === 0) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Strong Winds: super-effective moves against Flying-type targets are reduced
      if (s.field.weather?.type === 'strong-winds' && defTypes.includes('Flying')) {
        if (effectiveness >= 4) effectiveness /= 2;
        else if (effectiveness > 1) effectiveness = 1;
      }
```

The rest of the loop (immunity checks, damage, Weakness Policy) all read `effectiveness` — they will automatically use the clamped value.

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite to catch regressions**

```
cd packages/server && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Strong Winds type effectiveness clamp for Flying-type targets"
```

---

### Task 6: Choice lock timing — move to post-move-used in BattleEngine

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/engine/__tests__/constraints.test.ts`
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write failing engine tests**

Append a new describe block to `packages/server/src/engine/__tests__/constraints.test.ts`:

```typescript
describe('Choice lock timing', () => {
  it('sets lockedMoveId on the attacker after a successful move with choice-band', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'choice-band';

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.lockedMoveId).toBe('flamethrower');
  });

  it('does NOT set lockedMoveId when Pokemon is fully asleep (move blocked before firing)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'choice-band';
    p1.status = 'slp';
    p1.volatileStatus.push({ name: 'sleep', counter: 1 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // selected but blocked
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.lockedMoveId).toBeUndefined();
  });

  it('sets lockedMoveId for gorilla-tactics after a successful move', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.ability = 'gorilla-tactics';

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.teams[0]!.slots[0]!.party[0]!.lockedMoveId).toBe('flamethrower');
  });
});
```

- [ ] **Step 2: Run engine tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/constraints.test.ts
```

Expected: 3 new tests fail (lock is not set yet by the engine).

- [ ] **Step 3: Write failing BattleRoom tests**

Append a new describe block to `packages/server/src/socket/__tests__/BattleRoom.test.ts`:

```typescript
describe('Choice lock enforcement', () => {
  it('enforces choice lock when lockedMoveId is already set in state', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'choice-band';
    p1.lockedMoveId = 'flamethrower'; // already locked from previous turn
    const room = new BattleRoom({ initialState: state });

    // Try to use a different move (index 1 = airslash)
    const result = room.submitAction('slot-a1', { type: 'move', moveIndex: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('choice-locked');
  });

  it('allows using the locked move when choice-locked', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'choice-band';
    p1.lockedMoveId = 'flamethrower';
    const room = new BattleRoom({ initialState: state });

    // Using the locked move (index 0 = flamethrower) is fine
    const result = room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(true);
  });

  it('lockedMoveId is set in state after first move resolves via BattleRoom', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'choice-band';
    const room = new BattleRoom({ initialState: state });

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 }); // flamethrower
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0 }); // resolves turn

    expect(room.getState().teams[0]!.slots[0]!.party[0]!.lockedMoveId).toBe('flamethrower');
  });
});
```

- [ ] **Step 4: Run BattleRoom tests to confirm they fail**

```
cd packages/server && npx vitest run src/socket/__tests__/BattleRoom.test.ts
```

Expected: the 3 new tests fail (lock is currently set at submit time, not after turn resolution).

- [ ] **Step 5: Add CHOICE_LOCK_ITEMS constant and lock-set in BattleEngine.ts**

In `packages/server/src/engine/BattleEngine.ts`, add a module-level constant near the other top-level sets (around line 22):

```typescript
const CHOICE_LOCK_ITEMS = new Set(['choice-band', 'choice-specs', 'choice-scarf']);
```

Then, in `executeMove`, immediately after the `move-used` event push (around line 225):

```typescript
    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, moveId: move.id, moveName: move.name } });

    // Choice lock — set here (after move-used, before hit/miss) so a pre-move block (sleep, par) doesn't lock
    if (!attacker.lockedMoveId) {
      if (CHOICE_LOCK_ITEMS.has(attacker.heldItem ?? '') || effectiveAbilityId(attacker) === 'gorilla-tactics') {
        attacker.lockedMoveId = move.id;
      }
    }
```

- [ ] **Step 6: Remove lock-set block from BattleRoom.ts**

In `packages/server/src/socket/BattleRoom.ts`, remove lines 124–128 (the "First move with choice item — set the lock" block):

```typescript
        // First move with choice item — set the lock
        if (isChoiceLocked && !active.lockedMoveId) {
          const moveSlot = active.moves[action.moveIndex];
          if (moveSlot) active.lockedMoveId = moveSlot.moveId;
        }
```

Keep the enforcement block (lines 118–123) exactly as-is:

```typescript
        if (isChoiceLocked && active.lockedMoveId) {
          const moveSlot = active.moves[action.moveIndex];
          if (moveSlot && moveSlot.moveId !== active.lockedMoveId) {
            return { ok: false, reason: 'choice-locked' };
          }
        }
```

- [ ] **Step 7: Run all tests**

```
cd packages/server && npm test
```

Expected: all tests pass, including the 6 new choice-lock tests and all pre-existing tests.

- [ ] **Step 8: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/socket/BattleRoom.ts packages/server/src/engine/__tests__/constraints.test.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "fix: move choice lock to post-move-used in BattleEngine; enforce via state in BattleRoom"
```
