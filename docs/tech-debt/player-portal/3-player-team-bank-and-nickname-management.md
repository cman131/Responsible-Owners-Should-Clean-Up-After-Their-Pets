# Player Portal: Team/Bank Reorder, Party Swap, and Nickname Editing

## State

New

## Summary

Players need to rearrange their party, move Pokémon between party and bank, and rename Pokémon — without access to the full admin editing capabilities. The existing admin components (`TeamBuilder`, `BankTab`, `PokemonSlotEditor`) do too much: they allow adding, removing, and fully editing every Pokémon field. This plan builds restricted player-facing team and bank views inside the portal that support only the permitted operations, wires a "Save Changes" action to the server, and restricts the server-side save to reject any changes to locked fields (stats, moves, ability, level, species).

## Problem Details

**File:** `packages/client/src/admin/BankTab.tsx:68-76`

```typescript
<button onClick={() => onEdit(index)} style={popBtn('#2980b9')}>✏ EDIT</button>
<button
  onClick={() => !teamFull && onMoveToTeam(pokemon, index)}
  ...
>→ MOVE TO TEAM</button>
<button onClick={() => onRemove(index)} style={popBtn('#c0392b')}>✕ REMOVE</button>
```

The bank card popup includes full edit and remove actions. The player view must omit both; only move-to-team and rename-nickname should be available.

**File:** `packages/client/src/admin/TeamBuilder.tsx`

The full `TeamBuilder` renders `PokemonSlotEditor`, which exposes every stat, move, ability, and species field. A player-scoped team view must show only the Pokémon's name, level, and sprite, with reorder controls and a rename action.

**File:** `packages/server/src/socket/handlers/playerPortalHandlers.ts` (from plan `player-access-key-and-portal-socket-infrastructure.md`)

The `player:portal-save` handler must validate that no locked fields changed. The player sends `{ team: PokemonSet[], bank: PokemonSet[] }`; the server loads the stored profile and verifies that for each Pokémon (matched by a stable identifier), only `nickname` and `heldItem` differ — `speciesId`, `level`, `ability`, `moves`, `evs`, `ivs`, `nature`, `teraType` must be byte-for-byte identical to what the server has stored. If any locked field changed, reject with `player:portal-error`.

## Impact

- Players cannot self-manage team composition between sessions, requiring admin involvement for every swap.
- Without server-side field locking, a player could technically modify their Pokémon stats through a crafted socket payload.
- Reordering party slots is not currently possible even for admins without full re-editing.

## Suggested Fix

1. Create `packages/client/src/player/PlayerTeamView.tsx`:
   - Renders a vertical list of up to 6 Pokémon slots with a sprite, nickname, and level label.
   - Each slot has UP / DOWN reorder buttons (disabled at boundaries) and a RENAME button.
   - Each slot has a "→ BANK" button to move the Pokémon to the bank (only if bank exists or can grow; no delete path).
   - No stats, moves, ability, or species controls.

2. Create `packages/client/src/player/PlayerBankTab.tsx`:
   - Renders a grid of bank Pokémon cards (sprite, nickname, level) matching the visual style of `BankTab.tsx`.
   - Card popup shows only: RENAME and → PARTY (disabled when party is full at 6).
   - No EDIT or REMOVE options.
   - Reorder via drag handles or UP/LEFT arrows (keep it simple — positional swap buttons are fine).

3. Create `packages/client/src/player/NicknameModal.tsx`:
   - A small modal with a single `<input>` pre-filled with the current nickname.
   - SAVE and CANCEL buttons. On save, calls a callback with the new nickname string.
   - Shared between `PlayerTeamView` and `PlayerBankTab`.

4. `PlayerPortalPage.tsx` holds `localTeam: PokemonSet[]` and `localBank: PokemonSet[]` as draft state, initialized from `profile.defaultTeam?.pokemon` and `profile.bank` on auth. All mutations (reorder, swap, rename) update only this local state.

5. Add a "SAVE CHANGES" button and a "DISCARD" button to the portal shell. SAVE emits `player:portal-save` with `{ profileId, team: localTeam, bank: localBank }`. On receiving `player:portal-data` in response, update the canonical profile state and show a brief success indicator. On `player:portal-error`, show the error message inline.

6. In `playerPortalHandlers.ts`, on `player:portal-save`: load the stored profile from `db.players.list()`, find the stored Pokémon for each entry in the incoming `team` and `bank` (matched by `speciesId` + `nickname` or a UUID if added to `PokemonSet`), and verify that no locked field changed. If validation passes, call `db.players.save()` with the updated profile and emit `player:portal-data` with the fresh profile.

## Related Files

- `packages/client/src/pages/PlayerPortalPage.tsx`
- `packages/client/src/player/PlayerTeamView.tsx` (new)
- `packages/client/src/player/PlayerBankTab.tsx` (new)
- `packages/client/src/player/NicknameModal.tsx` (new)
- `packages/client/src/admin/BankTab.tsx` (pattern reference)
- `packages/client/src/admin/TeamBuilder.tsx` (pattern reference)
- `packages/server/src/socket/handlers/playerPortalHandlers.ts`
- `packages/shared/src/types/registry.ts`
