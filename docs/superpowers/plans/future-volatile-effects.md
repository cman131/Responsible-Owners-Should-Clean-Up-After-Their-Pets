# Future Volatile Effects

Items deferred from the 2026-08-27 effect engine scope. Ordered roughly by implementation complexity.

## Bind/Wrap trapping (prevent switching)

When a pokemon is bound, it cannot switch out. Requires changes to action validation in `BattleRoom` or wherever `canSwitch` is computed for the `action:request` payload. The `bound` volatile infrastructure (EOT damage, expiry counter) is already in scope for the initial effect engine.

## Sleep Talk / Snore

Moves that can be used while the user is asleep. Requires a pre-move exemption path: if the chosen move is Sleep Talk or Snore, bypass the sleep-blocked check. Sleep Talk picks a random non-Sleep-Talk move from the user's set and executes it.

## Encore

Forces the target to repeat its last used move for 3 turns. Requires tracking `lastMoveId` on `PartyMember` and validating the forced move in action dispatch.

## Taunt

Prevents the target from using status moves for 3 turns. Requires move-category check in action validation (disable status moves in the valid-moves list).

## Torment

Prevents the target from using the same move twice in a row. Requires tracking `lastMoveId` and disabling it in the valid-moves list.

## Embargo

Prevents the target from using held items for 5 turns. Requires an item-hook guard in `BattleEngine` and `EffectEngine`.

## Heal Block

Prevents healing moves and abilities for 5 turns. Requires guards in the heal path of `executeMove` and relevant ability hooks.

## Aqua Ring / Ingrain

End-of-turn self-heal volatile effects (1/16 max HP per turn). Straightforward EOT handler addition once the effect engine is in place.

## Leech Seed + switching interaction review

Currently, leech seed's `sourceSlotId` stores the attacker's slot — drain goes to whoever is active in that slot. This matches main-series behavior. Worth a regression test when force-switch (faint replacement) is implemented.

## Confusion + Oblivious / Own Tempo immunities

Ability-based immunity to confusion. `canApplyVolatile` (analogous to `canApplyStatus`) should check ability before applying confusion.
