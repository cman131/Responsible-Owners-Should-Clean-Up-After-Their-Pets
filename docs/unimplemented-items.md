# Unimplemented Battle Items

Battle-relevant items in `data/items.json` that are not yet implemented in the engine. Intentionally excluded from the 2026-09-15 competitive items implementation pass.

Items that have no in-battle effect (fossils, Poké Balls, evolution stones, TRs) are omitted from this list entirely.

---

## Species-Specific Hold Items

These items only have an effect when held by a specific Pokémon species.

| Item | Holder | Effect |
|------|--------|--------|
| Light Ball | Pikachu | Doubles Atk and Sp.Atk |
| Thick Club | Cubone / Marowak | Doubles Atk |
| Lucky Punch | Chansey | +2 crit stages |
| Leek / Stick | Farfetch'd / Sirfetch'd | +2 crit stages |
| Deep Sea Scale | Clamperl | Doubles Sp.Def |
| Deep Sea Tooth | Clamperl | Doubles Sp.Atk |
| Quick Powder | Ditto (not transformed) | Doubles Speed |
| Metal Powder | Ditto (not transformed) | Doubles Defense |

---

## Reactive Stat-Boosting Items

Trigger a stat boost in response to being hit by a specific move type.

| Item | Trigger | Effect |
|------|---------|--------|
| Absorb Bulb | Hit by Water move | +1 Sp.Atk, consumed |
| Cell Battery | Hit by Electric move | +1 Atk, consumed |
| Luminous Moss | Hit by Water move | +1 Sp.Def, consumed |
| Snowball | Hit by Ice move | +1 Atk, consumed |
| Throat Spray | Uses a sound move | +1 Sp.Atk, consumed |
| Adrenaline Orb | Intimidated | +1 Speed, consumed |
| Blunder Policy | Move misses | +2 Speed, consumed |

---

## Opponent-Interaction Items

Affect what the opponent can do or copy from the opponent.

| Item | Effect |
|------|--------|
| Mirror Herb | Copies opponent's stat boosts once, consumed |
| Clear Amulet | Prevents holder's stats from being lowered |
| Protective Pads | Holder's moves don't make contact (no contact-triggered effects) |
| Punching Glove | 1.1× punch moves, punching moves don't make contact |
| Covert Cloak | Holder immune to secondary effects of moves |

---

## Format / Field Items

Situational items that interact with specific field conditions, trapping, or weight mechanics.

| Item | Effect |
|------|--------|
| Iron Ball | Removes Flying immunity to Ground; halves Speed |
| Ring Target | Removes holder's type immunities |
| Float Stone | Halves holder's weight |
| Shed Shell | Holder can always switch out (ignores trapping) |
| Room Service | Halves Speed in Trick Room, consumed |
| Binding Band | Increases trap damage (Wrap, Fire Spin, etc.) from 1/8 to 1/6 |
| Grip Claw | Trapping moves last 7 turns instead of 4–5 |
| Metronome | Increases power of consecutively used move, resets on switch |
| Utility Umbrella | Holder ignores weather effects on moves and abilities |
| Mental Herb | Cures infatuation, Taunt, Encore, Torment, Disable, Heal Block once |
| Loaded Dice | Multi-hit moves always hit max times |
| Heavy-Duty Boots | Holder ignores entry hazards (Stealth Rock, Spikes, etc.) |
| Destiny Knot | If holder is infatuated, infatuates the attacker too |
| Booster Energy | Activates Quark Drive / Protosynthesis if no active terrain/weather |

---

## Type-Change Items (Require Form-Change Support)

These items change the type of a Pokémon's moves or the Pokémon itself. Require species-specific form-change infrastructure not yet in the engine.

| Item | Holder | Effect |
|------|--------|--------|
| Plates (18 types) | Arceus | Changes Arceus's type and Judgment's type |
| Memories (18 types) | Silvally | Changes Silvally's type and Multi-Attack's type |
| Drives (Burn, Chill, Douse, Shock) | Genesect | Changes Genesect's type and Techno Blast's type |
| Griseous Orb / Core | Giratina | Changes form; Ghost/Dragon type boost |
| Adamant Orb / Crystal | Dialga | Dragon/Steel 1.2× boost |
| Lustrous Orb / Globe | Palkia | Water/Dragon 1.2× boost |
| Rusted Sword | Zacian | Changes to Crowned form |
| Rusted Shield | Zamazenta | Changes to Crowned form |

---

## Unimplemented Berries

Berries with complex or low-priority effects not included in the main berry implementation pass.

| Berry | Effect |
|-------|--------|
| Enigma Berry | Heals 1/4 max HP when hit by a super-effective move |
| Lansat Berry | +2 crit stages when at ≤25% HP |
| Starf Berry | +2 to a random stat when at ≤25% HP |
| Leppa Berry | Restores 10 PP to the first move at 0 PP (requires PP tracking) |
