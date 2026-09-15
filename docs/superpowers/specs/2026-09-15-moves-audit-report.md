# Moves Audit Report — 2026-09-15

Audit of `data/moves.json`, battle engine, and UI battle log against the methodology in `2026-09-15-moves-audit-design.md`. Excludes Z-moves, G-Max/Max moves, and known stubs (`mefirst`, `doodle`).

---

## Engine Gaps

Sorted by severity (High → Medium).

| Move ID | effectId | Gap type | Severity | Notes |
|---|---|---|---|---|
| `naturepower` | `naturepower` | `silent-fail` | **High** | Status move with no handler in registrations.ts → always `move-failed reason:unimplemented` |
| `uturn` | — (physical) | `wrong-behavior` | **High** | `pivot` secondary filtered at BattleEngine:1506; switch never fires after damage |
| `voltswitch` | — (special) | `wrong-behavior` | **High** | Same as `uturn` — pivot secondary filtered, switch skipped |
| `flipturn` | — (physical) | `wrong-behavior` | **High** | Same as `uturn` — pivot secondary filtered, switch skipped |
| `trumpcard` | `trumpcard` | `wrong-behavior` | **High** | basePower=0 in data, no dynamicPower resolver → always deals 0 damage |
| `payback` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (60) unchanged; should double to 120 if user took damage this turn |
| `avalanche` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (60) unchanged; should double to 120 if user moved after the target |
| `assurance` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (60) unchanged; should double if target already took damage this turn |
| `echoedvoice` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (40) unchanged; should scale 40/80/120/160/200 on consecutive turns |
| `rollout` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (30) unchanged; should double each turn of the 5-turn sequence |
| `iceball` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (30) unchanged; same mechanic as Rollout |
| `retaliate` | — | `wrong-behavior` | **High** | dynamicPower stub returns `move.basePower` (70) unchanged; should double to 140 if an ally fainted the previous turn |
| `highjumpkick` | `highjumpkick` | `wrong-behavior` | **High** | No crash-damage-on-miss handler; on a miss or Protect the user takes no damage |
| `jumpkick` | `jumpkick` | `wrong-behavior` | **High** | No crash-damage-on-miss handler; same gap as `highjumpkick` |
| `burnup` | `burnup` | `wrong-behavior` | **High** | Deals Fire damage but does not strip the user's Fire type after use |
| `doubleshock` | `doubleshock` | `wrong-behavior` | **High** | Deals Electric damage but does not strip the user's Electric type after use |
| `poltergeist` | `poltergeist` | `wrong-behavior` | **High** | No item-presence check; proceeds even if the target holds no item |
| `boltbeak` | `boltbeak` | `wrong-behavior` | **High** | No double-power-if-user-is-faster check; always 85 BP |
| `fishiousrend` | `fishiousrend` | `wrong-behavior` | **High** | No double-power-if-user-is-faster check; always 85 BP |
| `judgment` | `judgment` | `wrong-behavior` | **High** | Always uses Normal type; doesn't check held Plate to determine type |
| `multiattack` | `multiattack` | `wrong-behavior` | **High** | Always uses Normal type; doesn't check held Memory to determine type |
| `outrage` | `outrage` | `wrong-behavior` | **High** | Deals Dragon damage as a standard single hit; no 2–3 turn lock or post-sequence confusion applied |
| `petaldance` | `petaldance` | `wrong-behavior` | **High** | Same gap as `outrage` — no lock mechanic |
| `thrash` | `thrash` | `wrong-behavior` | **High** | Same gap as `outrage` — no lock mechanic |

---

## UI Gaps

Sorted by severity (Medium only — no High or Low UI gaps found).

| Component | Gap description | Affected events / volatiles |
|---|---|---|
| `BattleContext.tsx` — `volatileAppliedText` | Falls to `default: return ''` for these engine-emitted volatile names; player sees no battle-log text when these are applied | `infatuation`, `yawn`, `nightmare`, `focusenergy`, `laser-focus`, `imprison`, `magic-coat`, `snatch`, `dragon-cheer`, `foresight`, `miracle-eye`, `electrify`, `octolock`, `type-changed`, `minimize`, `geomancy-charge`, `transformed`, `mimic`, `power-trick`, `psych-up`, `sketch`, `charging-solarbeam` |
| `BattleContext.tsx` — `volatileCuredText` | Falls to `default: return ''` when these are cured; expiry goes unannounced | `lock-on`, `powder`, `power-trick` |
| `BattleContext.tsx` — `status-cured` event | Only `'slp'` produces visible text; all other status cures (`brn`, `par`, `frz`, `psn`, `tox`) are silent | `status-cured` event where `data.status !== 'slp'` |
| `BattleContext.tsx` — `MOVE_NOTE_TEXT` | `MOVE_NOTE_TEXT` only has 4 entries (mud-sport × 2, water-sport × 2); all other `move-note` keys fall back to raw key string in the battle log | `pp-reduced-by-N`, `item-bestowed`, `item-recycled`, `ability-swapped`, `ability-copied`, `ability-entrained`, `ability-changed-simple`, `ability-changed-insomnia`, `guard-split`, `power-split`, `power-shift`, `ally-switched`, `after-you` |

---

## Data Gaps

| Move ID | Field | Issue |
|---|---|---|
| `trumpcard` | `basePower` | Value is `0`; move has variable power (based on remaining PP) but no dynamicPower resolver exists — always deals 0 damage |

---

## No Gaps Found

- **ActionPanel LOCKED_LABELS** — all 4 `lockedReason` values (`recharge`, `sleep`, `freeze`, `bide`) are covered.
- **`classifyTarget` / MoveTarget** — all 13 distinct `target` values present in `moves.json` are handled; no `ui-targeting` gaps.
- **Secondary kinds** — all `secondaries.kind` values present in `moves.json` (`status`, `stat`, `flinch`, `confusion`, `drain`, `recoil`, `recoil-hp`, `charge`, `multihit`, `ohko`, `volatile`, `binding`, `selfdestruct`, `recharge`, `clear-hazards-self`, `break-screens`, `pivot`) are handled in `effects.ts` or filtered intentionally. No `data-error` secondary gaps.
- **Return / Frustration** — friendship-based power is implemented in `dynamicPower.ts`.
- **Low Kick / Grass Knot** — weight-based power is implemented in `dynamicPower.ts`.
- **Flail / Reversal** — HP-based power is implemented in `dynamicPower.ts`.
- **OHKO family** (Sheer Cold, Fissure, Guillotine, Horn Drill) — handled inline in `BattleEngine.executeMove`.
- **Counter / Mirror Coat / Metal Burst / Comeuppance** — handled inline.
- **Fixed-damage moves** (Seismic Toss, Night Shade, Dragon Rage, Sonic Boom) — handled inline.
- **HP-halving moves** (Super Fang, Nature's Madness, Ruination) — handled inline.
