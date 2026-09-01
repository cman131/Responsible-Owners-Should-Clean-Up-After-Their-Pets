# Battle System Completion — Upcoming Features

This folder contains PRD-style feature documents scoping the work needed to bring
poke-fighter to Gen 5–8 competitive parity. Each doc is sized for the feature
discovery / alignment phase; a detailed spec and TDD implementation plan under
`docs/superpowers/` should be produced before starting implementation.

---

## Quick index

| # | Feature | Est. scope | Depends on |
|---|---------|------------|------------|
| [01](./01-move-effect-dispatch.md) | Move Effect Dispatch | L | — |
| [02](./02-damage-completion.md) | Damage Calculation Completion | M | — |
| [03](./03-secondary-effect-framework.md) | Secondary Effect Framework | L | 01, 02 |
| [04](./04-volatile-status-expansion.md) | Volatile Status Expansion | XL | 01 |
| [05](./05-field-state-activation.md) | Field State Activation | L | 01 |
| [06](./06-screens-and-hazards.md) | Screens & Entry Hazards | M | 01, 02 |
| [07](./07-switching-mechanics.md) | Switching Mechanics Correctness | M | 04, 06 |
| [08](./08-ability-and-item-completion.md) | Ability & Item Completion | L | 02, 03, 05 |
| [09](./09-sprite-battle-animations.md) | Sprite Battle Animations | M | battle-playback-queue |

---

## Dependency graph

```
01 Move effect dispatch ─┬─► 03 Secondaries ──────────────────► 08 Abilities
  (foundational)         ├─► 04 Volatiles ──────────────────┐
                         ├─► 05 Field state ─────────────────► 08 Abilities
                         └─► 06 Screens/Hazards ────────────┤
02 Damage completion ────────► 03, 06, 08                   └─► 07 Switching
```

Simplified (edges = "A is needed by B"):

```
01 ─┬─► 03 ─┬─► 08
    ├─► 04 ─┤
    ├─► 05 ─┤
    └─► 06 ─┴─► 07
02 ─────────────► 03, 06, 08
04 + 06 ────────► 07
```

Recommended implementation sequence: **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08**.
Docs 01 and 02 are independent and can be started in parallel if separate
branches are used.

---

## Fidelity target

**Gen 5–8 mechanics** (BW through SwSh). Data sourced from Gen 9 (SV)
`data/moves.json` and `data/pokemon.json` where values are backward-compatible.
Where a mechanic changed between gens (e.g. hail vs snow, critical-hit probability
in Gen 6), use the most recent pre-SV behavior unless otherwise noted.

---

## Explicit non-goals (all eight docs)

These mechanics are **out of scope** for this feature set. Existing code that
partially supports them (e.g. `teraType` / `hasTerastallized` fields on
`PartyMember`) should be left in place but not expanded.

| Mechanic | Reason deferred |
|----------|----------------|
| **Mega Evolution** | Requires form-swap on species + stat recalc mid-battle |
| **Dynamax / Gigantamax** | Max Move logic is a completely separate move category |
| **Z-Moves** | One-use crystal mechanic; Z-move entries in moves.json stay no-ops |
| **Terastallization** | Tera type field already wired; mechanic expansion deferred |
| **Doubles-specific interactions** | Wide Guard, Follow Me, Ally Switch, redirection, friend guard — deferred to a future doubles pass; basic spread targeting already works |

---

## What is already done

The following completed specs/plans document work that should **not** be
redone. Check `docs/superpowers/specs/` and `docs/superpowers/plans/`.

| Doc | What it covers |
|-----|----------------|
| `2026-08-26-targeting-engine` | 15 move-target modes, `getLegalTargets`, spread penalty |
| `2026-08-26-stat-changes-and-status-conditions` | Stat boost table, `applyStatBoost`, status immunities |
| `2026-08-26-status-effects-indicator` | Client-side status icon display |
| `2026-08-26-battle-log-history-and-round-markers` | Turn log rendering, round dividers |
| `2026-08-27-effect-engine-design` | `EffectEngine` class: `runPreMove` / `runEndOfTurn`, confusion / leech-seed / bind / yawn volatiles |
| `future-volatile-effects` | Deferred volatile list from the EffectEngine PR (Encore, Taunt, Torment, etc.) — these are in scope for doc 04 |

The Gen 5+ damage formula (level, base power, atk/def, STAB, type effectiveness,
spread penalty, ability/item modifier chain) is already implemented in
`packages/server/src/engine/damage.ts`. Docs in this folder extend it, not
replace it.
