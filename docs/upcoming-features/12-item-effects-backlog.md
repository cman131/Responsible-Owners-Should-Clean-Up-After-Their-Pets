# Item Effects Backlog — Prioritized

**Date:** 2026-09-02  
**Status:** Reference / future work  
**Scope:** Ordered list of items to implement next, grouped by what they require. All use the hook system described in `11-item-effects-architecture.md`.

---

## Currently implemented

assault-vest, choice-band, choice-specs, choice-scarf, life-orb, leftovers, black-sludge, eviolite, scope-lens, razor-claw, light-clay, big-root, rocky-helmet, sitrus-berry, lum-berry, salac-berry, petaya-berry, liechi-berry, ganlon-berry, apicot-berry, focus-sash, air-balloon, weakness-policy

---

## Tier 1 — No new hooks required

All use the existing `onAttackerModifier` hook: return `moveType === '<Type>' ? 1.2 : 1`.

| Item id | Name | Type boosted |
|---------|------|-------------|
| `charcoal` | Charcoal | Fire |
| `mystic-water` | Mystic Water | Water |
| `miracle-seed` | Miracle Seed | Grass |
| `magnet` | Magnet | Electric |
| `never-melt-ice` | Never-Melt Ice | Ice |
| `twisted-spoon` | Twisted Spoon | Psychic |
| `black-belt` | Black Belt | Fighting |
| `poison-barb` | Poison Barb | Poison |
| `soft-sand` | Soft Sand | Ground |
| `sharp-beak` | Sharp Beak | Flying |
| `silver-powder` | Silver Powder | Bug |
| `hard-stone` | Hard Stone | Rock |
| `spell-tag` | Spell Tag | Ghost |
| `dragon-fang` | Dragon Fang | Dragon |
| `black-glasses` | Black Glasses | Dark |
| `metal-coat` | Metal Coat | Steel |
| `silk-scarf` | Silk Scarf | Normal |
| `fairy-feather` | Fairy Feather | Fairy |

All Plates (Flame Plate, Splash Plate, etc.) follow the same pattern. Implement alongside their type-booster counterparts if desired.

**Expert Belt** also fits here: `onDamageModifier: ({ effectiveness }) => effectiveness > 1 ? 1.2 : 1`.

---

## Tier 2 — Requires `onHealAfterAttack` (one new hook)

See `11-item-effects-architecture.md` for hook spec.

| Item id | Name | Effect |
|---------|------|--------|
| `shell-bell` | Shell Bell | Heals ⌊damage dealt / 8⌋ |

---

## Tier 3 — Requires `onAccuracyModifier` (one new hook)

See `11-item-effects-architecture.md` for hook spec.

| Item id | Name | Effect |
|---------|------|--------|
| `wide-lens` | Wide Lens | ×1.1 accuracy |
| `zoom-lens` | Zoom Lens | ×1.2 accuracy when moving second |
| `bright-powder` | Bright Powder | ×0.9 accuracy against holder |

---

## Not yet scoped

These require more significant engine work and are left for dedicated specs:

- **Metronome** — move-reuse counter on `PartyMember`; volatile state
- **Flame Orb / Toxic Orb** — end-of-turn self-inflicted status; new `onEndOfTurn` variant
- **King's Rock / Razor Fang** — flinch chance on any damaging move; interaction with Sheer Force
- **Sticky Barb** — on-contact transfer to attacker; complex ownership semantics
- **Iron Ball** — halves speed, enables Ground immunity removal; needs `onGroundImmunityOverride`
- **Lagging Tail / Full Incense** — always-last priority bracket; needs turn-order override
