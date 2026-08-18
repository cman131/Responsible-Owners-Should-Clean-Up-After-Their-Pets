---
name: pokemon-battler-design
description: Full system design for Poke Fighter — a multiplayer 2D Pokémon battle web app with Fire Red visuals, team-vs-team format, Pokémon Showdown-level mechanics, and admin control panel.
metadata:
  type: project
---

# Poke Fighter — System Design

**Date:** 2026-08-18  
**Status:** Approved  
**Epic:** Multiplayer 2D Pokémon Battler

---

## 1. Overview

Poke Fighter is a browser-based multiplayer Pokémon battle game with Fire Red / Leaf Green visuals. It supports team-vs-team battles where each player controls one Pokémon on the field at a time (with a full party in reserve), against any number of opposing players or NPCs. There is no adventure or overworld — the product is the battle experience only.

The system is designed for **local intranet use** (R1). Players and the admin all open the app in a browser on the same network. No accounts, no public hosting, no competitive rules.

---

## 2. System Architecture

### 2.1 Monorepo Structure

```
poke-fighter/
├── packages/
│   ├── shared/      # TypeScript types, event schemas, Pokémon data schemas
│   ├── server/      # Node.js + Socket.io, battle engine, file persistence
│   └── client/      # Vite + React shell + Phaser 3 battle scene
├── data/            # Static JSON — all Gen 9 Pokémon, moves, abilities, items
└── .env             # ADMIN_TOKEN (shared local secret)
```

Package manager: **pnpm workspaces**. All packages import from `@poke-fighter/shared` for typed event contracts and data schemas.

### 2.2 Deployment

The server runs as a plain `node` process on a host machine accessible on the local network. Players and the admin open `http://<host>:<port>` in any modern browser. No install, no native client.

### 2.3 Principles

- **Server-authoritative:** All battle state lives on the server. Clients send *intent* (move choice, target) and receive *events* (turn resolved, HP changed, Pokémon fainted). No client can mutate game state directly.
- **Shared types as contract:** The Socket.io event shapes in `@poke-fighter/shared` are the single source of truth for the client/server protocol. Type mismatches are compile-time errors, not runtime surprises.
- **Static data, no database:** Pokémon data is static JSON. Player profiles, NPC records, and team templates are JSON files on the server. No database for R1.

---

## 3. Feature Decomposition (PRDs)

### F1 — Pokémon Data Layer

**Goal:** Provide a typed, queryable dataset of all Gen 9 Pokémon for use by the battle engine, admin UI, and team builder.

**Scope:**
- Seed `data/` from Pokémon Showdown's open JSON exports (Pokémon, moves, abilities, items, type chart).
- Covers all ~1025 Pokémon available as of Scarlet & Violet, including regional forms and paradox Pokémon.
- Each Pokémon record includes: base stats, type(s), abilities (including hidden), learnset, base exp yield, evolution stage.
- Each move record includes: type, category, base power, accuracy, PP, priority, target type (single / spread / self / ally), and effect identifier.
- The `shared` package exposes typed TypeScript interfaces over these records.
- A build script validates the seeded data against the schemas and fails loudly on gaps.

**Out of scope:** Custom / fan-made Pokémon. Move animations (handled in F7).

**Acceptance criteria:**
- All ~1025 Pokémon queryable by name or national dex number.
- All Gen 9 moves, abilities, and held items present with correct data.
- Type chart matches Showdown's Gen 9 table.
- Schema validation passes with zero errors.

---

### F2 — Player Lobby & Connection

**Goal:** Let players join the server with a display name and wait to be assigned to a battle.

**Scope:**
- Landing page: player enters a display name (1–20 characters, no password).
- On submit, client connects via Socket.io and emits `player:join` with the display name.
- Server registers the player in the lobby. If a name is already taken by an active connection, server returns an error and prompts the player to choose another.
- Lobby UI shows a waiting state ("Waiting for the admin to set up a battle…").
- Admin sees connected players in the registry/setup panel (F4).
- If a player disconnects and reconnects with the same display name within 2 minutes, they are restored to their previous battle slot (if a battle is active).
- Spectator mode: players whose entire party has fainted remain connected and continue viewing the battle.

**Out of scope:** Accounts, passwords, persistent login sessions.

**Acceptance criteria:**
- Player can connect and see waiting state within 5 seconds on local network.
- Duplicate name rejected with a clear error message.
- Reconnect within 2-minute window restores battle slot.

---

### F3 — Player, NPC & Team Registry

**Goal:** Allow the admin to save and reuse player profiles, NPC configurations, and team templates so battles don't require rebuilding the same rosters from scratch.

**Scope:**
- **Player profiles:** Saved by display name. Each profile stores a default team (up to 6 Pokémon with moves, held item, ability, EVs/IVs, level).
- **NPC profiles:** A named NPC (e.g. "Gym Leader Brock") with a saved team. Not tied to a real connected player.
- **Team templates:** Named reusable teams that can be assigned to any player or NPC slot.
- Admin CRUD UI: create, edit, delete, and duplicate profiles/templates.
- When a live player connects (F2), the admin can load their saved profile to auto-populate their slot in the battle setup.
- Persistence: JSON files stored in `server/data/registry/` — one file per profile type (`players.json`, `npcs.json`, `teams.json`).
- Import/export: admin can export registry as a ZIP and import it on another server instance.

**Out of scope:** Per-player login to view/edit their own profile (admin-only for R1).

**Acceptance criteria:**
- Saved profiles survive server restart.
- Loading a saved profile into a battle setup slot populates all 6 Pokémon correctly.
- Import/export round-trips without data loss.

---

### F4 — Admin Battle Setup Panel

**Goal:** Give the admin a UI to configure a battle before it starts — defining teams, assigning players and NPCs to slots, and assigning Pokémon teams.

**Scope:**
- Admin connects with the shared `ADMIN_TOKEN` (sent on Socket.io connect; server grants the admin room).
- Setup panel: define Team A and Team B. Each team has 1–N slots; each slot is either a connected player or an NPC.
- For each slot: assign a team of Pokémon (load from registry or build manually via a team builder UI).
- Team builder: search Pokémon by name/number, pick moves from learnset, set held item, ability, level, EVs/IVs.
- Admin can adjust team sizes asymmetrically (Team A: 3 players, Team B: 2 NPCs — valid).
- Battle settings: configurable turn timer (default 60s), battle name/label.
- "Start Battle" button: server validates all slots are filled, then emits `battle:start` to all participants.
- Admin can save the current battle configuration as a template for reuse.

**Out of scope:** Spectator-only slots, mid-battle roster changes (handled in F8).

**Acceptance criteria:**
- Admin can set up a 3v2 battle with a mix of players and NPCs.
- Loading a saved registry profile auto-fills a slot.
- Starting a battle notifies all assigned players and transitions them out of the lobby.

---

### F5 — Core Battle Engine

**Goal:** Server-side battle simulation that matches Pokémon Showdown's Gen 9 mechanics for all standard battle interactions.

**Scope:**
- **Damage formula:** Gen 9 standard formula including STAB, type effectiveness (Gen 9 chart), burn halving physical damage, random factor (85–100%).
- **Speed order:** Moves resolve in descending Speed order, accounting for priority brackets, paralysis, and Trick Room.
- **Abilities:** All Gen 9 abilities as implemented in Pokémon Showdown (intimidate, levitate, speed boost, etc.).
- **Held items:** All Gen 9 held items (choice band/specs/scarf, life orb, leftovers, berries, etc.).
- **Status conditions:** Burn, paralysis, sleep, freeze, poison, bad poison, confusion.
- **Weather:** Sun, rain, sandstorm, snow (Gen 9 replaces hail).
- **Terrain:** Electric, grassy, misty, psychic.
- **Tera types:** A Pokémon may Terastallize once per battle, changing its type and boosting same-type moves.
- **Moves:** All Gen 9 moves with correct effects, including multi-hit, recoil, drain, entry hazards, stat changes, and field effects.
- **Variable team sizes:** Engine supports x vs y active slots simultaneously. Spread moves hit all valid targets; single-target moves require a target selection.
- **Switching:** Players can switch their active Pokémon instead of using a move. Forced switches (after faint) are handled before the next turn begins.
- **Win condition:** A team loses when all Pokémon across all its player slots have fainted.
- Reference implementation: Pokémon Showdown's sim. If our engine disagrees with PS on a mechanic, ours is wrong.

**Out of scope:** Competitive formats (sleep clause, species clause, OU/Ubers ban lists), Z-moves, Dynamax/Gigantamax (Gen 8 mechanics not present in Gen 9 base).

**Acceptance criteria:**
- Damage output for a set of known matchups matches Showdown's damage calculator within the random factor range.
- All status conditions apply and tick correctly over turns.
- Tera type changes type effectiveness correctly.
- Engine handles 1v1, 3v3, and 5v2 formats without errors.

---

### F6 — Real-time Battle Sync Protocol

**Goal:** Define and implement the Socket.io event contract that carries battle state between server and clients.

**Scope:**
All event types live in `@poke-fighter/shared/events`. Key events:

| Event | Direction | Payload |
|-------|-----------|---------|
| `player:join` | C→S | `{ displayName }` |
| `battle:start` | S→C | full initial state snapshot |
| `turn:start` | S→C | turn number, active slots |
| `action:request` | S→C | valid moves, legal targets for this slot |
| `action:submit` | C→S | move id, target slot id |
| `turn:resolve` | S→C | ordered list of resolution events |
| `move:used` | S→C | attacker, move, targets |
| `damage:dealt` | S→C | target, amount, remaining HP |
| `status:applied` | S→C | target, status |
| `pokemon:fainted` | S→C | slot id |
| `switch:request` | S→C | slot id, available party members |
| `switch:submit` | C→S | slot id, replacement pokemon id |
| `exp:award` | S→C | map of pokemon id → exp gained |
| `level:up` | S→C | pokemon id, new level, new stats |
| `battle:end` | S→C | winning team id, final state |
| `admin:action` | C→S | admin override commands |

- Server emits a full state snapshot on `battle:start` and after every `turn:resolve` so late-joining spectators and reconnecting players can sync instantly.
- Turn timer: if `action:submit` is not received within the configured window, server auto-submits Struggle for that slot.

**Out of scope:** Replay recording (future feature).

**Acceptance criteria:**
- A client that connects mid-battle receives a full state snapshot within one round-trip.
- Reconnecting player receives state within 2 seconds.
- All event payloads are type-safe (TypeScript compilation enforces the contract).

---

### F7 — Battle UI (Client)

**Goal:** Implement the player-facing battle experience in the browser with Fire Red / Leaf Green visuals.

**Scope:**
- **Tech:** Phaser 3 scene embedded in a React page. React handles login, lobby, and overlays; Phaser renders the battle field.
- **Visual style:** Fire Red / Leaf Green aesthetic — tiled GBA-style battle background, Gen 3/9 sprite sheets, GBA-style UI chrome (white boxes, pixelated font).
- **Focused view (default):**
  - Your active Pokémon sprite large at bottom-left.
  - Primary opposing Pokémon sprite large at top-right. "Primary" is defined as the lowest-index living enemy slot (slot 0 if alive, else slot 1, etc.). The player cannot manually change which enemy is primary in the focused view — targeting view is used for that.
  - Ally Pokémon shown smaller and de-emphasized in the background.
  - Other enemy Pokémon shown smaller at top.
  - HP bar + status badge for each visible Pokémon.
  - Move selection panel at the bottom when it's your turn (4 moves, PP displayed, type color-coded).
- **Targeting view (on single-target move selection):**
  - Phaser scene transitions to a zoomed-out full-field view.
  - All living Pokémon on both teams are shown as selectable cards with HP bars.
  - Ally Pokémon are visible but marked non-targetable (dimmed, no click).
  - Clicking an enemy Pokémon submits the target and returns to focused view.
  - ESC / cancel button returns to move selection without submitting.
- **Animations:** Pokémon enter/exit animations, move hit flash, faint animation, exp bar fill.
- **Turn log:** Scrolling text log (Fire Red message box style) narrating each event in the turn.
- **Spectator mode:** Fainted-out players see the focused view centered on the ongoing battle, with no action panel.

**Out of scope:** Sound effects and music (R1), move animations beyond hit flash.

**Acceptance criteria:**
- Focused view renders correctly for variable team sizes including asymmetric matchups (e.g. 1v1, 3v3, 5v2, 1v5).
- Targeting view shows all living Pokémon and correctly accepts a target click.
- Turn log displays all resolution events in correct order.
- UI is playable on a 1080p display in Chrome.

---

### F8 — Admin Battle Control Panel

**Goal:** Give the admin real-time control over a live battle — picking moves for NPCs and managing the overall battle state.

**Scope:**
- Admin views the battle alongside the same Phaser scene as players.
- **NPC action panel:** When it's an NPC's turn, the admin sees a panel for each NPC slot listing their valid moves and legal targets. Admin picks move + target and submits — identical to what a player would do, but from the admin UI.
- **Battle management controls:**
  - Pause / unpause the turn timer.
  - Force-faint a specific Pokémon (admin override).
  - Forfeit a team (ends the battle, other team wins).
  - Manually trigger a Pokémon switch for any slot.
- Admin sees all HP values and party details for both teams (no information hiding).
- All admin actions are sent via `admin:action` events and validated server-side (the token is checked on every admin event, not just on connect).

**Out of scope:** Scripted NPC AI, undo/redo of admin actions.

**Acceptance criteria:**
- Admin can pick moves for all NPC slots simultaneously when a turn starts.
- Pause correctly halts the turn timer for all clients.
- Force-faint triggers the faint sequence and switch prompt correctly.

---

### F9 — Experience System

**Goal:** Award experience to all living Pokémon on the winning team when an opposing Pokémon faints, using Fire Red's formula and team-wide Exp. All distribution.

**Scope:**
- **Formula:** `exp_gained = floor((base_exp_yield × defeated_level) / 7)`
  - `base_exp_yield` comes from the Pokémon's entry in `data/` (sourced from Showdown, which reflects the main series values).
  - This matches Fire Red's base formula before the Exp. All modifier.
- **Distribution:** The calculated `exp_gained` is awarded in full to every living Pokémon across all player slots on the winning team (not just the Pokémon that landed the KO). This is the agreed "team-wide Exp. All" rule.
- **Leveling:** Server checks each recipient's accumulated exp against its species' exp growth curve (from `data/`). If a level threshold is crossed, server emits `level:up` with new base stats. Multiple level-ups in one award are handled.
- **UI:** Each player sees an exp bar animation for their active Pokémon. Level-up triggers a visual notification and updated stat display.
- Fainted Pokémon on the winning team do not receive exp.

**Out of scope:** Effort values (EVs) gained from battles (teams are configured with fixed EVs by the admin in setup).

**Acceptance criteria:**
- A Level 50 Charizard (base exp yield 240) defeated by a 3-player team awards `floor((240 × 50) / 7)` = 1714 exp to every living Pokémon on that team.
- Level-up correctly recalculates stats using the species growth curve.
- Exp is not awarded to fainted Pokémon.

---

## 4. Key Flows

### 4.1 Turn Lifecycle

```
1. Server emits turn:start
2. Server emits action:request to each living player slot and each NPC slot (admin)
3. All parties submit action:submit within the turn timer window
   → Unsubmitted slots auto-submit Struggle when timer expires
4. Server resolves all actions in speed order (Showdown mechanics)
   → Emits: move:used, damage:dealt, status:applied, pokemon:fainted, etc.
5. Server emits turn:resolve with the full ordered event list
6. If any Pokémon fainted → server emits switch:request to affected slots
   → Slot submits switch:submit (or has no remaining Pokémon → becomes spectator)
7. If a team has no living Pokémon remaining → server emits battle:end
8. Otherwise → return to step 1
```

### 4.2 Reconnect Flow

- Player disconnects → server holds their slot for 120 seconds.
- Player reconnects with same display name → server matches them to their held slot, emits a full state snapshot.
- If 120 seconds elapses without reconnect → slot auto-submits Struggle each turn until all Pokémon have fainted, then slot becomes spectator.

### 4.3 Admin Token

- A plaintext secret set in `.env` as `ADMIN_TOKEN`.
- Admin client sends it as a Socket.io auth header on connect.
- Server validates the token on connect and on every `admin:action` event.
- No real security — sufficient for intranet use with a trusted audience.

---

## 5. Architecture Decision Records (ADRs)

### ADR-01 — Monorepo with pnpm workspaces

**Context:** Server and client share a large, complex type surface — battle events, Pokémon schemas, move data. Maintaining this across separate repos risks type drift.

**Decision:** Single monorepo, three packages (`shared`, `server`, `client`), managed with pnpm workspaces.

**Consequences:** Slight tooling overhead at project init. Eliminates an entire class of client/server type mismatches. Simplifies CI (one pipeline, one lockfile).

---

### ADR-02 — Phaser 3 for battle scene rendering

**Context:** The battle UI requires sprite sheet animation, scene state management (focused ↔ targeting view), input handling on sprites, and tweening. These are game engine concerns, not DOM concerns.

**Decision:** Phaser 3 for the battle scene, embedded in a React page. React handles everything outside the battle (lobby, admin panel, overlays).

**Consequences:** Two rendering systems in one app. The boundary is clean: React owns the DOM, Phaser owns one `<canvas>` element. This is a well-established pattern for Phaser + React. PixiJS was rejected because it is rendering-only and would require building all scene/state/input infrastructure on top.

---

### ADR-03 — Socket.io for real-time communication

**Context:** The battle requires bidirectional real-time messaging, room-scoped broadcasts (one battle = one room), and reliable reconnection.

**Decision:** Socket.io over raw WebSocket.

**Consequences:** Socket.io adds rooms, auto-reconnect, event namespacing, and fallback transports. All of these would be hand-built on raw WebSocket. The library overhead is negligible on a local network.

---

### ADR-04 — Pokémon Showdown data as canonical source

**Context:** The game requires complete and accurate data for ~1025 Pokémon, all Gen 9 moves, abilities, and items. Hand-authoring this is infeasible and error-prone.

**Decision:** Seed `data/` from Pokémon Showdown's open JSON exports. Showdown is maintained by the community and tracks main-series accuracy.

**Consequences:** We accept Showdown's data format and any quirks in it. Our battle engine also targets Showdown parity (ADR-09), so using its data as the source means data and engine are always consistent. License: Showdown's data is MIT/CC — compatible with this project.

---

### ADR-05 — Server-authoritative battle state

**Context:** Multiple clients (players, admin, spectators) must all see identical game state. Allowing any client to own state creates desyncs and cheating vectors.

**Decision:** All battle state lives on the server. Clients are stateless viewers — they render what the server tells them.

**Consequences:** Any client can reconnect and receive a full state snapshot. Admin and spectator views are trivially consistent. Slight latency added to all interactions (acceptable on a local network). Server becomes the single point of failure — acceptable for R1.

---

### ADR-06 — Named login, no authentication (R1)

**Context:** The app is deployed on a local intranet for a trusted audience. Full account management is significant scope with no benefit for this use case.

**Decision:** Players enter a display name only. Admin access is gated by a shared `.env` secret (`ADMIN_TOKEN`). No passwords, no sessions, no JWTs.

**Consequences:** Zero security against a malicious actor on the network. Acceptable for R1. Any public-facing release must revisit this decision entirely.

---

### ADR-07 — Two-view battle UI

**Context:** With x vs y players all on screen simultaneously, a single static view either crowds all Pokémon (hard to read at large team sizes) or hides important information.

**Decision:** Two distinct Phaser scene states: a focused view (your Pokémon and primary opponent large; others de-emphasized) and a targeting view (full field, all Pokémon visible and selectable). Switching between them is a scene state transition triggered by move selection.

**Consequences:** Both views are purpose-built and clean. The transition is a defined UX moment — selecting a single-target move triggers the zoom-out; confirming a target (or cancelling) returns to focused view. More implementation surface than a single view, but significantly better usability.

---

### ADR-08 — JSON file persistence, no database (R1)

**Context:** Player profiles, NPC records, and team templates need to survive server restarts. A full database (SQLite, Postgres) is scope overhead with no benefit for a local intranet app at this scale.

**Decision:** Persist registry data as JSON files in `server/data/registry/`. Read on startup, write on mutation.

**Consequences:** Simple, zero-dependency, easy to inspect, back up, and version-control. Does not scale to concurrent writes or large datasets — acceptable for R1. Migrate to SQLite if the registry grows beyond a few hundred records or if concurrent admin sessions become a requirement.

---

### ADR-09 — Battle engine targets Pokémon Showdown parity

**Context:** Gen 9 Pokémon mechanics are complex and extensively documented by the Showdown community. Inventing our own interpretation risks subtle bugs that are hard to detect and frustrating for players who know how mechanics should work.

**Decision:** Pokémon Showdown's sim is the reference implementation. If our engine produces a different result for a given scenario than Showdown does, our engine is wrong.

**Consequences:** Clear correctness bar — we can test against Showdown's damage calculator and known interaction logs. Excludes competitive-only rules (sleep clause, species clause, ban lists) which are Showdown-specific layers on top of the base mechanics, not the mechanics themselves.

---

## 6. Iteration Order (Suggested Sprint Sequence)

| Sprint | Features | Why |
|--------|----------|-----|
| 1 | F1 — Data Layer | Everything depends on Pokémon data |
| 2 | F5 — Battle Engine (core) | Engine can be built and tested headlessly |
| 3 | F6 — Sync Protocol | Wire up engine to Socket.io |
| 4 | F2 — Lobby, F3 — Registry | Player connection and team storage |
| 5 | F4 — Admin Setup | Configure and start battles |
| 6 | F7 — Battle UI (focused view) | Players can now play |
| 7 | F7 — Battle UI (targeting view) | Complete the UI |
| 8 | F8 — Admin Control Panel | NPC management in live battles |
| 9 | F9 — Experience System | Reward layer on top of complete battle |
