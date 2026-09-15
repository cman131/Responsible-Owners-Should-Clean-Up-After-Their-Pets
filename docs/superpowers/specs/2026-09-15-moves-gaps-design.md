# Moves Gap Fixes — Design Spec
**Date:** 2026-09-15
**Audit source:** `docs/superpowers/specs/2026-09-15-moves-audit-report.md`

---

## Overview

Addresses all open gaps identified in the moves audit: 21 engine gaps (dynamicPower stubs, missing handlers, lock mechanics) + 4 UI text gap areas + 1 data gap. Pivot moves (U-turn, Volt Switch, Flip Turn) were verified as already implemented at `BattleEngine.ts:1733`; they are excluded from this spec.

Work is divided into four sequential implementation clusters:

| # | Cluster | Files |
|---|---------|-------|
| 1 | dynamicPower fixes | `dynamicPower.ts`, `BattleEngine.ts`, `shared/types/battle.ts`, `data/moves.json` |
| 2 | Missing handlers | `registrations.ts`, `BattleEngine.ts` |
| 3 | Lock mechanics | `registrations.ts`, `BattleEngine.ts`, `shared/types/battle.ts` |
| 4 | UI text | `packages/client/src/battle/BattleContext.tsx` |

---

## Cluster 1 — dynamicPower fixes

### 1.1 Extend `MonInput` and `FieldInput`

Add optional fields to the interfaces in `dynamicPower.ts`:

```typescript
interface MonInput {
  // ... existing fields ...
  movedThisTurn?: boolean;      // true if this Pokémon already moved this turn (for payback/avalanche)
  tookDamageThisTurn?: boolean; // true if this Pokémon took HP damage earlier this turn (for assurance)
}

interface FieldInput {
  // ... existing fields ...
  allyFaintedTeamIndex?: number; // 0 or 1 — index of team that had an ally faint last turn (for retaliate)
}

interface MoveInput {
  // ... existing fields ...
  currentPp?: number; // current PP remaining in the move slot (for trumpcard)
}
```

### 1.2 BattleEngine caller changes

In `BattleEngine.executeMove`, before calling `resolvePower(move, attackerInput, targetInput, fieldInput)`:

- **movedThisTurn**: set `targetInput.movedThisTurn = movedSlotIds.has(targetSlotId)`
- **tookDamageThisTurn**: set `targetInput.tookDamageThisTurn = target.volatileStatus.some(v => v.name === 'damaged-this-turn')`
- **allyFaintedTeamIndex**: read from `s.lastTurnFaintedTeamIndex` (new BattleState field)
- **currentPp**: for `move.id === 'trumpcard'`, find the move slot on attacker and set `moveInput.currentPp = slot.currentPp`
- **fasterThanTarget**: for `boltbeak` / `fishiousrend`, compute speed comparison (with stat boosts + Trick Room) and set `attackerInput.fasterThanTarget` (see §2.4)

Add the `damaged-this-turn` volatile to the target in the damage-dealt block:
```typescript
// After hpDamageTaken > 0:
if (!target.volatileStatus.some(v => v.name === 'damaged-this-turn')) {
  target.volatileStatus.push({ name: 'damaged-this-turn' });
}
```

Clear `damaged-this-turn` volatiles for all active Pokémon at the **start** of each turn (before resolving any actions). Add a rule to `volatileClearRules.ts` or handle inline in `resolveTurn`.

### 1.3 BattleState — lastTurnFaintedTeamIndex

Add to `BattleState` in `packages/shared/src/types/battle.ts`:
```typescript
lastTurnFaintedTeamIndex?: number;
```

At the **end** of `resolveTurn`, scan events for `faint` events and record the team index of the fainting Pokémon's team. At the **start** of the next `resolveTurn`, reset this field to `undefined` (after snapshotting it into the field input).

### 1.4 dynamicPower resolvers

Replace all stubs with correct implementations:

**payback** — doubles if the target has already moved this turn:
```typescript
payback: (move, _attacker, target) =>
  target.movedThisTurn ? move.basePower * 2 : move.basePower,
```

**avalanche** — same condition as payback:
```typescript
avalanche: (move, _attacker, target) =>
  target.movedThisTurn ? move.basePower * 2 : move.basePower,
```

**assurance** — doubles if the target took damage earlier this turn:
```typescript
assurance: (move, _attacker, target) =>
  target.tookDamageThisTurn ? move.basePower * 2 : move.basePower,
```

**retaliate** — doubles if an ally on the attacker's team fainted last turn:
```typescript
retaliate: (move, attacker, _target, field) => {
  // field.allyFaintedTeamIndex must match the attacker's team index
  // BattleEngine fills field.attackerTeamIndex for this check
  return field.allyFaintedTeamIndex !== undefined
    && field.allyFaintedTeamIndex === (field as any).attackerTeamIndex
    ? move.basePower * 2 : move.basePower;
},
```
*(Note: pass `attackerTeamIndex` via FieldInput, or compute within BattleEngine before calling resolvePower.)*

**echoedvoice** — power scales +40 per consecutive use (capped at 200):
```typescript
echoedvoice: (move, attacker) => {
  const v = (attacker.volatileStatus as { name: string; counter?: number }[])
    .find(v => v.name === 'echoedvoice-active');
  const n = v?.counter ?? 1;
  return Math.min(200, move.basePower * n);
},
```
The `echoedvoice-active` volatile is set/incremented in BattleEngine after each use of Echoed Voice, and cleared when the attacker uses any other move.

**rollout / iceball** — power doubles per turn in a 5-turn sequence:
```typescript
rollout: (move, attacker) => {
  const v = (attacker.volatileStatus as { name: string; counter?: number }[])
    .find(v => v.name === 'rollout-active');
  const n = v?.counter ?? 1;
  return move.basePower * Math.pow(2, n - 1);
},
iceball: (move, attacker) => {
  const v = (attacker.volatileStatus as { name: string; counter?: number }[])
    .find(v => v.name === 'iceball-active');
  const n = v?.counter ?? 1;
  return move.basePower * Math.pow(2, n - 1);
},
```

**trumpcard** — power based on remaining PP (200 / 80 / 60 / 50 / 40):
```typescript
trumpcard: (move) => {
  const pp = move.currentPp ?? 1;
  if (pp <= 1) return 200;
  if (pp === 2) return 80;
  if (pp === 3) return 60;
  if (pp === 4) return 50;
  return 40;
},
```

### 1.5 data/moves.json — trumpcard

`trumpcard` basePower stays at `0` as a sentinel that signals PP-based resolution. No data change needed; the `trumpcard` resolver in dynamicPower ignores `move.basePower` entirely.

---

## Cluster 2 — Missing handlers

All additions go in `registrations.ts` using `r.register(id, custom(...))`.

### 2.1 burnup

Strips the user's Fire type after dealing damage. The handler runs post-damage (move is physical/special, so the handler is registered as an effectId handler that fires for the Fire-type check only — see note below).

Since burnup/doubleshock are damaging moves, they cannot use the status-move handler pipeline. Instead, **BattleEngine.executeMove** handles them inline after the damage block:

```typescript
const TYPE_STRIPPING_MOVES: Record<string, PokemonType> = {
  burnup: 'Fire',
  doubleshock: 'Electric',
};
const stripType = TYPE_STRIPPING_MOVES[move.id];
if (stripType && totalDamage > 0 && !attacker.fainted) {
  const currentTypes = this.resolveEffectiveTypes(attacker);
  if (currentTypes.includes(stripType)) {
    attacker.typeOverride = currentTypes.filter(t => t !== stripType);
    if (attacker.typeOverride.length === 0) attacker.typeOverride = ['Normal']; // edge case: sole type stripped
    events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'type-changed' } });
  }
}
```

If the user is not the appropriate type, emit `move-failed: wrong-type` before the damage loop.

### 2.2 poltergeist

Inline check in `BattleEngine.executeMove` before the damage block:

```typescript
if (move.id === 'poltergeist') {
  if (!target.heldItem) {
    events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-item' } });
    continue; // skip this target
  }
}
```

### 2.3 highjumpkick / jumpkick — crash damage on miss

`CRASH_MOVE_IDS = new Set(['highjumpkick', 'jumpkick'])`

In `BattleEngine.executeMove`, in the miss branch (currently just emits `miss` and returns early), add crash handling for these moves:

```typescript
if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
  events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
  if (CRASH_MOVE_IDS.has(move.id)) {
    const crash = Math.floor(attacker.maxHp / 2);
    const actual = Math.min(crash, attacker.currentHp);
    attacker.currentHp -= actual;
    events.push({ type: 'damage-dealt', data: { source: 'crash', slotId: attackerSlotId, damage: actual, remainingHp: attacker.currentHp } });
    if (attacker.currentHp <= 0) {
      attacker.fainted = true;
      attacker.currentHp = 0;
      events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
    }
  }
  return { newState: s, events };
}
```

Also apply crash if the target used protect (in the protect-blocked `continue` branch inside the target loop).

### 2.4 boltbeak / fishiousrend — faster-user double power

These are damaging moves so we use `dynamicPower.ts`. Add `fasterThanTarget?: boolean` to `MonInput`. BattleEngine computes this before calling `resolvePower`:

```typescript
// effective speed (with boosts, trick room already handled externally)
const attSpd = getEffectiveStat(attacker.stats.spe, attacker.statBoosts.spe, 'spe');
const defSpd = getEffectiveStat(target.stats.spe, target.statBoosts.spe, 'spe');
const trickRoom = s.field.trickroom > 0;
const fasterThanTarget = trickRoom ? attSpd <= defSpd : attSpd >= defSpd;
attackerInput.fasterThanTarget = fasterThanTarget;
```

Resolvers:
```typescript
boltbeak: (move, attacker) =>
  attacker.fasterThanTarget ? move.basePower * 2 : move.basePower,
fishiousrend: (move, attacker) =>
  attacker.fasterThanTarget ? move.basePower * 2 : move.basePower,
```

### 2.5 judgment / multiattack — item-based type

These damaging moves need to override the effective move type before the damage calculation. BattleEngine adds an inline pre-damage type override:

```typescript
const PLATE_TYPE_MAP: Record<string, PokemonType> = {
  'flame-plate': 'Fire', 'splash-plate': 'Water', 'zap-plate': 'Electric',
  'meadow-plate': 'Grass', 'icicle-plate': 'Ice', 'fist-plate': 'Fighting',
  'toxic-plate': 'Poison', 'earth-plate': 'Ground', 'sky-plate': 'Flying',
  'mind-plate': 'Psychic', 'insect-plate': 'Bug', 'stone-plate': 'Rock',
  'spooky-plate': 'Ghost', 'draco-plate': 'Dragon', 'dread-plate': 'Dark',
  'iron-plate': 'Steel', 'pixie-plate': 'Fairy',
};
const MEMORY_TYPE_MAP: Record<string, PokemonType> = {
  'fire-memory': 'Fire', 'water-memory': 'Water', 'electric-memory': 'Electric',
  'grass-memory': 'Grass', 'ice-memory': 'Ice', 'fighting-memory': 'Fighting',
  'poison-memory': 'Poison', 'ground-memory': 'Ground', 'flying-memory': 'Flying',
  'psychic-memory': 'Psychic', 'bug-memory': 'Bug', 'rock-memory': 'Rock',
  'ghost-memory': 'Ghost', 'dragon-memory': 'Dragon', 'dark-memory': 'Dark',
  'steel-memory': 'Steel', 'fairy-memory': 'Fairy',
};

if (move.id === 'judgment') {
  effectiveMoveType = PLATE_TYPE_MAP[attacker.heldItem ?? ''] ?? 'Normal';
}
if (move.id === 'multiattack') {
  effectiveMoveType = MEMORY_TYPE_MAP[attacker.heldItem ?? ''] ?? 'Normal';
}
```

### 2.6 naturepower

Registered as a **status-move handler** (it has `category: status` in moves.json). The handler resolves to a sub-move based on terrain:

```typescript
const NATUREPOWER_MOVE: Record<string, string> = {
  electric: 'thunderbolt',
  grassy: 'energyball',
  misty: 'moonblast',
  psychic: 'psychic',
};
r.register('naturepower', custom((ctx) => {
  const terrain = ctx.battle.field.terrain?.type;
  const subMoveId = terrain ? (NATUREPOWER_MOVE[terrain] ?? 'triattack') : 'triattack';
  return { events: executeSubMove(subMoveId, ctx) };
}));
```

---

## Cluster 3 — Lock mechanics

### 3.1 Volatile structure

Four new named volatiles on `PartyMember.volatileStatus`:

| Name | moveId | counter meaning |
|------|--------|-----------------|
| `outrage-active` | `'outrage'` | turns remaining (2 or 3, counts down) |
| `petaldance-active` | `'petaldance'` | turns remaining (2 or 3, counts down) |
| `thrash-active` | `'thrash'` | turns remaining (2 or 3, counts down) |
| `rollout-active` | `'rollout'` | hit index (1–5, counts up) |
| `iceball-active` | `'iceball'` | hit index (1–5, counts up) |
| `echoedvoice-active` | — | consecutive-use count (1–5, counts up) |

### 3.2 Constraint enforcement

In `BattleEngine.executeMove`, at the constraint-check phase (immediately after sleep/paralysis/freeze checks), add:

```typescript
const lockVolatile = attacker.volatileStatus.find(v =>
  ['outrage-active', 'petaldance-active', 'thrash-active',
   'rollout-active', 'iceball-active'].includes(v.name)
);
if (lockVolatile && move.id !== lockVolatile.moveId) {
  // Override the action to use the locked move
  const lockedMoveData = this.data.getMove(lockVolatile.moveId!);
  if (lockedMoveData) {
    move = lockedMoveData;
    // Re-resolve the move slot for PP purposes
  }
}
```

If the user cannot move (sleep proc, paralysis full-para, freeze) while a lock volatile is active:
- For outrage/petaldance/thrash: clear the volatile, apply `confusion` volatile (same path as a normal confusion application)
- For rollout/iceball: clear the volatile without confusion

### 3.3 Post-damage lock volatile management

In `BattleEngine.executeMove`, after damage is dealt successfully, in a new `LOCK_MOVE_IDS` block:

```typescript
const THRASH_LOCK_MOVES = new Set(['outrage', 'petaldance', 'thrash']);
const ROLLOUT_LOCK_MOVES = new Set(['rollout', 'iceball']);

if (THRASH_LOCK_MOVES.has(move.id)) {
  let v = attacker.volatileStatus.find(v => v.name === `${move.id}-active`);
  if (!v) {
    const turns = Math.random() < 0.5 ? 2 : 3; // use this.rng()
    v = { name: `${move.id}-active`, moveId: move.id, counter: turns };
    attacker.volatileStatus.push(v);
    events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: `${move.id}-active` } });
  }
  v.counter!--;
  if (v.counter! <= 0) {
    attacker.volatileStatus = attacker.volatileStatus.filter(x => x !== v);
    events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: `${move.id}-active` } });
    // Apply confusion
    const confuseEvent = applyVolatile(attacker, attackerSlotId, attackerSlotId, 'confusion');
    if (confuseEvent) events.push(confuseEvent);
  }
}

if (ROLLOUT_LOCK_MOVES.has(move.id)) {
  let v = attacker.volatileStatus.find(v => v.name === `${move.id}-active`);
  if (!v) {
    v = { name: `${move.id}-active`, moveId: move.id, counter: 1 };
    attacker.volatileStatus.push(v);
  } else {
    v.counter!++;
  }
  if (v.counter! >= 5) {
    attacker.volatileStatus = attacker.volatileStatus.filter(x => x !== v);
    events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: `${move.id}-active` } });
  }
}

if (move.id === 'echoedvoice') {
  let v = attacker.volatileStatus.find(v => v.name === 'echoedvoice-active');
  if (!v) {
    attacker.volatileStatus.push({ name: 'echoedvoice-active', counter: 1 });
  } else {
    v.counter = Math.min(5, (v.counter ?? 1) + 1);
  }
}
```

**Clearing echoedvoice-active:** In `executeMove`, when the attacker uses any move other than `echoedvoice`, clear the `echoedvoice-active` volatile.

### 3.4 volatileClearRules

The lock volatiles must NOT be cleared by the standard end-of-turn volatile clearing. Ensure `volatileClearRules.ts` does not include these names.

The `damaged-this-turn` volatile IS cleared at turn start (add to volatileClearRules with `clearOnTurnStart: true` or handle inline in `resolveTurn`).

---

## Cluster 4 — UI text

All changes are in `packages/client/src/battle/BattleContext.tsx`.

### 4.1 `volatileAppliedText` additions

```typescript
case 'infatuation':        return `${slotId} fell in love!`;
case 'yawn':               return `${slotId} began to doze off!`;
case 'nightmare':          return `${slotId} fell into a nightmare!`;
case 'focusenergy':        return `${slotId} is getting pumped!`;
case 'laser-focus':        return `${slotId} is concentrating intensely!`;
case 'imprison':           return `${slotId} sealed the opponent's moves!`;
case 'magic-coat':         return `${slotId} shrouded itself with a magic coat!`;
case 'snatch':             return `${slotId} is waiting to snatch a move!`;
case 'dragon-cheer':       return `${slotId} received a Dragon Cheer!`;
case 'foresight':          return `${slotId} was identified!`;
case 'miracle-eye':        return `${slotId} can no longer evade Psychic moves!`;
case 'electrify':          return `${slotId}'s moves were electrified!`;
case 'octolock':           return `${slotId} can no longer escape!`;
case 'minimize':           return `${slotId} minimized!`;
case 'geomancy-charge':    return `${slotId} is absorbing power!`;
case 'transformed':        return `${slotId} transformed!`;
case 'power-trick':        return `${slotId} switched its Attack and Defense!`;
case 'psych-up':           return `${slotId} psyched itself up!`;
case 'charging-solarbeam': return `${slotId} absorbed light!`;
case 'outrage-active':
case 'petaldance-active':
case 'thrash-active':      return `${slotId} began thrashing about!`;
// mimic, sketch: already return '' (move ID in data field would need more context) — keep silent
// type-changed: keep silent (move handler messages are sufficient)
```

### 4.2 `volatileCuredText` additions

```typescript
case 'lock-on':    return `${slotId} is no longer taking aim!`;
case 'powder':     return `${slotId} is no longer covered in powder!`;
case 'power-trick': return `${slotId}'s Attack and Defense returned to normal!`;
case 'outrage-active':
case 'petaldance-active':
case 'thrash-active': return `${slotId} became confused due to fatigue!`;
```

### 4.3 `status-cured` — full status map

Replace the current `status === 'slp'`-only guard:

```typescript
case 'status-cured': {
  const status = String(event.data['status']);
  const name = String(event.data['pokemonName'] ?? event.data['slotId']);
  const textMap: Record<string, string> = {
    slp: `${name} woke up!`,
    brn: `${name}'s burn healed!`,
    par: `${name} was cured of paralysis!`,
    frz: `${name} thawed out!`,
    psn: `${name} was cured of its poisoning!`,
    tox: `${name} was cured of its poisoning!`,
  };
  const text = textMap[status] ?? '';
  if (text) entries.push({ text, delay: 600 });
  break;
}
```

### 4.4 `MOVE_NOTE_TEXT` additions

Extend the static map:

```typescript
'item-bestowed':             'An item was bestowed!',
'item-recycled':             'The item was recycled!',
'ability-swapped':           'The two Pokémon swapped abilities!',
'ability-copied':            'The ability was copied!',
'ability-entrained':         'The ability was entrained!',
'ability-changed-simple':    "The target's ability became Simple!",
'ability-changed-insomnia':  "The target's ability became Insomnia!",
'guard-split':               'Defense and Sp. Def were averaged!',
'power-split':               'Attack and Sp. Atk were averaged!',
'power-shift':               'Attack and Defense were swapped!',
'ally-switched':             'The ally switched positions!',
'after-you':                 'The target will move next!',
```

For `pp-reduced-by-N`, add a prefix check in the `move-note` handler:

```typescript
case 'move-note': {
  const note = String(event.data['note']);
  let text = MOVE_NOTE_TEXT[note] ?? '';
  if (!text && note.startsWith('pp-reduced-by-')) {
    const n = note.replace('pp-reduced-by-', '');
    text = `Its PP was reduced by ${n}!`;
  }
  if (!text) text = note; // raw fallback
  if (text) entries.push({ text, delay: 600 });
  break;
}
```

---

## Testing strategy

Each cluster maps to existing test file scopes:

| Cluster | Primary test files |
|---------|-------------------|
| 1 — dynamicPower | `__tests__/dynamicPower.test.ts`, `__tests__/dynamicPower.integration.test.ts` |
| 2 — Missing handlers | `__tests__/registrations`-adjacent test, `__tests__/specialDamage.test.ts`, `__tests__/BattleEngine.test.ts` |
| 3 — Lock mechanics | New `__tests__/lockMoves.test.ts`, plus `__tests__/constraints.test.ts` |
| 4 — UI text | `packages/client/src/battle/__tests__/BattleContext.test.ts` |

Each cluster: write/extend failing tests first (TDD), then implement.

---

## Out of scope

- Defense Curl bonus for Rollout (doubles power when Defense Curl was used prior)
- Trump Card interaction with Pressure (opponent's Pressure draining PP changes the PP count used for power)
- Boltbeak/Fishiousrend equal-speed tie behavior (treat as not-faster for simplicity)
- Z-moves, G-Max/Max moves (excluded from audit)
- `mefirst`, `doodle` (known stubs, excluded from audit)
