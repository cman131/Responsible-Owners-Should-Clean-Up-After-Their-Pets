# Moves Audit — Design Spec

**Date:** 2026-09-15  
**Goal:** Identify every gap across the engine, UI, and data layers that would prevent a standard in-battle move from working correctly.

---

## Scope

### In scope
- All standard battle moves: physical, special, and status.
- Moves that appear in `data/moves.json`.

### Excluded
- Z-moves (e.g. `10000000voltthunderbolt`, any move with Z-Crystal mechanic)
- G-Max / Max moves (ids prefixed `max-` or `gmax-`)
- Mega-evolution-only signature moves that cannot appear on a standard team
- Moves that explicitly return `reason:'not-implemented'` in `registrations.ts` (currently `mefirst`, `doodle`) — these are known stubs, not gaps

---

## Definitions

A move is **covered** if it satisfies one of:

1. Has a handler registered in `packages/server/src/engine/registrations.ts`.
2. Is handled inline in `BattleEngine.executeMove` (Counter/Mirror Coat family, fixed-damage table, HP-halving set, Beat Up, Psywave, Spit Up, Endeavor, Final Gambit, Bide setup, OHKO family).
3. Is a physical/special move with no unique mechanics beyond the standard damage formula + secondaries pipeline (drain, recoil, flinch, status-on-hit, stat-on-hit, multi-hit, charge turn, binding).

A **gap** is any of:

| Gap type | Severity | Definition |
|---|---|---|
| `silent-fail` | High | Status move whose effectId has no handler → returns `move-failed reason:unimplemented` |
| `wrong-behavior` | High | Physical/special move with unique mechanic not captured by secondaries or inline cases (e.g. double power on revenge hit, self-damage on miss, type change on use) |
| `data-error` | Medium | Field in moves.json that would cause misbehavior: wrong `target`, missing/zero `basePower` on a damaging move, unrecognized `secondaries.kind` |
| `ui-missing` | Medium | Missing battle-log string for a `TurnResolveEvent` type, or missing `lockedReason` label in ActionPanel |
| `ui-targeting` | Low | `MoveTarget` value in moves.json that the targeting classifier routes incorrectly or silently |

---

## Methodology

### Engine Pass 1 — Status move handler check

1. Read `data/moves.json`, filter to `category === "status"`.
2. Collect all distinct `effectId` values.
3. Read `registrations.ts`, extract all `r.register('...')` keys.
4. Diff: effectIds with no matching key → **`silent-fail`** gap.

### Engine Pass 2 — Physical/special unique-mechanic check

Inspect each non-status move's `effectId` against the following known special-mechanic patterns (not covered by the standard pipeline):

| Pattern | Example moves | Currently handled? |
|---|---|---|
| Double power on revenge hit (slower this turn) | Avalanche, Revenge | No |
| Double power if user was damaged this turn | Payback | No |
| Crash damage on miss | High Jump Kick, Jump Kick | No |
| Self-faint recoil (not standard recoil) | Final Gambit | Yes (inline) |
| Power doubles vs minimized target — non-standard set | Stomp, Steamroller | Yes (inline) |
| Changes the user's type on use | Burn Up, Double Shock | No |
| Power scales with friendship | Return, Frustration | No |
| Power scales with HP remaining | Reversal, Flail | No |
| Power doubles on each sequential use | Rollout, Ice Ball | No |
| Locks user into move for 2–3 turns | Thrash, Outrage, Petal Dance | Partial (chargeVolatile exists) |
| Self-KO without dealing damage | Explosion (blocked by Damp) | No |
| Type determined by held plate/memory | Judgment, Multi-Attack | No |
| Poltergeist fails without item | Poltergeist | No |
| Pyro Ball/Sparkling Aria always-thaw check | Sparkling Aria | Yes (ALWAYS_THAW_MOVES) |
| Low Kick / Grass Knot weight-based power | Low Kick, Grass Knot | Yes (dynamicPower) |
| Bolt Beak / Fishious Rend double power if faster | Bolt Beak, Fishious Rend | No |

Flag any unhandled pattern as **`wrong-behavior`**.

### Engine Pass 3 — Data integrity check

Scan `data/moves.json` for:
- Damaging moves (`category !== "status"`) where `basePower === 0` and no inline special case exists.
- `target` value not in the engine's known target set: `normal`, `any`, `self`, `allySide`, `allyTeam`, `allyOrSelf`, `adjacentAllyOrSelf`, `allAdjacent`, `allAdjacentFoes`, `foeSide`, `all`, `scripted`.
- `secondaries` entries with `kind` not in: `status`, `stat`, `flinch`, `confusion`, `drain`, `recoil`, `charge`, `multihit`, `ohko`, `volatile`, `binding`.
- Moves whose `accuracy` is `true` (always hits) but which should have a real accuracy value, or vice versa.

Flag issues as **`data-error`**.

### UI Pass 1 — Battle log completeness

In `BattleContext.tsx`, verify every `TurnResolveEvent` type has a non-empty display string. Event types to verify (from `events.ts`):

```
move-used, move-blocked, move-failed, damage-dealt, heal, status-applied,
status-cured, stat-change, weather-started, weather-ended, terrain-started,
terrain-ended, side-condition-set, trickroom-started, trickroom-ended,
gravity-started, gravity-ended, volatile-applied, volatile-cured,
terastallize, faint, miss, crit, endure-survived, screen-ended,
screen-broken, hazard-damage, hazard-cleared, court-change, pokemon-switched,
focus-sash, item-consumed, status-blocked, ability-triggered, pivot-skipped,
wonderroom-started, wonderroom-ended, magicroom-started, magicroom-ended,
fairylock-started, iondeluge-started, move-note
```

Also verify `volatileAppliedText` and `volatileCuredText` have strings for all volatile names the engine applies.

Flag missing/silent entries as **`ui-missing`**.

### UI Pass 2 — ActionPanel targeting and locked states

1. Confirm `LOCKED_LABELS` in `ActionPanel.tsx` covers all values of `ActionRequestPayload['lockedReason']`.
2. Confirm `classifyTarget` in `targeting.ts` maps every `MoveTarget` value used in moves.json to one of `auto | choose | listed | labeled`.
3. Flag any `MoveTarget` value not explicitly handled as **`ui-targeting`**.

---

## Output Format

The implementation produces a gap report document at:

```
docs/superpowers/specs/2026-09-15-moves-audit-report.md
```

Structured as:

```markdown
## Engine Gaps
| Move ID | effectId | Gap type | Severity | Notes |

## UI Gaps
| Component | Gap description | Affected events / volatiles |

## Data Gaps
| Move ID | Field | Issue |
```

Gaps are sorted by severity within each section (High → Medium → Low).

---

## Out of Scope for This Audit

- Ability hooks (covered by a separate audit)
- Item hooks (covered by a separate audit)
- Multi-battle / doubles targeting edge cases beyond what `classifyTarget` already handles
- Battle log cosmetic polish (exact wording of strings)
