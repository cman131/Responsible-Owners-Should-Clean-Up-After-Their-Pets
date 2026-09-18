# Design: Battle Settings — Level Cap

**Date:** 2026-09-17
**Tech-debt ref:** `docs/tech-debt/battle-setup/battle-settings-minimal.md`

## Problem

`BattleSettingsStep` only offers a label field. There is no way to configure a level cap through the UI, so all Pokémon battle at their native levels regardless of format requirements.

## Goal

Add an optional `levelCap` field to the battle-start flow. When set, the server clamps every Pokémon's effective level (and thus all computed stats) to the cap during `BattleConfigurator.build()`.

## Scope

Initial addition only: label + level cap. Future settings (format, weather, timer) are out of scope.

## Architecture

The change touches four files across client and server. No shared type changes are needed — `AdminActionPayload.data` is `Record<string, unknown>`, so the socket event type is unaffected.

### Client

**`packages/client/src/admin/steps/BattleSettingsStep.tsx`**

- Add `levelCap` state (`number`, default `0` = no cap).
- Widen `onStart` prop type: `(settings: { label: string; levelCap?: number }) => void`
- Add a `<select>` below the label input with options: *None (use as-is)*, *Level 50*, *Level 100*.
- On submit, pass `levelCap > 0 ? levelCap : undefined`.

**`packages/client/src/admin/SetupPanel.tsx`**

- Update `handleStart` signature to `{ label: string; levelCap?: number }`.
- Include `levelCap` in the `start-battle` socket payload alongside `battleId`, `label`, and `teams`.

### Server

**`packages/server/src/socket/handlers/adminHandlers.ts`**

- Destructure `levelCap` (type `number | undefined`) from `payload.data` in the `'start-battle'` case.
- Pass it through to `configurator.build()`.

**`packages/server/src/setup/BattleConfigurator.ts`**

- Add `levelCap?: number` to `BuildConfig`.
- In `buildPartyMember`, compute:
  ```ts
  const effectiveLevel = this.config.levelCap
    ? Math.min(set.level, this.config.levelCap)
    : set.level;
  ```
- Use `effectiveLevel` for `member.level`, the `calcAllStats` call, and both `member.maxHp` / `member.currentHp`.

## Data Flow

```
BattleSettingsStep (levelCap select)
  → onStart({ label, levelCap })
  → SetupPanel.handleStart
  → socket.emit('admin:action', { type: 'start-battle', data: { ..., levelCap } })
  → adminHandlers: destructure levelCap
  → BattleConfigurator.build({ ..., levelCap })
  → buildPartyMember: effectiveLevel = min(set.level, levelCap)
  → calcAllStats({ ..., level: effectiveLevel })
```

## Testing

New unit tests in `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`:

1. **No cap:** `build()` without `levelCap` → `member.level` equals `set.level`, stats match direct `calcAllStats` call.
2. **Cap below set level:** `levelCap: 50`, Pokémon at level 100 → `member.level === 50`, stats equal `calcAllStats` at level 50.
3. **Cap above set level:** `levelCap: 100`, Pokémon at level 50 → `member.level === 50` (no upscaling).

## What This Does NOT Do

- Does not upscale Pokémon above their set level.
- Does not add format, weather, timer, or spectator settings (future work).
- Does not modify shared event types.
