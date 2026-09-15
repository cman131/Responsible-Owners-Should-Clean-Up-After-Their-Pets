# Competitive Items Implementation Design

**Date:** 2026-09-15  
**Scope:** Implement ~50 competitive-meta battle items across four phases; ensure item-triggered HP changes animate; document unimplemented items.

---

## Scope

### In scope
Battle-relevant items used in competitive play. Excludes fossils, Poké Balls, TRs, evolution stones, Mega Stones, Z-Crystals, and Tera items.

### Out of scope (documented in `docs/unimplemented-items.md`)
Species-specific items, niche format items, Plates/Memories/Drives, and a handful of complex berries. See that file for the full list.

---

## Architecture & Event Pipeline

All item effects go through the `ITEM_HOOKS` registry in `packages/server/src/engine/items.ts`. New items follow the same pattern.

### Existing hooks (unchanged interface)
| Hook | Purpose |
|------|---------|
| `onAttackerModifier` | Damage multiplier for attacker (type boosts, Choice Band) |
| `onDefenderModifier` | Damage multiplier for defender (Assault Vest, Eviolite) |
| `onDamageModifier` | Flat damage multiplier (Life Orb, Expert Belt) |
| `onEndOfTurn` | End-of-turn HP delta (Leftovers) |
| `onAfterDamageTaken` | After holder takes damage (Sitrus Berry, stat berries) |
| `onAfterHit` | After holder is hit — can damage attacker (Rocky Helmet) |
| `onStatusApplied` | When a status is applied to holder (Lum Berry) |
| `onSpeedModifier` | Speed multiplier (Choice Scarf) |
| `onAccuracyModifier` | Accuracy multiplier (Wide Lens, Zoom Lens) |
| `onHealAfterAttack` | Heal holder after attacking (Shell Bell) |
| `critStageBonus` | Static crit stage bonus (Scope Lens) |

### Hook extensions required

**`onEndOfTurn` return type** gains `statusToInflict?: string`:
```ts
onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number; statusToInflict?: string };
```
Used by Flame Orb (`'burn'`) and Toxic Orb (`'toxic'`).

**`onDefenderModifier`** extended to return `number | { multiplier: number; consume?: boolean }`:
```ts
onDefenderModifier?: (ctx: ItemAttackContext) => number | { multiplier: number; consume?: boolean };
```
Used by type-resist berries to both halve damage and self-consume.

**`onAfterDamageTaken` context** gains `moveType: PokemonType` and `isPhysical: boolean` for reactive berries.

**`onAfterHit` return type** gains two optional fields:
```ts
{ directDamageToAttacker?: number; flinchTarget?: boolean; forceAttackerSwitch?: boolean; consume?: boolean }
```
Used by King's Rock / Razor Fang (`flinchTarget`) and Red Card (`forceAttackerSwitch`).

### New hooks required

**`onAfterDamageTakenForceSwitch`** — fires after holder takes direct damage, can force a switch:
```ts
onAfterDamageTakenForceSwitch?: (ctx: ItemContext & { damageTaken: number }) => boolean;
```
Used by Eject Button.

**`onStatDropped`** — fires when any of the holder's stats are lowered:
```ts
onStatDropped?: (ctx: ItemContext) => { restoreStats?: boolean; forceSwitch?: boolean; consume: boolean };
```
Used by White Herb (`restoreStats: true`) and Eject Pack (`forceSwitch: true`).

**`onSwitchIn`** — fires when the holder enters the field, receives current terrain:
```ts
onSwitchIn?: (ctx: ItemContext & { terrain: string | null }) => { statBoostDeltas?: Partial<StatBoosts>; consume?: boolean };
```
Used by terrain seeds. Also called from `onEndOfTurn` if terrain is set while holder is already active (so seeds fire when terrain activates mid-battle).

### Animation guarantee
All item-triggered HP changes must emit:
- **HP loss** → `{ type: 'damage-dealt', data: { source, slotId, damage, remainingHp } }`
- **HP gain** → `{ type: 'heal', data: { slotId, amount, remainingHp } }`

**Known gap to fix:** `BattleEngine.ts` line ~2043 — `onEndOfTurn` only emits `heal` when `hpDelta > 0`. The negative branch is missing, which means Black Sludge on non-Poison types is currently silent. Fix: add `damage-dealt` emit when `hpDelta < 0`.

---

## Phase 1: Berries

### Status-cure berries (7 items)
Use existing `onStatusApplied` hook. Same pattern as Lum Berry (consume on trigger).

| Berry | Cures |
|-------|-------|
| Cheri Berry | Paralysis |
| Chesto Berry | Sleep |
| Pecha Berry | Poison / Toxic |
| Rawst Berry | Burn |
| Aspear Berry | Freeze |
| Persim Berry | Confusion |

### HP-restore berries (2 items)
Use `onAfterDamageTaken`. Heal when HP drops to ≤50%.

| Berry | Heal amount |
|-------|------------|
| Oran Berry | 10 HP |
| Berry Juice | 20 HP |

### Type-resist berries (18 items)
Use extended `onDefenderModifier` returning `{ multiplier: 0.5, consume: true }` when the move's type matches and is super-effective (or any hit for Chilan). BattleEngine applies multiplier and queues consume.

| Berry | Resists |
|-------|---------|
| Occa | Fire |
| Passho | Water |
| Wacan | Electric |
| Rindo | Grass |
| Yache | Ice |
| Chople | Fighting |
| Kebia | Poison |
| Shuca | Ground |
| Coba | Flying |
| Payapa | Psychic |
| Tanga | Bug |
| Charti | Rock |
| Kasib | Ghost |
| Haban | Dragon |
| Colbur | Dark |
| Babiri | Steel |
| Chilan | Normal (any Normal hit) |
| Roseli | Fairy |

### Confusion berries (5 items)
Use `onAfterDamageTaken`. Heal ~1/3 max HP when at ≤33% HP, consume. No confusion in Gen 8+.

Figy, Wiki, Mago, Aguav, Iapapa.

### Low-HP trigger berries (2 items)
Use `onAfterDamageTaken` at ≤25% HP, set a volatile flag, consume.

- **Custap Berry**: sets `custap-active` volatile → priority order resolution checks this flag to let the holder move first
- **Micle Berry**: sets `micle-active` volatile → `onAccuracyModifier` returns 1.2× and clears the flag

### Reactive berries (4 items)
Use extended `onAfterDamageTaken` context (`isPhysical`).

| Berry | Trigger | Effect |
|-------|---------|--------|
| Kee Berry | Hit by physical | +1 Defense |
| Maranga Berry | Hit by special | +1 Sp.Def |
| Jaboca Berry | Hit by physical | Attacker takes 1/8 holder max HP |
| Rowap Berry | Hit by special | Attacker takes 1/8 holder max HP |

Jaboca/Rowap damage the attacker — this is returned via `onAfterHit` (extend with `directDamageToAttacker` like Rocky Helmet) rather than `onAfterDamageTaken`, so the attacker-side damage path is reused.

---

## Phase 2: Status Orbs + White Herb

### Flame Orb
`onEndOfTurn` returns `{ hpDelta: 0, statusToInflict: 'burn' }`. `applyStatus` handles immunity checks. Does not re-inflict if already burned. Battle log: *"[Pokémon]'s Flame Orb burned it!"*

### Toxic Orb
Same pattern, `statusToInflict: 'toxic'`. Battle log: *"[Pokémon]'s Toxic Orb badly poisoned it!"*

Burn/toxic damage ticks already run through `EffectEngine` each turn and already emit `damage-dealt` — no additional animation work needed.

### White Herb
New `onStatDropped` hook. When any stat stage drops below 0, restore all negative stat stages to 0, consume. Battle log: *"[Pokémon]'s White Herb restored its stats!"*

Edge case: fires only once (consumed on first trigger). If multiple stats drop simultaneously, all are restored in one activation.

---

## Phase 3: Passive Boosts

Two items, two lines each. No new hooks, no animation, no battle log (passive multipliers same as type-boosting items).

```ts
'muscle-band': { onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.1 : 1 },
'wise-glasses': { onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.1 : 1 },
```

---

## Phase 4: Reactive Items + Terrain Seeds

### King's Rock / Razor Fang
Both: extend `onAfterHit` to return `flinchTarget: true` with 10% probability when the holder deals damage via a move that has no existing flinch secondary. BattleEngine applies `applyVolatile('flinch')` to the target. Battle log: *"[Pokémon] flinched!"*

### Eject Button
New `onAfterDamageTakenForceSwitch` hook returns `true` when holder takes any direct damage. BattleEngine triggers a switch using the same flow as fainting. Item consumed on trigger. If no party members remain to switch in, effect is suppressed. Battle log: *"[Pokémon] was switched out by its Eject Button!"*

### Eject Pack
New `onStatDropped` hook returns `{ forceSwitch: true, consume: true }`. Same forced-switch flow as Eject Button. Battle log: *"[Pokémon] was switched out by its Eject Pack!"*

### Red Card
Extend `onAfterHit` to return `forceAttackerSwitch: true`. BattleEngine forces the attacker (not the holder) to switch out. Same bench-empty suppression applies. Item consumed. Battle log: *"[Pokémon] was knocked back by [target]'s Red Card!"*

### Terrain Seeds (4 items)
New `onSwitchIn` hook checks current terrain. If it matches, apply stat boost and consume.

| Seed | Terrain | Boost |
|------|---------|-------|
| Electric Seed | Electric Terrain | +1 Defense |
| Grassy Seed | Grassy Terrain | +1 Defense |
| Misty Seed | Misty Terrain | +1 Sp.Def |
| Psychic Seed | Psychic Terrain | +1 Sp.Def |

Seeds also fire via `onEndOfTurn` when terrain is set while the holder is already active (terrain can be set mid-battle by a move). `onEndOfTurn` checks: terrain matches + item not yet consumed + holder is active.

---

## UI / Animation

### What already works
- HP bar animation fires on any `damage-dealt` or `heal` event — all new item HP changes route through these events
- Status badge appears on `status-applied` event — Flame/Toxic Orb use this
- Battle log already receives all events with `source` attribution

### One fix required
`BattleEngine.ts` ~line 2043 — add `damage-dealt` emit path for negative `onEndOfTurn` hpDelta:

```ts
if (hpDelta > 0) {
  // existing heal path
} else if (hpDelta < 0) {
  const damage = Math.min(-hpDelta, active.currentHp);
  active.currentHp -= damage;
  events.push({ type: 'damage-dealt', data: { source: active.heldItem, slotId: slot.slotId, damage, remainingHp: active.currentHp } });
}
```

### No changes needed
- Admin item selector: all new items already present in `items.json`
- Item name display during battle: explicitly out of scope
- Passive multipliers (Muscle Band, Wise Glasses, type boosts): no visual needed

---

## Testing

Each phase's items should have unit tests in `packages/server/src/engine/__tests__/BattleEngine.test.ts` or a new `items.test.ts` covering:
- Effect triggers at correct HP threshold / condition
- Item is consumed after triggering
- Correct event emitted (type, source, slotId, amount)
- No double-trigger (consumed items don't fire again)
- Edge cases: full HP (no heal), immune to status (orbs), empty bench (forced switches)
