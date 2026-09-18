# Tech Debt: Move-to-Team UX Issues in PlayerProfileEditor

## State

Complete

Two related bugs in the "Move to Team" flow in `PlayerProfileEditor`. Both manifest when the admin moves a Pokémon from the bank to the team, and both can be addressed in the same implementation pass.

---

## 1 — "Move to Team" Doesn't Switch to the Team Tab

### Summary

Clicking "→ MOVE TO TEAM" in the bank popup moves the Pokémon to the team array but leaves the user on the Bank tab with no visual confirmation. The user must manually switch to the Team tab to see the result.

### Location

- `packages/client/src/admin/PlayerProfileEditor.tsx` (handleMoveToTeam, line 27–31)
- `packages/client/src/admin/BankTab.tsx` (handleMoveToTeam, line 50–54)

### Root Cause

`handleMoveToTeam` updates state (`setTeam`, `setBank`, `setTeamKey`) but does not call `setTab('team')`. The active tab stays on `'bank'`:

```tsx
function handleMoveToTeam(pokemon: PokemonSet) {
  if (team.length >= 6) return;
  const next = [...team, pokemon];
  setTeam(next);
  setBank((prev) => prev.filter((p) => p !== pokemon));
  setTeamKey((k) => k + 1);
  // missing: setTab('team')
}
```

### Impact

The Pokémon card just disappears from the bank, which may look like an accidental delete rather than a successful move.

### Suggested Fix

Pass `setTab` down to the handler (it's already in scope in `PlayerProfileEditor`):

```tsx
function handleMoveToTeam(pokemon: PokemonSet) {
  if (team.length >= 6) return;
  const next = [...team, pokemon];
  setTeam(next);
  setBank((prev) => prev.filter((p) => p !== pokemon));
  setTeamKey((k) => k + 1);
  setTab('team');   // ← switch to team tab
}
```

---

## 2 — Moving a Pokémon from Bank Resets the Selected Team Slot

### Summary

When a Pokémon is moved from the bank to the team, `teamKey` is incremented to force a `TeamBuilder` remount. This remount always resets `selectedSlot` to `0`, even if the user was previously editing a different slot.

### Location

- `packages/client/src/admin/PlayerProfileEditor.tsx` (teamKey, handleMoveToTeam)
- `packages/client/src/admin/TeamBuilder.tsx` (selectedSlot initial state)

### Root Cause

`TeamBuilder` initializes `selectedSlot` as `useState(0)`. When `PlayerProfileEditor` increments `teamKey`, React tears down and remounts the component:

```tsx
// PlayerProfileEditor.tsx
const [teamKey, setTeamKey] = useState(0);

function handleMoveToTeam(pokemon: PokemonSet) {
  // ...
  setTeamKey((k) => k + 1);  // forces remount → resets selectedSlot to 0
}

<TeamBuilder key={teamKey} initialTeam={team} ... />
```

The remount was introduced to force `TeamBuilder` to pick up the new `initialTeam` value, since `TeamBuilder` uses `useState(initialTeam)` internally.

### Impact

If the admin is editing slot 3 and switches to the bank to add a Pokémon to slot 4, then moves it to the team, they end up back on slot 1. Especially disorienting when moving multiple bank Pokémon in sequence.

### Suggested Fix

The cleanest fix is to make `TeamBuilder` a controlled component so the `key` remount is no longer needed:

```tsx
// TeamBuilder becomes controlled:
interface Props {
  team: Partial<PokemonSet>[];
  onTeamChange: (team: Partial<PokemonSet>[]) => void;
  onSendToBank?: (pokemon: PokemonSet) => void;
}
```

`PlayerProfileEditor` owns the team array and passes it as a prop. This eliminates `teamKey` entirely and preserves `selectedSlot` across external changes.

If a full refactor is out of scope, a minimal fix is to pass the desired initial slot into `TeamBuilder` so the remount lands on the newly added Pokémon:

```tsx
<TeamBuilder
  key={teamKey}
  initialTeam={team}
  initialSelectedSlot={team.length - 1}  // land on the newly added slot
  ...
/>
```
