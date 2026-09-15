# Competitive Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ~50 competitive-meta battle items (berries, status orbs, passive boosts, reactive items, terrain seeds) with HP animations and battle-log events.

**Architecture:** All item effects register in the `ITEM_HOOKS` record in `packages/server/src/engine/items.ts`. BattleEngine calls hooks at specific points in move resolution and end-of-turn. HP changes emit `damage-dealt` or `heal` events; status effects emit `status-applied`. Several hook signatures must be extended before phase items can be added.

**Tech Stack:** TypeScript, Vitest (TDD), Node.js server engine.

---

### Task 1: Fix negative onEndOfTurn hpDelta animation bug

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts` (~line 2039)
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Black Sludge on a non-Poison type returns a negative `hpDelta` from `onEndOfTurn` but no `damage-dealt` event fires — the drain is invisible. This task fixes the missing branch and sets up the code path that Flame Orb / Toxic Orb (Task 9) will extend.

- [ ] **Step 1: Write the failing test**

Add inside `describe('BattleEngine.resolveTurn', ...)` in `BattleEngine.test.ts`:

```ts
it('Black Sludge on non-Poison type emits damage-dealt at end of turn', () => {
  const engine = new BattleEngine({ rng: () => 0 });
  const state = make1v1State();
  state.teams[0]!.slots[0]!.party[0]!.heldItem = 'black-sludge';
  // default ability is 'blaze' (non-Poison)
  const { newState, events } = engine.resolveTurn(state, {
    'slot-a1': { type: 'move', moveIndex: 3 }, // willowisp — no damage to p1 from p1
    'slot-b1': { type: 'move', moveIndex: 3 },
  });
  const p1 = newState.teams[0]!.slots[0]!.party[0]!;
  const sludgeDamage = Math.floor(100 / 8); // 12
  expect(p1.currentHp).toBeLessThanOrEqual(100 - sludgeDamage);
  expect(events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'black-sludge')).toBe(true);
});
```

- [ ] **Step 2: Run test to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Black Sludge on non-Poison"
```
Expected: FAIL — no `damage-dealt` event with source `black-sludge`.

- [ ] **Step 3: Fix BattleEngine.ts**

Find the block at ~line 2039–2048 (currently):
```ts
        const itemHooks = getItemHooks(active.heldItem);
        const hasEmbargo = active.volatileStatus.some(v => v.name === 'embargo');
        if (itemHooks.onEndOfTurn && !hasEmbargo) {
          const { hpDelta } = itemHooks.onEndOfTurn({ holder: active, state: s });
          if (hpDelta > 0) {
            const heal = Math.min(hpDelta, active.maxHp - active.currentHp);
            active.currentHp += heal;
            events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
          }
        }
```

Replace with:
```ts
        const itemHooks = getItemHooks(active.heldItem);
        const hasEmbargo = active.volatileStatus.some(v => v.name === 'embargo');
        if (itemHooks.onEndOfTurn && !hasEmbargo) {
          const eotResult = itemHooks.onEndOfTurn({ holder: active, state: s });
          const { hpDelta, statusToInflict } = eotResult;
          if (hpDelta > 0) {
            const heal = Math.min(hpDelta, active.maxHp - active.currentHp);
            if (heal > 0) {
              active.currentHp += heal;
              events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
            }
          } else if (hpDelta < 0) {
            const damage = Math.min(-hpDelta, active.currentHp);
            active.currentHp -= damage;
            events.push({ type: 'damage-dealt', data: { source: active.heldItem, slotId: slot.slotId, damage, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
          if (statusToInflict && !active.fainted && !active.status) {
            const activeTypes = this.resolveEffectiveTypes(active);
            const statusEvt = applyStatus(active, slot.slotId, statusToInflict as StatusCondition, activeTypes, undefined, s);
            if (statusEvt) events.push(statusEvt);
          }
        }
```

This also wires `statusToInflict` used by Flame Orb / Toxic Orb in Task 9, even though the interface doesn't declare it yet. The TypeScript error will be resolved in Task 2.

- [ ] **Step 4: Run test to confirm PASS**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Black Sludge on non-Poison"
```
Expected: PASS.

- [ ] **Step 5: Full suite**

```
cd packages/server && pnpm test
```
Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "fix: emit damage-dealt for negative onEndOfTurn hpDelta (Black Sludge animation bug)"
```

---

### Task 2: Extend ItemHooks interface + wire all new hook call sites

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`

This task makes all TypeScript interface additions and wires the engine call sites so later tasks can just add entries to `ITEM_HOOKS` without touching the engine.

- [ ] **Step 1: Replace the `ItemHooks` interface in items.ts**

Current interface (lines 16–37). Replace entirely with:

```ts
export interface ItemHooks {
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  /** May return a plain multiplier or { multiplier, consume } for berries that self-consume on hit */
  onDefenderModifier?: (ctx: ItemAttackContext) => number | { multiplier: number; consume?: boolean };
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  /** hpDelta<0 emits damage-dealt; statusToInflict used by Flame Orb / Toxic Orb */
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number; statusToInflict?: string };
  onAfterDamageTaken?: (ctx: ItemContext & {
    damageTaken: number;
    effectiveness?: number;
    moveType?: PokemonType;
    isPhysical?: boolean;
  }) => {
    hpDelta: number;
    statBoostDeltas?: Partial<StatBoosts>;
    consume?: boolean;
  };
  onAfterHit?: (ctx: ItemAttackContext & { makesContact: boolean; totalDamage: number }) => {
    directDamageToAttacker?: number;
    flinchTarget?: boolean;
    forceAttackerSwitch?: boolean;
    consume?: boolean;
  } | null;
  onStatusApplied?: (ctx: ItemContext & { status: string }) => { cureStatus: boolean; consume?: boolean } | null;
  onSpeedModifier?: (ctx: ItemContext) => number;
  critStageBonus?: number;
  screenExtension?: number;
  drainMultiplier?: number;
  onHealAfterAttack?: (ctx: ItemAttackContext & { damageDealt: number }) => { hpDelta: number };
  onAccuracyModifier?: (ctx: ItemContext & { move: Move; isFirst: boolean }) => number;
  /** Eject Button: return true to force the holder to switch out after taking direct damage */
  onAfterDamageTakenForceSwitch?: (ctx: ItemContext & { damageTaken: number }) => boolean;
  /** White Herb (restoreStats) + Eject Pack (forceSwitch) */
  onStatDropped?: (ctx: ItemContext) => { restoreStats?: boolean; forceSwitch?: boolean; consume: boolean };
  /** Terrain seeds: fires on switch-in and at end-of-turn when terrain is active */
  onSwitchIn?: (ctx: ItemContext & { terrain: string | null }) => { statBoostDeltas?: Partial<StatBoosts>; consume?: boolean } | undefined;
}
```

- [ ] **Step 2: Fix onDefenderModifier call site in BattleEngine.ts (~line 1377)**

Find:
```ts
        // Item-based defender modifier
        const defItemMod = getItemHooks(target.heldItem).onDefenderModifier?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: perTargetBasePower,
          target: attacker,
          isPhysical,
        });
        if (defItemMod !== undefined) otherModifiers *= defItemMod;
```

Replace with:
```ts
        // Item-based defender modifier
        let typeResistBerryToConsume = false;
        const defItemResult = getItemHooks(target.heldItem).onDefenderModifier?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: perTargetBasePower,
          target: attacker,
          isPhysical,
        });
        if (defItemResult !== undefined) {
          const mult = typeof defItemResult === 'number' ? defItemResult : defItemResult.multiplier;
          otherModifiers *= mult;
          if (typeof defItemResult !== 'number' && defItemResult.consume) typeResistBerryToConsume = true;
        }
```

- [ ] **Step 3: Consume type-resist berry after damage is applied**

Find the Air Balloon pop block (~line 1654):
```ts
      // Air Balloon pop (any damaging hit bursts the balloon)
      if (totalDamage > 0 && target.heldItem === 'air-balloon') {
```

Add immediately AFTER the closing `}` of the Air Balloon block:
```ts
      // Type-resist berry: consumed after damage calculation
      if (typeResistBerryToConsume && totalDamage > 0 && target.heldItem) {
        const consumed = target.heldItem;
        target.lastConsumedItem = consumed;
        delete target.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
      }
```

- [ ] **Step 4: Add moveType + isPhysical to the defender onAfterDamageTaken call site (~line 1674)**

Find:
```ts
          const berryResult = berryHooks.onAfterDamageTaken({
            holder: target,
            state: s,
            damageTaken: totalDamage,
            effectiveness,
          });
```

Replace with:
```ts
          const berryResult = berryHooks.onAfterDamageTaken({
            holder: target,
            state: s,
            damageTaken: totalDamage,
            effectiveness,
            moveType: effectiveMoveType,
            isPhysical,
          });
```

- [ ] **Step 5: Expand onAfterHit to handle flinchTarget + forceAttackerSwitch (~line 1629)**

Find:
```ts
        if (helmetResult?.directDamageToAttacker) {
          const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
          attacker.currentHp -= dmg;
          events.push({ type: 'damage-dealt', data: { source: 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
```

Replace with:
```ts
        if (helmetResult) {
          if (helmetResult.directDamageToAttacker && !attacker.fainted) {
            const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
            attacker.currentHp -= dmg;
            events.push({ type: 'damage-dealt', data: { source: target.heldItem ?? 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              attacker.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (helmetResult.flinchTarget && !attacker.fainted) {
            attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'flinch');
            attacker.volatileStatus.push({ name: 'flinch' });
          }
          if (helmetResult.consume && target.heldItem) {
            const consumed = target.heldItem;
            target.lastConsumedItem = consumed;
            delete target.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
          }
          if (helmetResult.forceAttackerSwitch && !attacker.fainted) {
            const atkTeam = s.teams.find(t => t.slots.some(sl => sl.slotId === attackerSlotId));
            const atkSlot = atkTeam?.slots.find(sl => sl.slotId === attackerSlotId);
            if (atkSlot) {
              const bench = atkSlot.party.filter((m, i) => i !== atkSlot.activePokemonIndex && !m.fainted);
              if (bench.length > 0) {
                const pick = bench[Math.floor(this.rng() * bench.length)]!;
                const redCardResult = this.performSwitch(s, attackerSlotId, pick.instanceId, 'phased');
                events.push(...redCardResult.events);
                s = redCardResult.newState;
              }
            }
            if (target.heldItem) {
              const consumed = target.heldItem;
              target.lastConsumedItem = consumed;
              delete target.heldItem;
              events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
            }
          }
        }
```

- [ ] **Step 6: Wire onAfterDamageTakenForceSwitch (Eject Button) after the berry block (~line 1697)**

After the closing `}` of the `onAfterDamageTaken` berry block, add:
```ts
      // Eject Button: force switch the DEFENDER after taking direct damage
      if (totalDamage > 0 && !target.fainted) {
        const ejectFires = getItemHooks(target.heldItem).onAfterDamageTakenForceSwitch?.({
          holder: target, state: s, damageTaken: totalDamage,
        });
        if (ejectFires) {
          const defTeam = s.teams.find(t => t.slots.some(sl => sl.slotId === targetSlotId));
          const defSlot = defTeam?.slots.find(sl => sl.slotId === targetSlotId);
          if (defSlot) {
            const bench = defSlot.party.filter((m, i) => i !== defSlot.activePokemonIndex && !m.fainted);
            if (bench.length > 0) {
              const pick = bench[Math.floor(this.rng() * bench.length)]!;
              const ejectResult = this.performSwitch(s, targetSlotId, pick.instanceId, 'phased');
              events.push(...ejectResult.events);
              s = ejectResult.newState;
            }
          }
          if (target.heldItem) {
            const consumed = target.heldItem;
            target.lastConsumedItem = consumed;
            delete target.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
          }
        }
      }
```

- [ ] **Step 7: Wire onStatDropped after applySecondaries (~line 1510)**

Find the `applySecondaries` call (the `postSecs` block). Add a snapshot BEFORE it:
```ts
          const preSecBoosts = { ...target.statBoosts };
          if (postSecs.length > 0 && !target.fainted && (!targetHasSub || isSoundMove) && !sheerForceActive) {
            events.push(...applySecondaries({
```

Then, after the closing `}` of that `if` block and BEFORE the Lum Berry comment, add:
```ts
          // White Herb / Eject Pack: fire when a stat was just lowered
          if (!target.fainted && target.heldItem) {
            const statWasDropped = (Object.keys(target.statBoosts) as (keyof StatBoosts)[]).some(
              k => target.statBoosts[k] < preSecBoosts[k]!
            );
            if (statWasDropped) {
              const dropResult = getItemHooks(target.heldItem).onStatDropped?.({ holder: target, state: s });
              if (dropResult) {
                if (dropResult.restoreStats) {
                  const toRestore = (Object.keys(target.statBoosts) as (keyof StatBoosts)[]).filter(k => target.statBoosts[k] < 0);
                  for (const k of toRestore) target.statBoosts[k] = 0;
                  if (toRestore.length > 0) {
                    events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: Object.fromEntries(toRestore.map(k => [k, 0])) } });
                  }
                }
                if (dropResult.forceSwitch && !target.fainted) {
                  const defTeam2 = s.teams.find(t => t.slots.some(sl => sl.slotId === targetSlotId));
                  const defSlot2 = defTeam2?.slots.find(sl => sl.slotId === targetSlotId);
                  if (defSlot2) {
                    const bench = defSlot2.party.filter((m, i) => i !== defSlot2.activePokemonIndex && !m.fainted);
                    if (bench.length > 0) {
                      const pick = bench[Math.floor(this.rng() * bench.length)]!;
                      const packResult = this.performSwitch(s, targetSlotId, pick.instanceId, 'phased');
                      events.push(...packResult.events);
                      s = packResult.newState;
                    }
                  }
                }
                if (dropResult.consume && target.heldItem) {
                  const consumed = target.heldItem;
                  target.lastConsumedItem = consumed;
                  delete target.heldItem;
                  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
                }
              }
            }
          }
```

- [ ] **Step 8: Wire onSwitchIn item hook in performSwitch (~line 1922)**

Find:
```ts
    // 5. onSwitchIn ability hook
    if (incoming) {
      const incomingAbilityHooks = getAbilityHooks(incoming.ability);
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
      if (switchInResult) {
        this.applySwitchInResult(s, slotId, incoming, switchInResult, events);
      }
    }
```

Add directly after its closing `}`:
```ts
    // 5b. onSwitchIn item hook (terrain seeds)
    if (incoming) {
      const itemSwitchHooks = getItemHooks(incoming.heldItem);
      if (itemSwitchHooks.onSwitchIn) {
        const terrain = s.field.terrain?.type ?? null;
        const seedResult = itemSwitchHooks.onSwitchIn({ holder: incoming, state: s, terrain });
        if (seedResult?.statBoostDeltas) {
          events.push(applyStatBoost(incoming, slotId, seedResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
        }
        if (seedResult?.consume && incoming.heldItem) {
          const consumed = incoming.heldItem;
          incoming.lastConsumedItem = consumed;
          delete incoming.heldItem;
          events.push({ type: 'item-consumed', data: { slotId, item: consumed, reason: 'triggered' } });
        }
      }
    }
```

- [ ] **Step 9: Wire terrain seed activation at end-of-turn**

In the `endOfTurn` loop, after the `onEndOfTurn` item block (end of Task 1 fix), add:
```ts
        // Terrain seeds: also fire at EoT when terrain is active (handles terrain set mid-battle)
        if (!active.fainted && active.heldItem) {
          const seedEotHooks = getItemHooks(active.heldItem);
          if (seedEotHooks.onSwitchIn && s.field.terrain) {
            const seedResult = seedEotHooks.onSwitchIn({ holder: active, state: s, terrain: s.field.terrain.type });
            if (seedResult?.statBoostDeltas) {
              events.push(applyStatBoost(active, slot.slotId, seedResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
            }
            if (seedResult?.consume && active.heldItem) {
              const consumed = active.heldItem;
              active.lastConsumedItem = consumed;
              delete active.heldItem;
              events.push({ type: 'item-consumed', data: { slotId: slot.slotId, item: consumed, reason: 'triggered' } });
            }
          }
        }
```

- [ ] **Step 10: Run TypeScript check**

```
cd packages/server && pnpm tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 11: Run full suite**

```
cd packages/server && pnpm test
```
Expected: all pass.

- [ ] **Step 12: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts
git commit -m "feat: extend ItemHooks interface and wire all new hook call sites in BattleEngine"
```

---

### Task 3: Phase 1a — Status-cure berries (Cheri, Chesto, Pecha, Rawst, Aspear, Persim)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/effectFactories.ts` (Persim only)
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

`onStatusApplied` fires at two existing call sites (BattleEngine.ts:1526 and effectFactories.ts:66) — no engine changes needed for status conditions. Persim (confusion) is a volatile, handled inline in `effectFactories.ts`.

- [ ] **Step 1: Write failing tests**

```ts
describe('Status-cure berries', () => {
  it('Cheri Berry cures paralysis when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'cheri-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[1] = { moveId: 'thunderwave', currentPp: 20, maxPp: 20 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.status).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'cheri-berry')).toBe(true);
  });

  it('Rawst Berry cures burn when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'rawst-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[3] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Persim Berry cures confusion when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'persim-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'confuseray', currentPp: 10, maxPp: 10 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'confusion')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Status-cure berries"
```
Expected: all 3 FAILs.

- [ ] **Step 3: Add status-cure berry hooks to items.ts**

After the `'lum-berry'` entry in `ITEM_HOOKS`:
```ts
  'cheri-berry': {
    onStatusApplied: ({ status }) => status === 'par' ? { cureStatus: true, consume: true } : null,
  },
  'chesto-berry': {
    onStatusApplied: ({ status }) => status === 'slp' ? { cureStatus: true, consume: true } : null,
  },
  'pecha-berry': {
    onStatusApplied: ({ status }) => (status === 'psn' || status === 'tox') ? { cureStatus: true, consume: true } : null,
  },
  'rawst-berry': {
    onStatusApplied: ({ status }) => status === 'brn' ? { cureStatus: true, consume: true } : null,
  },
  'aspear-berry': {
    onStatusApplied: ({ status }) => status === 'frz' ? { cureStatus: true, consume: true } : null,
  },
  'persim-berry': {},  // handled inline in effectFactories.ts
```

- [ ] **Step 4: Add Persim inline check in effectFactories.ts**

In `packages/server/src/engine/effectFactories.ts`, find the `applyVolatileTarget` function inner loop:
```ts
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyVolatile(ctx.targets[i]!, ctx.targetSlotIds[i]!, ctx.userSlotId, volatile, counter, { bypassSub });
      if (event) {
        events.push(event);
```

Add directly after `events.push(event)`:
```ts
        // Persim Berry: cure confusion immediately when applied
        if (volatile === 'confusion') {
          const tgt = ctx.targets[i]!;
          const tgtSlotId = ctx.targetSlotIds[i]!;
          if (tgt.heldItem === 'persim-berry') {
            tgt.volatileStatus = tgt.volatileStatus.filter(v => v.name !== 'confusion');
            tgt.lastConsumedItem = 'persim-berry';
            delete tgt.heldItem;
            events.push({ type: 'volatile-cured', data: { slotId: tgtSlotId, volatile: 'confusion' } });
            events.push({ type: 'item-consumed', data: { slotId: tgtSlotId, item: 'persim-berry', reason: 'triggered' } });
          }
        }
```

- [ ] **Step 5: Run tests to confirm PASS**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Status-cure berries"
```
Expected: all 3 PASS.

- [ ] **Step 6: Full suite**

```
cd packages/server && pnpm test
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add status-cure berries (Cheri, Chesto, Pecha, Rawst, Aspear, Persim)"
```

---

### Task 4: Phase 1b — HP-restore berries (Oran Berry, Berry Juice)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('HP-restore berries', () => {
  it('Oran Berry heals 10 HP when HP is at or below 50% after taking damage', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'oran-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50; // exactly 50%
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === 10)).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Oran Berry does not trigger above 50% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'oran-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 51;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('oran-berry');
  });

  it('Berry Juice heals 20 HP when HP is at or below 50%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'berry-juice';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50;
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === 20)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "HP-restore berries"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'oran-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) =>
      holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
        ? { hpDelta: 10, consume: true }
        : { hpDelta: 0 },
  },
  'berry-juice': {
    onAfterDamageTaken: ({ holder, damageTaken }) =>
      holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
        ? { hpDelta: 20, consume: true }
        : { hpDelta: 0 },
  },
```

- [ ] **Step 4: Run to confirm PASS**

```
cd packages/server && pnpm test -- --reporter=verbose -t "HP-restore berries"
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add Oran Berry (10 HP) and Berry Juice (20 HP) at ≤50% HP"
```

---

### Task 5: Phase 1c — Type-resist berries (18 items)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Berries halve damage from their type. Chilan halves any Normal hit. All others only trigger on super-effective hits (`effectiveness > 1`). The `onDefenderModifier` extended return type from Task 2 handles consume-after-damage.

- [ ] **Step 1: Write failing tests**

```ts
describe('Type-resist berries', () => {
  it('Occa Berry halves a super-effective Fire hit and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    // p2 gets Grass type to make Fire SE; holds Occa Berry
    const stateWith = make1v1State();
    stateWith.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Grass'];
    stateWith.teams[1]!.slots[0]!.party[0]!.heldItem = 'occa-berry';
    const stateWithout = make1v1State();
    stateWithout.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Grass'];
    const { newState: withBerry } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: withoutBerry } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const dmgWith = 100 - withBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(withBerry.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(dmgWith).toBeLessThan(dmgWithout);
  });

  it('Occa Berry does not trigger when Fire hit is not super-effective', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State(); // default Charizard — Fire is not SE on Fire/Flying
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'occa-berry';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('occa-berry');
  });

  it('Chilan Berry halves any Normal-type hit', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[1]!.slots[0]!.party[0]!.heldItem = 'chilan-berry';
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState: withBerry } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: withoutBerry } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(withBerry.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    const dmgWith = 100 - withBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBeLessThan(dmgWithout);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Type-resist berries"
```

- [ ] **Step 3: Add all 18 berries to items.ts**

```ts
  // Type-resist berries — halve SE damage and consume (Chilan: halve any Normal hit)
  'occa-berry':   { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fire'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'passho-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Water'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'wacan-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Electric' && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'rindo-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Grass'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'yache-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ice'      && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'chople-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fighting' && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'kebia-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Poison'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'shuca-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ground'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'coba-berry':   { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Flying'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'payapa-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Psychic'  && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'tanga-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Bug'      && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'charti-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Rock'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'kasib-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Ghost'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'haban-berry':  { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Dragon'   && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'colbur-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Dark'     && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'babiri-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Steel'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
  'chilan-berry': { onDefenderModifier: ({ moveType }) => moveType === 'Normal' ? { multiplier: 0.5, consume: true } : 1 },
  'roseli-berry': { onDefenderModifier: ({ moveType, effectiveness }) => moveType === 'Fairy'    && (effectiveness ?? 1) > 1 ? { multiplier: 0.5, consume: true } : 1 },
```

- [ ] **Step 4: Run to confirm PASS**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Type-resist berries"
```

- [ ] **Step 5: Full suite**

```
cd packages/server && pnpm test
```

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add 18 type-resist berries (Occa through Roseli)"
```

---

### Task 6: Phase 1d — Confusion berries (Figy, Wiki, Mago, Aguav, Iapapa)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Heal ~1/3 maxHp when at ≤33% HP. No confusion side-effect (Gen 9+).

- [ ] **Step 1: Write failing tests**

```ts
describe('Confusion berries (Figy/Wiki/Mago/Aguav/Iapapa)', () => {
  it('Figy Berry heals floor(maxHp/3) when HP drops to or below 33%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'figy-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 33;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === Math.floor(100 / 3))).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Figy Berry does not trigger above 33% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'figy-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 34;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('figy-berry');
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Confusion berries"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'figy-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'wiki-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'mago-berry':  { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'aguav-berry': { onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
  'iapapa-berry':{ onAfterDamageTaken: ({ holder, damageTaken }) => holder.currentHp <= Math.floor(holder.maxHp / 3) && damageTaken > 0 ? { hpDelta: Math.floor(holder.maxHp / 3), consume: true } : { hpDelta: 0 } },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Confusion berries" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add confusion berries (Figy, Wiki, Mago, Aguav, Iapapa) — 1/3 HP heal at ≤33% HP"
```

---

### Task 7: Phase 1e — Custap Berry + Micle Berry

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts` (buildActionOrder)
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Custap sets `custap-active` volatile and grants priority within the holder's priority bracket. Micle sets `micle-active` and the accuracy modifier clears it on use.

- [ ] **Step 1: Write failing tests**

```ts
describe('Custap and Micle berries', () => {
  it('Custap Berry sets custap-active volatile when HP drops to ≤25%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'custap-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 25;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'custap-active')).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Custap-active holder moves before slower same-priority opponent', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    // Give p2 Custap-active volatile pre-baked (as if it was set last turn)
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'custap-active' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const moveEvents = events.filter(e => e.type === 'move-used');
    // p2 has custap-active so should move first despite lower speed
    expect(moveEvents[0]!.data['attackerSlotId']).toBe('slot-b1');
  });

  it('Micle Berry sets micle-active volatile at ≤25% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'micle-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 25;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'micle-active')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Custap and Micle"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'custap-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) => {
      if (damageTaken > 0 && holder.currentHp <= Math.floor(holder.maxHp / 4)) {
        holder.volatileStatus.push({ name: 'custap-active' });
        return { hpDelta: 0, consume: true };
      }
      return { hpDelta: 0 };
    },
  },
  'micle-berry': {
    onAfterDamageTaken: ({ holder, damageTaken }) => {
      if (damageTaken > 0 && holder.currentHp <= Math.floor(holder.maxHp / 4)) {
        holder.volatileStatus.push({ name: 'micle-active' });
        return { hpDelta: 0, consume: true };
      }
      return { hpDelta: 0 };
    },
    onAccuracyModifier: ({ holder }) => {
      if (holder.volatileStatus.some(v => v.name === 'micle-active')) {
        holder.volatileStatus = holder.volatileStatus.filter(v => v.name !== 'micle-active');
        return 1.2;
      }
      return 1;
    },
  },
```

- [ ] **Step 4: Wire Custap priority in buildActionOrder**

In `BattleEngine.ts`, find `buildActionOrder` (~line 220). The current entries build has `{ slotId, priority, spe, tieSeed }`. Extend it to include `hasCustap`:

Find:
```ts
      return { slotId, priority, spe: effectiveSpe, tieSeed: this.rng() };
```

Replace with:
```ts
      const hasCustap = active.volatileStatus.some(v => v.name === 'custap-active');
      return { slotId, priority, spe: effectiveSpe, tieSeed: this.rng(), hasCustap };
```

Then find the sort:
```ts
    return entries
      .sort((a, b) =>
        b.priority - a.priority ||
        (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
        a.tieSeed - b.tieSeed,
      )
      .map((e) => e.slotId);
```

Replace with:
```ts
    return entries
      .sort((a, b) =>
        b.priority - a.priority ||
        (b.hasCustap ? 1 : 0) - (a.hasCustap ? 1 : 0) ||
        (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
        a.tieSeed - b.tieSeed,
      )
      .map((e) => e.slotId);
```

- [ ] **Step 5: Run to confirm PASS**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Custap and Micle"
```

- [ ] **Step 6: Full suite**

```
cd packages/server && pnpm test
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add Custap Berry (priority within bracket) and Micle Berry (1.2x accuracy)"
```

---

### Task 8: Phase 1f — Reactive berries (Kee, Maranga, Jaboca, Rowap)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Kee/Maranga use `onAfterDamageTaken` with `isPhysical`. Jaboca/Rowap damage the attacker via `onAfterHit` (same path as Rocky Helmet).

- [ ] **Step 1: Write failing tests**

```ts
describe('Reactive berries', () => {
  it('Kee Berry gives +1 Defense when hit by a physical move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'kee-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 }; // physical
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(1);
    expect(p2.heldItem).toBeUndefined();
  });

  it('Maranga Berry gives +1 Sp.Def when hit by a special move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'maranga-berry';
    // flamethrower is special
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.spd).toBe(1);
    expect(p2.heldItem).toBeUndefined();
  });

  it('Jaboca Berry damages the attacker when hit by a physical move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'jaboca-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const jabocaDmg = Math.floor(100 / 8); // 12
    expect(p1.currentHp).toBeLessThanOrEqual(100 - jabocaDmg);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Reactive berries"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'kee-berry': {
    onAfterDamageTaken: ({ holder, damageTaken, isPhysical }) =>
      damageTaken > 0 && isPhysical
        ? { hpDelta: 0, statBoostDeltas: { def: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'maranga-berry': {
    onAfterDamageTaken: ({ holder, damageTaken, isPhysical }) =>
      damageTaken > 0 && !isPhysical
        ? { hpDelta: 0, statBoostDeltas: { spd: 1 }, consume: true }
        : { hpDelta: 0 },
  },
  'jaboca-berry': {
    onAfterHit: ({ isPhysical, holder, totalDamage }) =>
      isPhysical && totalDamage > 0
        ? { directDamageToAttacker: Math.floor(holder.maxHp / 8), consume: true }
        : null,
  },
  'rowap-berry': {
    onAfterHit: ({ isPhysical, holder, totalDamage }) =>
      !isPhysical && totalDamage > 0
        ? { directDamageToAttacker: Math.floor(holder.maxHp / 8), consume: true }
        : null,
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Reactive berries" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add reactive berries (Kee +Def, Maranga +SpDef, Jaboca/Rowap attacker damage)"
```

---

### Task 9: Phase 2a — Flame Orb + Toxic Orb

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

`onEndOfTurn` with `statusToInflict`. The `statusToInflict` wiring in Task 1 already calls `applyStatus` which handles immunity. Burn/toxic damage ticks already emit `damage-dealt` via EffectEngine.

- [ ] **Step 1: Write failing tests**

```ts
describe('Flame Orb and Toxic Orb', () => {
  it('Flame Orb burns the holder at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'flame-orb';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('Flame Orb does not re-burn an already-burned holder', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'flame-orb';
    state.teams[0]!.slots[0]!.party[0]!.status = 'brn';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // status stays brn, no duplicate application
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('Toxic Orb badly poisons the holder at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'toxic-orb';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('tox');
  });

  it('Toxic Orb does not inflict on Poison-immune holder', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'toxic-orb';
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Poison']; // Poison immune to poison
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Flame Orb and Toxic Orb"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'flame-orb': {
    onEndOfTurn: () => ({ hpDelta: 0, statusToInflict: 'brn' }),
  },
  'toxic-orb': {
    onEndOfTurn: () => ({ hpDelta: 0, statusToInflict: 'tox' }),
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Flame Orb and Toxic Orb" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add Flame Orb (burn at EoT) and Toxic Orb (badly poison at EoT)"
```

---

### Task 10: Phase 2b — White Herb

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

`onStatDropped` hook returns `{ restoreStats: true, consume: true }`. The engine wiring from Task 2 handles restoring all negative stat stages and consuming the item.

- [ ] **Step 1: Write failing tests**

```ts
describe('White Herb', () => {
  it('White Herb restores all negative stat stages when any stat is lowered', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'white-herb';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 }; // -2 Def
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(0); // restored from -2 to 0
    expect(p2.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'white-herb')).toBe(true);
  });

  it('White Herb only fires once (consumed after first trigger)', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'white-herb';
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.def = -2; // pre-existing drop
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // White Herb fires on first stat drop, then is consumed
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "White Herb"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'white-herb': {
    onStatDropped: () => ({ restoreStats: true, consume: true }),
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "White Herb" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add White Herb (restores negative stat stages on first drop)"
```

---

### Task 11: Phase 3 — Muscle Band + Wise Glasses

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

Two lines each. No new hooks, no animations (passive multipliers same as type-boosting items).

- [ ] **Step 1: Write failing tests**

```ts
describe('Muscle Band and Wise Glasses', () => {
  it('Muscle Band gives 1.1x damage on physical moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'muscle-band';
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const dmgWith = 100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBeGreaterThan(dmgWithout);
  });

  it('Wise Glasses gives 1.1x damage on special moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'wise-glasses';
    const stateWithout = make1v1State();
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (special)
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(
      100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp
    );
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Muscle Band and Wise Glasses"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'muscle-band': { onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.1 : 1 },
  'wise-glasses': { onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.1 : 1 },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Muscle Band and Wise Glasses" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add Muscle Band (1.1x physical) and Wise Glasses (1.1x special)"
```

---

### Task 12: Phase 4a — King's Rock + Razor Fang

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

10% flinch chance on moves that don't already have a flinch secondary. The `flinchTarget` wiring from Task 2 handles the volatile application.

- [ ] **Step 1: Write failing tests**

```ts
describe("King's Rock and Razor Fang", () => {
  it("King's Rock flinches the target with 10% probability", () => {
    // rng() => 0 means 0 < 0.1 → flinch triggers
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'kings-rock';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });

  it("King's Rock does not flinch when rng is above 10%", () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'kings-rock';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "King's Rock and Razor Fang"
```

- [ ] **Step 3: Add to items.ts**

The `onAfterHit` context has `ctx.state` which has access to the rng. But `onAfterHit` hooks don't receive the rng — BattleEngine's `rng` is private. The cleanest approach: the hook gets no rng, but `ITEM_HOOKS` entries are singletons. Instead, pass a `rng` through the context. Looking at the existing `ItemAttackContext`, there's no `rng` field.

Add `rng?: () => number` to `ItemAttackContext` in `items.ts`, pass it from the `onAfterHit` call site in `BattleEngine.ts`:

In `items.ts`, add `rng?: () => number` to `ItemAttackContext`:
```ts
export interface ItemAttackContext extends ItemContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
  isPhysical: boolean;
  effectiveness?: number;
  rng?: () => number;
}
```

In `BattleEngine.ts` at the `onAfterHit` call site (~line 1632), pass `rng: this.rng`:
```ts
        const helmetResult = getItemHooks(target.heldItem).onAfterHit?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical,
          makesContact: move.makesContact === true,
          totalDamage,
          rng: this.rng,
        });
```

Now add King's Rock and Razor Fang to `ITEM_HOOKS`:
```ts
  'kings-rock': {
    onAfterHit: ({ totalDamage, rng }) =>
      totalDamage > 0 && (rng?.() ?? Math.random()) < 0.1
        ? { flinchTarget: true }
        : null,
  },
  'razor-fang': {
    onAfterHit: ({ totalDamage, rng }) =>
      totalDamage > 0 && (rng?.() ?? Math.random()) < 0.1
        ? { flinchTarget: true }
        : null,
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "King's Rock and Razor Fang" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add King's Rock and Razor Fang (10% flinch on hit)"
```

---

### Task 13: Phase 4b — Eject Button + Eject Pack + Red Card

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

All three use hooks wired in Task 2. Forced switches pick a random bench member via `performSwitch`. Effect suppressed if bench is empty.

- [ ] **Step 1: Write failing tests**

```ts
describe('Eject Button, Eject Pack, Red Card', () => {
  it('Eject Button forces the holder to switch when it takes direct damage', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p2-mon2', stats: { hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 60 } });
    state.teams[1]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-button';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'eject-button')).toBe(true);
  });

  it('Eject Button does nothing when bench is empty', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-button';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // item consumed but no switch
    expect(events.some(e => e.type === 'pokemon-switched')).toBe(false);
  });

  it('White Herb fires when stats are lowered, Eject Pack forces switch', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p2-mon2' });
    state.teams[1]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-pack';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'eject-pack')).toBe(true);
  });

  it('Red Card forces the attacker to switch out', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p1-mon2' });
    state.teams[0]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'red-card';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-a1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'red-card')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Eject Button, Eject Pack, Red Card"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'eject-button': {
    onAfterDamageTakenForceSwitch: ({ damageTaken }) => damageTaken > 0,
  },
  'eject-pack': {
    onStatDropped: () => ({ forceSwitch: true, consume: true }),
  },
  'red-card': {
    onAfterHit: ({ totalDamage }) => totalDamage > 0 ? { forceAttackerSwitch: true } : null,
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Eject Button, Eject Pack, Red Card" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add Eject Button (force-switch on damage), Eject Pack (force-switch on stat drop), Red Card (force attacker switch)"
```

---

### Task 14: Phase 4c — Terrain Seeds (Electric, Grassy, Misty, Psychic)

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

`onSwitchIn` hook fires when terrain matches. Also fires at EoT when terrain is active (wired in Task 2 Step 9).

- [ ] **Step 1: Write failing tests**

```ts
describe('Terrain Seeds', () => {
  it('Electric Seed gives +1 Defense on switch-in when Electric Terrain is active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.field.terrain = { type: 'electric', turnsRemaining: 3 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'electric-seed';
    // Pre-existing active pokemon gets seed on EoT (terrain already active)
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.def).toBe(1);
    expect(p1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'electric-seed')).toBe(true);
  });

  it('Grassy Seed gives +1 Defense when Grassy Terrain is active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 3 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'grassy-seed';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(1);
  });

  it('Misty Seed gives +1 Sp.Def when Misty Terrain is active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.field.terrain = { type: 'misty', turnsRemaining: 3 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'misty-seed';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spd).toBe(1);
  });

  it('Electric Seed does not activate when terrain does not match', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 3 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'electric-seed';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('electric-seed');
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```
cd packages/server && pnpm test -- --reporter=verbose -t "Terrain Seeds"
```

- [ ] **Step 3: Add to items.ts**

```ts
  'electric-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'electric' ? { statBoostDeltas: { def: 1 }, consume: true } : undefined,
  },
  'grassy-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'grassy' ? { statBoostDeltas: { def: 1 }, consume: true } : undefined,
  },
  'misty-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'misty' ? { statBoostDeltas: { spd: 1 }, consume: true } : undefined,
  },
  'psychic-seed': {
    onSwitchIn: ({ terrain }) => terrain === 'psychic' ? { statBoostDeltas: { spd: 1 }, consume: true } : undefined,
  },
```

- [ ] **Step 4: Run to confirm PASS + full suite**

```
cd packages/server && pnpm test -- -t "Terrain Seeds" && pnpm test
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: add terrain seeds (Electric/Grassy +Def, Misty/Psychic +SpDef)"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| Fix negative onEndOfTurn hpDelta (Black Sludge) | Task 1 |
| Extend ItemHooks + wire all new hooks | Task 2 |
| Status-cure berries (Cheri/Chesto/Pecha/Rawst/Aspear/Persim) | Task 3 |
| HP-restore berries (Oran Berry, Berry Juice) | Task 4 |
| Type-resist berries (18 items) | Task 5 |
| Confusion berries (Figy/Wiki/Mago/Aguav/Iapapa) | Task 6 |
| Custap + Micle berries | Task 7 |
| Reactive berries (Kee/Maranga/Jaboca/Rowap) | Task 8 |
| Flame Orb + Toxic Orb | Task 9 |
| White Herb | Task 10 |
| Muscle Band + Wise Glasses | Task 11 |
| King's Rock + Razor Fang | Task 12 |
| Eject Button + Eject Pack + Red Card | Task 13 |
| Terrain Seeds | Task 14 |

All spec sections covered. No placeholders. Type names are consistent across all tasks (`effectiveMoveType`, `isPhysical`, `targetSlotId`, `attackerSlotId` match BattleEngine variable names seen in source). Hooks added in Task 2 match usage in Tasks 3–14.
