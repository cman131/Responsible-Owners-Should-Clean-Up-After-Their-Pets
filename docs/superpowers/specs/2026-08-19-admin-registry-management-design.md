# Admin Registry Management — Design Spec

**Date:** 2026-08-19  
**Status:** Approved

## Overview

Expand the Admin area to include a Registry panel for managing NPC and Player profiles. Each profile stores a name and a required Pokémon team (≥1 Pokémon, all 4 moves filled). The admin area gains a hub landing page and persistent session management so the login form is not shown on every visit.

---

## Architecture

### New Components

**`AdminRouter.tsx`**  
Owns `activeBattle` and `mode` state. Handles all routing once the admin is authenticated. `AdminShell` renders this after a successful auth check.

Routing logic:
```
activeBattle set      → <ControlPanel />           (overrides all other modes)
mode === null         → <HubPanel />
mode === 'setup'      → <SetupPanel onBack={...} />
mode === 'registry'   → <RegistryPanel onBack={...} />
```

**`HubPanel.tsx`**  
Landing page rendered when no mode is selected. Two large action tiles:
- **Battle Setup** → sets `mode = 'setup'`
- **Registry** → sets `mode = 'registry'`

**`RegistryPanel.tsx`**  
Manages NPC and Player CRUD. Owns its own sub-navigation state:
```
{ view: 'list', activeTab: 'npcs' | 'players' }
{ view: 'editor', type: 'npc' | 'player', profile: NpcProfile | PlayerProfile | null }
```
`null` profile means "new entry".

### Modified Components

**`AdminShell.tsx`**  
Adds session check on mount (see Session Management). Renders `<AdminRouter />` when authenticated instead of managing routing itself. No longer owns `activeBattle` or mode state.

**`SetupPanel.tsx`**  
Receives an `onBack: () => void` prop. Renders a "← Hub" back button that calls it. No other changes.

**`TeamBuilder.tsx`**  
Enhanced Pokémon search UX (see Pokémon Search Improvements).

---

## Session Management

`AdminShell` reads `poke_admin_session` from `localStorage` on mount:

```json
{ "token": "abc123", "expiresAt": 1234567890000 }
```

- `expiresAt > Date.now()` → call `connectAsAdmin(token)`, skip login form, render `<AdminRouter />`
- Missing or expired → show login form as before
- Successful login → write session to `localStorage` with TTL of **8 hours**, render `<AdminRouter />`

Session key: `poke_admin_session`. TTL constant defined at the top of `AdminShell.tsx`.

No explicit logout is in scope for this plan.

---

## Registry Panel

### List View

On mount, emits two socket requests:
```ts
socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } })
socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } })
```

Listens to `registry:data` events and updates local state for each resource.

Layout:
- Tab bar: **NPCs** | **Players**
- Per tab: count label, "+ New" button, scrollable list
- Each row: name, Pokémon count badge, **Edit** button, **Delete** button

Delete: emits `registry:delete-npc` or `registry:delete-player` with `{ profileId }`. Server responds with updated list via `registry:data`.

### Editor View

Navigated to when clicking Edit or New. The list is replaced by the full editor screen.

**Top bar:** "← Back to NPCs/Players" | "EDIT NPC / NEW PLAYER / etc." title | DISCARD + SAVE buttons

**Name field:**
- NPCs: `name` field
- Players: `displayName` field
- Required: non-empty string

**Team section:** `TeamBuilder` component with `initialTeam` pre-populated for edits, empty for new entries.

**Validation:** SAVE is disabled until:
- Name is non-empty
- Team has ≥1 Pokémon with all 4 move slots filled

**Save behavior:**

For NPC:
```ts
const profile: NpcProfile = {
  profileId: existing?.profileId ?? uuidv4(),
  name,
  team: {
    templateId: uuidv4(),
    name: `${name}'s Team`,
    pokemon: team,
    createdAt: new Date().toISOString(),
  },
  createdAt: existing?.createdAt ?? new Date().toISOString(),
};
socket.emit('admin:action', { type: 'registry:save-npc', data: { profile } });
```

For Player:
```ts
const profile: PlayerProfile = {
  profileId: existing?.profileId ?? uuidv4(),
  displayName: name,
  defaultTeam: {
    templateId: uuidv4(),
    name: `${name}'s Team`,
    pokemon: team,
    createdAt: new Date().toISOString(),
  },
  createdAt: existing?.createdAt ?? new Date().toISOString(),
};
socket.emit('admin:action', { type: 'registry:save-player', data: { profile } });
```

Server responds with `registry:data` containing the updated list. On receipt, navigate back to `view: 'list'`.

NPCs and Players share the same editor component; a `type` prop controls field labels and which socket event is emitted.

---

## Pokémon Search Improvements (TeamBuilder)

### `PokemonSearchDropdown` Component

Extracted from the current inline search in `TeamBuilder`. Replaces the plain `<input>` + raw results `<div>` with a proper dropdown.

**Behaviour:**
- Type ≥2 characters → emits `data:query { resource: 'pokemon', query }` → results appear in a styled dropdown below the input
- Each result row: `#<id> <displayName> [Type/Type]` with type-coloured badges
- Keyboard navigation: ↑/↓ moves highlight, Enter selects, Escape closes
- Clicking a result selects it

**On selection:**
- Populates the slot with defaults (level 50, first ability, empty moves, standard IVs, Hardy nature)
- Shows a compact species summary above the slot editor: name, types, base stat row (HP / Atk / Def / SpA / SpD / Spe)

### Move Inputs

Remain as plain text ID inputs for this plan. A move-search dropdown is explicitly out of scope.

---

## Data Flow Summary

| Action | Client emits | Server responds |
|--------|-------------|-----------------|
| Load list | `registry:list { resource }` | `registry:data { resource, data[] }` |
| Save NPC | `registry:save-npc { profile }` | `registry:data { resource: 'npcs', data[] }` |
| Delete NPC | `registry:delete-npc { profileId }` | `registry:data { resource: 'npcs', data[] }` |
| Save Player | `registry:save-player { profile }` | `registry:data { resource: 'players', data[] }` |
| Delete Player | `registry:delete-player { profileId }` | `registry:data { resource: 'players', data[] }` |

All existing server handlers are already implemented in `adminHandlers.ts`. No server changes required.

---

## Out of Scope

- Move search dropdown (move inputs stay as text IDs)
- Explicit admin logout
- Team template reuse across multiple NPCs/Players
- EV/IV editing UI (values stay at defaults: IVs 31, EVs 0)
- Ability selection dropdown (first ability auto-selected on species pick)
