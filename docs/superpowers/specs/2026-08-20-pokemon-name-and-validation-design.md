# Pokemon Name Field + Move Validation Relaxation

**Date:** 2026-08-20
**Status:** Approved

## Summary

Two related changes to how Pokémon are configured and displayed:

1. **Validation relaxation** — a Pokémon slot only needs at least 1 move filled (not all 4) to be considered valid for saving.
2. **Required nickname field** — every `PokemonSet` and `PartyMember` now carries a required `nickname: string` that defaults to the species display name, is editable in TeamBuilder (max 20 chars), and is shown in place of the species number everywhere battles reference a Pokémon by identity.

---

## Shared Types

### `packages/shared/src/types/registry.ts` — `PokemonSet`

Change `nickname?: string` to `nickname: string` (required).

### `packages/shared/src/types/battle.ts` — `PartyMember`

Change `nickname?: string` to `nickname: string` (required).

No other shared-type changes.

---

## Admin UI

### `TeamBuilder.tsx`

- `pickPokemon(species)` sets `nickname: species.displayName` on the new slot entry alongside `speciesId`, `level`, etc. This establishes the default.
- The slot editor gains a **NAME** input between the species summary and the Level field:
  - `value={team[selectedSlot]?.nickname ?? ''}` — falls back to empty string for legacy entries that predate this change
  - `maxLength={20}`
  - `onChange` calls `updateSlotField(selectedSlot, 'nickname', e.target.value)`
  - Same visual style as the existing Level/Nature inputs

### `ProfileEditor.tsx`

- `teamIsValid` check changes from `s.moves.every(Boolean)` → `s.moves.some(Boolean)`.
- Error message for an invalid team updates to: `"Add at least 1 Pokémon with at least 1 move."`.

---

## Server

### `BattleConfigurator.ts`

- Remove the `if (set.nickname !== undefined)` guard.
- Assign `member.nickname = set.nickname` unconditionally — TypeScript guarantees it is present.

### `BattleEngine.ts`

- In the `move-used` event emit, include the attacker's nickname: add `attackerName: attacker.nickname` to the event data dict alongside the existing `attackerSlotId` and `moveName` fields.

---

## Client — Battle Display

### `SwitchPanel.tsx`

- Replace `` `Species #${mon.speciesId} L${mon.level}` `` with `` `${mon.nickname} L${mon.level}` ``.

### `BattleContext.tsx` — `eventToText`

- `move-used` case: replace `String(event.data['attackerSlotId'])` with `String(event.data['attackerName'])`.

---

## Edge Cases

- **Legacy registry entries** (saved before this change, no `nickname` field): `TeamBuilder` renders `nickname ?? ''` so the input is blank rather than crashing. The user must fill it in before saving; `isValid` already requires `name.trim().length > 0` in `ProfileEditor`.
- **BattleConfigurator** receives `PokemonSet` from admin panel payloads. If an old payload arrives without `nickname`, the TypeScript type guarantees it was set by the caller; at runtime the engine assigns whatever string is present (could be `undefined` cast to string — acceptable for a dev-tools-only panel).
- **Empty move slots in battle** — moves with an empty `moveId` have `pp = 0` after `BattleConfigurator` builds them. `MovePanel` already disables `pp === 0` slots, so they are invisible to the player.

---

## Tests

- `packages/server/src/setup/__tests__/BattleConfigurator.test.ts` — `mockSet` must gain `nickname: 'Charizard'` (or any string) to satisfy the now-required field. No logic changes needed.
- `packages/client/src/admin/__tests__/ProfileEditor.test.tsx` — unaffected; mocks `TeamBuilder` entirely.
- `packages/client/src/admin/__tests__/MoveSearchDropdown.test.tsx` — unaffected.
- No new tests required for SwitchPanel or BattleContext changes (display-only, existing snapshots not in use).

---

## Files Touched

| File | Change |
|---|---|
| `packages/shared/src/types/registry.ts` | `nickname` required on `PokemonSet` |
| `packages/shared/src/types/battle.ts` | `nickname` required on `PartyMember` |
| `packages/client/src/admin/TeamBuilder.tsx` | Set default nickname on pick; add NAME input |
| `packages/client/src/admin/ProfileEditor.tsx` | Relax move validation to `some(Boolean)` |
| `packages/server/src/setup/BattleConfigurator.ts` | Unconditional nickname assignment |
| `packages/server/src/engine/BattleEngine.ts` | Add `attackerName` to `move-used` event |
| `packages/client/src/battle/overlays/SwitchPanel.tsx` | Show `mon.nickname` |
| `packages/client/src/battle/BattleContext.tsx` | Use `attackerName` in `eventToText` |
