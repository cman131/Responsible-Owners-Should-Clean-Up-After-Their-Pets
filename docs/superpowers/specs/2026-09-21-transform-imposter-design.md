# Transform Switch-Out Fix & Imposter Ability

## Summary

`transform` (the move) is already implemented in `registrations.ts` but has a bug: none of its effects (`stats`, `ability`, `typeOverride`, `moves`) are ever reverted when the transformed Pokémon switches out, and the `'transformed'` volatile marker isn't cleared either. **Imposter** is a pure data stub (`data/abilities.json`) with no hook logic at all — Ditto's signature ability doesn't do anything today.

This change:
1. Extracts Transform's mutation logic into a shared `applyTransform` helper.
2. Fixes the switch-out revert bug by snapshotting pre-transform state and restoring it.
3. Implements Imposter as an `onSwitchIn` ability hook that reuses the shared helper.

Client changes: none. The existing generic event-text fallbacks already render sensible log lines for both the `volatile-applied`/`'transformed'` case and the `ability-triggered` case (verified against `BattleContext.tsx:141` and `:369`).

## Change 1 — `originalForm` snapshot field

`packages/shared/src/types/battle.ts`, added to `PartyMember` (after `nature?: string;`):

```typescript
originalForm?: {
  stats: Stats;
  ability: string;
  typeOverride?: PokemonType[];
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
};
```

Mirrors the existing `batonPassData` pattern on `SlotState` (structured carry-over data living on state, not encoded into a `VolatileStatusEntry`). `exactOptionalPropertyTypes` note: this field is only ever set via assignment or removed via `delete`, never assigned `undefined`.

## Change 2 — `applyTransform` shared helper

New file: `packages/server/src/engine/transform.ts`

```typescript
import type { PartyMember, PokemonType, TurnResolveEvent } from '@poke-fighter/shared';

export function applyTransform(
  user: PartyMember,
  userSlotId: string,
  target: PartyMember,
  targetTypes: PokemonType[],
): TurnResolveEvent[] {
  const alreadyTransformed = user.volatileStatus.some(v => v.name === 'transformed');

  // Snapshot true original form once per stint, before the first transform.
  if (!alreadyTransformed) {
    user.originalForm = {
      stats: { ...user.stats },
      ability: user.ability,
      moves: user.moves.map(slot => ({ ...slot })) as [any, any, any, any],
      ...(user.typeOverride ? { typeOverride: [...user.typeOverride] } : {}),
    };
  }

  // Copy stats (not HP)
  user.stats = { ...target.stats, hp: user.stats.hp };

  // Copy stat boosts
  user.statBoosts = { ...target.statBoosts };

  // Copy ability
  user.ability = target.ability;

  // Copy effective types
  if (targetTypes.length > 0) {
    user.typeOverride = [...targetTypes];
  } else {
    delete user.typeOverride;
  }

  // Copy moves with PP capped at 5
  user.moves = target.moves.map(slot => ({
    moveId: slot.moveId,
    currentPp: Math.min(slot.currentPp, 5),
    maxPp: 5,
  })) as [any, any, any, any];

  if (!alreadyTransformed) {
    user.volatileStatus.push({ name: 'transformed' });
  }

  return [{ type: 'volatile-applied', data: { targetSlotId: userSlotId, volatile: 'transformed' } }];
}
```

Behavior preserved 1:1 from the current inline logic (same field copies, same PP cap, same event shape). The only addition is the `originalForm` snapshot, taken exactly once per transformation stint (subsequent transforms — e.g. re-using the Transform move against a new target — do not overwrite the snapshot, so switch-out always restores the *true* original form).

## Change 3 — `registrations.ts` transform handler becomes a thin wrapper

Replace the current inline body (`registrations.ts:1122-1159`) with:

```typescript
r.register('transform', (ctx) => {
  const target = ctx.targets[0];
  if (!target) {
    return { events: [{ type: 'move-failed', data: { moveId: 'transform', reason: 'no-target' } }] };
  }
  return { events: applyTransform(ctx.user, ctx.userSlotId, target, ctx.targetTypes[0] ?? []) };
});
```

No behavior change for the move itself; existing `metaMoves.test.ts` Transform suite should pass unmodified.

## Change 4 — Imposter ability hook

`packages/server/src/engine/abilities.ts`:

```typescript
export interface SwitchInResult {
  statBoostDeltas?: Partial<StatBoosts>;
  selfBoostDeltas?: Partial<StatBoosts>;
  traceAbilityId?: string;
  clearScreens?: boolean;
  setWeather?: { type: WeatherType; turnsRemaining: number; permanent?: boolean };
  transform?: true;   // NEW — Imposter
}
```

```typescript
imposter: {
  onSwitchIn: () => ({ transform: true }),
},
```

The hook itself stays declarative (matches every other `onSwitchIn` entry) — all the actual target lookup and mutation happens centrally in `applySwitchInResult`, same division of responsibility as Intimidate/Download/Trace.

## Change 5 — `BattleEngine.applySwitchInResult` — handle `transform`

New branch in `applySwitchInResult` (`BattleEngine.ts:2562+`), following the same team-index lookup pattern already used for `statBoostDeltas` (Intimidate):

```typescript
// Imposter: transform into the opposing active Pokémon
if (result.transform) {
  const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
  const foeTeamIndex = incomingTeamIndex === 0 ? 1 : 0;
  const foeTeam = s.teams[foeTeamIndex];
  const foeSlot = foeTeam?.slots[0];
  const foeMon = foeSlot?.party[foeSlot.activePokemonIndex];
  const foeBehindSub = foeMon?.volatileStatus.some(v => v.name === 'substitute') ?? false;
  if (foeMon && !foeMon.fainted && !foeBehindSub) {
    const foeTypes = this.resolveEffectiveTypes(foeMon);
    events.push(...applyTransform(incoming, slotId, foeMon, foeTypes));
    events.push({ type: 'ability-triggered', data: { slotId, ability: 'imposter', effect: 'transform' } });
  }
}
```

Fails silently (no events) if there's no live foe active or the foe is behind a Substitute — matches in-game Imposter behavior. Note: this makes Imposter *stricter* than the `transform` move (which still doesn't check Substitute) — that's an intentional, scoped decision, not a fix to the move's targeting rules generally.

## Change 6 — `BattleEngine.performSwitch` — revert on switch-out

In the existing "Switch-out cleanup" block (`BattleEngine.ts:2433-2443`), add the restore before the generic volatile-status filtering:

```typescript
if (outgoing) {
  if (outgoing.originalForm) {
    outgoing.stats = outgoing.originalForm.stats;
    outgoing.ability = outgoing.originalForm.ability;
    outgoing.moves = outgoing.originalForm.moves;
    if (outgoing.originalForm.typeOverride) {
      outgoing.typeOverride = outgoing.originalForm.typeOverride;
    } else {
      delete outgoing.typeOverride;
    }
    delete outgoing.originalForm;
    outgoing.volatileStatus = outgoing.volatileStatus.filter(v => v.name !== 'transformed');
  }
  outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
    !SWITCH_CLEAR_NAMES.has(v.name) &&
    !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
  );
  outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
  delete outgoing.lastMoveId;
  delete outgoing.tracedAbilityId;
  delete outgoing.lockedMoveId;
}
```

A Pokémon that never transformed has no `originalForm`, so this is a no-op for every other switch-out in the game — zero behavior change outside the Transform/Imposter path.

## Test Plan

| # | Description | Expected |
|---|-------------|----------|
| 1 | Transform move: use, then switch out | `stats`/`ability`/`typeOverride`/`moves` restored to pre-transform values; `'transformed'` volatile removed |
| 2 | Transform move: existing test suite (`metaMoves.test.ts`) | All pass unmodified |
| 3 | Quick Powder + Transform (`items-species-specific.test.ts`) | Still passes — `'transformed'` marker unchanged |
| 4 | Imposter: switch in opposite a live foe | Copies foe's stats (not HP), stat boosts, ability, type, moves (5 PP each); own HP/maxHp untouched |
| 5 | Imposter: switch in opposite a foe behind Substitute | No transformation; no `ability-triggered`/`volatile-applied` events |
| 6 | Imposter: switch in with no live foe active | No-op, no crash |
| 7 | Imposter: switch out after transforming, then switch back in without re-transforming | Fully restored to original form on switch-out |
| 8 | Imposter: switch out, foe changed, switch back in and re-transform | Snapshot still reflects the *original* (pre-first-transform) form, not the previous transformed form |
| 9 | Imposter copies foe's current stat boosts (not base 0) | Stat boosts match foe's boosts at moment of switch-in |

## Files Changed

- `packages/shared/src/types/battle.ts` — `originalForm` field on `PartyMember`
- `packages/server/src/engine/transform.ts` — new, `applyTransform` helper
- `packages/server/src/engine/registrations.ts` — `transform` move handler delegates to helper
- `packages/server/src/engine/abilities.ts` — `SwitchInResult.transform`, `imposter` hook registration
- `packages/server/src/engine/BattleEngine.ts` — `applySwitchInResult` transform branch; `performSwitch` revert-on-switch-out
- `packages/server/src/engine/__tests__/metaMoves.test.ts` — new switch-out-revert case for Transform
- `packages/server/src/engine/__tests__/abilities.test.ts` (or new `imposter.test.ts`) — Imposter test suite
