# Battle Log: Type Effectiveness & Critical Hit Messages

**Date:** 2026-09-01  
**Branch:** feat/ability-item-completion  

## Summary

Add type effectiveness and critical hit messages to the battle log, matching the style of the mainline Pokemon games. When a move deals damage, the log shows separate lines for "It's super effective!", "It's not very effective...", and "A critical hit!" as applicable. No message appears when effectiveness is neutral and the hit is not critical.

## Scope

Client-only. One file changes: `packages/client/src/battle/BattleContext.tsx`.

No changes to server, shared types, or any other package.

## Background

The server already emits everything needed:

- `damage-dealt` events for move hits include an `effectiveness` field (the type multiplier, e.g. `0.5`, `1`, `2`, `4`).
- A separate `crit` event is emitted immediately after `damage-dealt` when the hit is a critical hit.
- Passive damage events (burn, leech-seed, confusion, etc.) use a `source` field and do not have `moveId` or `attackerSlotId`, so they can be distinguished from move hits.
- Immunity (0x effectiveness) short-circuits before `damage-dealt` is emitted; no change needed for that case.

## Design

### `eventToText` return type

Change from `string` to `string | string[]`. This allows a single event to produce multiple log lines without changing the event schema.

### `damage-dealt` handler

When the event has `moveId` present (indicating a move hit, not passive damage), inspect `effectiveness`:

| Condition | Extra line |
|-----------|-----------|
| `effectiveness > 1` | `"It's super effective!"` |
| `effectiveness < 1` | `"It's not very effective..."` |
| `effectiveness === 1` | *(none)* |

The damage line itself is always returned first: `"Dealt X damage to Y."`, followed by the effectiveness line when applicable.

When `moveId` is absent (passive damage source), return the damage line only with no effectiveness text.

### `crit` handler

Return `"A critical hit!"`. Currently this event falls through to the default case and returns `''`, which gets filtered out.

### Event pipeline

Both the `turn:resolve` and `battle:history` socket handlers use the same event-to-entries mapping. Change `.map(e => eventToText(e))` to a `flatMap` that normalises the return value:

```ts
.flatMap((e) => {
  const result = eventToText(e);
  return Array.isArray(result) ? result : [result];
})
```

The existing `.filter(Boolean)` after the flatMap continues to drop empty strings from unhandled events.

### Log ordering

For a super-effective critical hit the log will read:

```
Pikachu used Thunderbolt!
Dealt 68 damage to Red-0.
It's super effective!
A critical hit!
```

The crit line appears after the effectiveness line because the `crit` event fires after `damage-dealt` in the engine. This differs slightly from the mainline games (which show crit before effectiveness) but is readable and requires no server-side reordering.

## Out of Scope

- Immunity message ("It doesn't affect...") — immunity never reaches a `damage-dealt` event; the engine emits `move-used` with `note: 'no-effect'` instead. Adding a message for that case is a separate concern.
- Any server, shared-type, or BattleEngine changes.
- Styling changes to effectiveness/crit log entries (they use the existing `normal` log entry style).
