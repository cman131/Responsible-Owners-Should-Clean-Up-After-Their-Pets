# EXP Bar Persistent Display — Design Spec

**Date:** 2026-09-18

## Problem

EXP awards and level-ups are shown as fleeting overlays (3–4 s auto-dismiss). There is no persistent visual reference for EXP progress. The level-up overlay also omits the Pokémon's name.

## Goals

1. Show a persistent EXP progress indicator in the HP bars row for the player's own team.
2. Improve the level-up overlay text to include the Pokémon's name.

## Out of Scope

- Repositioning the level-up overlay near the sprite (deferred).
- EXP display for enemy team rows.
- Any changes to socket events or server payloads beyond `PartyMember.growthRate`.

---

## Feature 1 — Persistent EXP % in HP Bars Row

### Display

- Appended to each own-team slot row as compact text: **"EXP 45%"** in purple (`#9b59b6`).
- Always visible while the battle is active — not tied to an EXP award event.
- Hidden for level-100 Pokémon (no further leveling possible).
- Not shown on enemy rows (`variant === 'enemy'` in `HpBarsRow`).

### Data Model Change

Add `growthRate: string` to `PartyMember` in `packages/shared/src/types/battle.ts`.

`growthRate` is one of the six Pokémon Showdown growth-rate strings: `"Erratic"`, `"Fast"`, `"MediumFast"`, `"MediumSlow"`, `"Slow"`, `"Fluctuating"`. It is populated by `BattleConfigurator` from species data and is treated as read-only by the engine.

### EXP Formula — Move to Shared

Move `expForLevel` and `EXP_TABLES` from `packages/server/src/engine/exp.ts` into a new module `packages/shared/src/utils/exp.ts`. Export them from the shared package index. The server's `exp.ts` imports `expForLevel` from `@poke-fighter/shared` instead of defining it locally (all other exports in `exp.ts` — `calcExpYield`, `distributeExp`, `checkLevelUps` — stay server-side).

### Percentage Calculation

```ts
const currentFloor = expForLevel(mon.growthRate, mon.level);
const nextThreshold = expForLevel(mon.growthRate, mon.level + 1);
const pct = Math.round(
  ((mon.expTotal - currentFloor) / (nextThreshold - currentFloor)) * 100
);
```

Edge case: if `nextThreshold === currentFloor` (level 100), hide the EXP label entirely.

### HpBarsRow Changes

- Import `expForLevel` from `@poke-fighter/shared`.
- After the HP number span, render `<span style="color:'#9b59b6', fontSize:9, whiteSpace:'nowrap'}>EXP {pct}%</span>` when `variant === 'own'` and `mon.level < 100`.

---

## Feature 2 — Level-Up Notification with Pokémon Name

### Change

Add `nickname: string` prop to `ExpBar`. Update the level-up overlay text from:

```
Level Up! Now Lv.51
```

to:

```
Charizard leveled up! Now Lv.51
```

### Props

```ts
interface Props {
  instanceId: string;
  nickname: string;  // added
}
```

### Callsite (`BattlePage`)

`myActiveMon.nickname` is already in scope where `ExpBar` is rendered:

```tsx
{myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} nickname={myActiveMon.nickname} />}
```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/battle.ts` | Add `growthRate: string` to `PartyMember` |
| `packages/shared/src/utils/exp.ts` | New file — `expForLevel` + `EXP_TABLES` |
| `packages/shared/src/index.ts` | Export `expForLevel` |
| `packages/server/src/engine/exp.ts` | Import `expForLevel` from shared; remove local definition |
| `packages/server/src/setup/BattleConfigurator.ts` | Populate `growthRate` on each `PartyMember` |
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Render EXP % text for own-variant rows |
| `packages/client/src/battle/overlays/ExpBar.tsx` | Add `nickname` prop; update level-up text |
| `packages/client/src/pages/BattlePage.tsx` | Pass `nickname` to `ExpBar` |

---

## Testing

- Unit test `expForLevel` in shared (covers Erratic, Fast, MediumFast, MediumSlow, Slow, Fluctuating at representative levels).
- Unit test the EXP percentage calculation for a mid-level Pokémon and a level-100 edge case.
- Existing server `exp.ts` tests continue to pass after the import change.
- `HpBarsRow` snapshot or render test verifying EXP % appears for own-variant and is absent for enemy-variant.
