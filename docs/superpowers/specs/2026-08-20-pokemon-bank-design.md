# Pokemon Bank Design

**Date:** 2026-08-20  
**Status:** Approved

## Overview

Each player profile gains an unlimited Pokemon bank — a persistent roster of pokemon beyond their active 6-pokemon team. The bank lets players accumulate pokemon over time and swap their active team in and out. The admin manages both the bank and team through the player editor in the Registry.

## Data Model

One field added to `PlayerProfile` in `packages/shared/src/types/registry.ts`:

```ts
export interface PlayerProfile {
  profileId: string;
  displayName: string;
  defaultTeam?: TeamTemplate;  // active team (up to 6)
  bank?: PokemonSet[];         // unlimited bank storage — NEW
  createdAt: string;
}
```

- `bank` is optional (absent = empty bank); treated as `[]` everywhere it's read
- No new socket event types needed — `registry:save-player` already sends the full profile, so the bank persists for free through the existing `RegistryStore.savePlayer()` path
- `NpcProfile` and `TeamTemplate` are unchanged

## Component Architecture

### New Files

**`packages/client/src/admin/PokemonSlotEditor.tsx`**  
Extracted from `TeamBuilder` — handles editing a single `PokemonSet`. Contains the species search dropdown, sprite display, and all stat/move editing fields.

```ts
interface Props {
  value: Partial<PokemonSet>;
  onChange: (updated: Partial<PokemonSet>) => void;
}
```

**`packages/client/src/admin/PlayerProfileEditor.tsx`**  
Full-screen player editor. Replaces `ProfileEditor` for the `type === 'player'` case. Structure:
- Name field at top (always visible)
- Tab bar: `TEAM (n/6)` | `BANK (n)`
- Team tab: existing `TeamBuilder` component (unchanged interface)
- Bank tab: new `BankTab` component

**`packages/client/src/admin/BankTab.tsx`**  
The bank management view. See Bank Tab section below.

### Changed Files

**`packages/client/src/admin/TeamBuilder.tsx`**  
The slot editor section (nickname, level, nature, moves, sprite) is replaced internally with `PokemonSlotEditor`. External interface (`onTeamSaved`, `initialTeam`) is unchanged.  
Each occupied slot's editor panel gains a **"→ SEND TO BANK"** button at the bottom. Clicking it moves that `PokemonSet` to the bank and clears the slot. The button is wired via a new optional `onSendToBank?: (pokemon: PokemonSet) => void` prop — when absent, the button is not rendered (preserves use in battle setup and NPC editor).

**`packages/client/src/admin/ProfileEditor.tsx`**  
Becomes a thin router: renders `PlayerProfileEditor` when `type === 'player'`, keeps existing NPC editor behaviour otherwise (or the NPC path is extracted to `NpcProfileEditor.tsx` — implementation detail).

**`packages/client/src/admin/steps/SlotAssignmentStep.tsx`**  
`SlotConfig` gains `defaultTeam?: PokemonSet[]`. When a saved player is selected from the dropdown, their full profile is already in memory from the `registry:data` event, so `defaultTeam` is populated from `profile.defaultTeam?.pokemon` at selection time — no extra server request.

**`packages/client/src/admin/steps/TeamBuilderStep.tsx`**  
Each slot's `initialTeam` is seeded from `slot.defaultTeam` when present. The admin can freely edit before starting the battle; the pre-fill is a starting point only. NPC slots are unaffected.

## Bank Tab UX

### Layout

A sprite grid of cards — one card per bank pokemon, wrapping to fill available width. A **"+ ADD TO BANK"** button sits in the tab header.

### Card Display

Each card shows:
- Pokemon sprite (static, 48×48, pixelated)
- Nickname (or species name)
- Level
- Primary type badge

### Card Interaction — Quick Action Popup

Clicking a card selects it (highlighted border) and shows a small popup adjacent to the card with three buttons:

| Button | Action |
|---|---|
| **EDIT** | Opens `PokemonSlotEditor` modal pre-filled with this pokemon's data |
| **→ MOVE TO TEAM** | Moves to the first empty team slot; greyed out + disabled when team is full (6/6) |
| **REMOVE** | Removes from bank (no confirmation — admin tool, low stakes) |

Clicking elsewhere dismisses the popup without action.

### Add to Bank Modal

"+ ADD TO BANK" opens `PokemonSlotEditor` in a modal with a blank pokemon. On save, the new `PokemonSet` is appended to `bank`. On cancel, nothing changes.

### Edit Modal

Same modal as Add, but pre-filled with the selected pokemon's data. On save, the entry is updated in place.

### Modal Structure

```
┌─────────────────────────────────────┐
│ EDIT — CHARIZARD          [Cancel]  │
│─────────────────────────────────────│
│  [PokemonSlotEditor — full fields]  │
│─────────────────────────────────────│
│                            [SAVE]   │
└─────────────────────────────────────┘
```

Dark overlay, consistent with existing admin panel styling.

## Team Tab Changes

The Team tab wraps the existing `TeamBuilder` with one addition: each occupied slot's editor panel shows a **"→ SEND TO BANK"** button. Clicking it:
1. Appends the pokemon to `bank`
2. Clears that team slot

The `TeamBuilder`'s existing `onTeamSaved` callback fires after the slot is cleared, keeping the save flow unchanged.

## Battle Setup Pre-fill (Step 3 — Build Teams)

When a saved player is assigned to a battle slot in SlotAssignmentStep, their `defaultTeam` travels with the slot config into TeamBuilderStep. TeamBuilderStep seeds `initialTeam` from this data when present.

- Pre-fill is editable — admin can adjust the team before starting the battle
- NPC slots continue to use an empty TeamBuilder as before
- Players without a `defaultTeam` start with an empty builder (same as current behaviour)

## Save Flow

All popup actions (MOVE TO TEAM, REMOVE, Edit modal SAVE) update local React state only — nothing is sent to the server until the admin clicks the top-level **SAVE** button in the `PlayerProfileEditor` header. That button emits `registry:save-player` with the full updated `PlayerProfile` (including both `defaultTeam` and `bank`). No partial saves per action. Navigating away without saving discards unsaved changes.

## Out of Scope

- Players viewing or managing their own bank (admin-only tool)
- Bank pokemon gaining EXP or levelling up from battles (bank is inert storage)
- Drag-and-drop reordering within the bank
- Filtering or searching the bank
