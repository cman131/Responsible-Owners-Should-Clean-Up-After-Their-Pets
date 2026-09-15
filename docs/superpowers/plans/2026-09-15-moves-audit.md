# Moves Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute five analysis passes across the engine, data, and UI layers, producing a gap report at `docs/superpowers/specs/2026-09-15-moves-audit-report.md`.

**Architecture:** Static code analysis — read source files directly, diff against known-good sets, and write findings into a structured markdown report. No production code is changed.

**Tech Stack:** Node.js (data analysis scripts), TypeScript source reading, manual inspection of registrations.ts, BattleContext.tsx, dynamicPower.ts.

---

### Task 1: Initialize report skeleton

**Files:**
- Create: `docs/superpowers/specs/2026-09-15-moves-audit-report.md`

- [ ] **Step 1: Create the report skeleton**

```markdown
# Moves Audit Report — 2026-09-15

## Engine Gaps
| Move ID | effectId | Gap type | Severity | Notes |
|---|---|---|---|---|

## UI Gaps
| Component | Gap description | Affected events / volatiles |
|---|---|---|

## Data Gaps
| Move ID | Field | Issue |
|---|---|---|
```

- [ ] **Step 2: Commit skeleton**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: init moves audit report skeleton"
```

---

### Task 2: Engine Pass 1 — Status move handler check

Diff effectIds of all status moves against registrations.ts keys.

**Files:**
- Read: `data/moves.json`
- Read: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Extract status effectIds**

```bash
node -e "
const moves = require('./data/moves.json');
const ids = [...new Set(moves.filter(m => m.category === 'status' && m.effectId).map(m => m.effectId))].sort();
console.log(ids.join('\n'));
" | wc -l
```

- [ ] **Step 2: Extract registration keys**

```bash
grep "r\.register('" packages/server/src/engine/registrations.ts | sed "s/.*r\.register('\([^']*\)'.*/\1/" | sort > /tmp/registered.txt
```

- [ ] **Step 3: Find unregistered effectIds**

```bash
node -e "
const { execSync } = require('child_process');
const moves = require('./data/moves.json');
const ids = [...new Set(moves.filter(m => m.category === 'status' && m.effectId).map(m => m.effectId))];
const reg = execSync(\"grep \\\"r.register('\\\" packages/server/src/engine/registrations.ts\").toString().match(/r\.register\('([^']+)'/g)?.map(s => s.slice(12,-1)) ?? [];
const regSet = new Set(reg);
const missing = ids.filter(id => !regSet.has(id));
console.log('MISSING:', missing);
"
```

Expected: `MISSING: [ 'naturepower' ]`

- [ ] **Step 4: Write findings to report**

Add `naturepower` row to Engine Gaps table.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit engine pass 1 — status handler gaps"
```

---

### Task 3: Engine Pass 2 — Physical/special unique-mechanic check

Inspect known-gap patterns against dynamicPower.ts, BattleEngine.ts (inline handlers), and registrations.ts.

**Files:**
- Read: `packages/server/src/engine/dynamicPower.ts`
- Read: `packages/server/src/engine/BattleEngine.ts` (lines 1495–1530)

- [ ] **Step 1: Verify pivot secondary is filtered**

```bash
grep -n "pivot" packages/server/src/engine/BattleEngine.ts
```

Expected: line ~1506 filters `sec.kind !== 'pivot'` — confirms uturn/voltswitch/flipturn never trigger switch.

- [ ] **Step 2: List dynamicPower TODO stubs**

```bash
grep -n "move.basePower" packages/server/src/engine/dynamicPower.ts
```

Expected: lines 148–158 show payback/avalanche/assurance/echoedvoice/rollout/iceball/retaliate all returning `move.basePower` unchanged.

- [ ] **Step 3: Verify trumpcard has no resolver**

```bash
node -e "
const moves = require('./data/moves.json');
console.log(moves.find(m => m.id === 'trumpcard'));
"
grep "trumpcard" packages/server/src/engine/dynamicPower.ts packages/server/src/engine/BattleEngine.ts
```

Expected: basePower=0, no resolver hit → 0 damage every time.

- [ ] **Step 4: Verify crash-on-miss moves have no handler**

```bash
grep -n "highjumpkick\|jumpkick" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/dynamicPower.ts
```

Expected: no output — confirmed wrong-behavior gaps.

- [ ] **Step 5: Verify type-removing moves have no handler**

```bash
grep -n "burnup\|doubleshock" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/dynamicPower.ts
```

Expected: no output.

- [ ] **Step 6: Verify Poltergeist, Bolt Beak, Fishious Rend have no handler**

```bash
grep -n "poltergeist\|boltbeak\|fishiousrend" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/dynamicPower.ts
```

Expected: no output.

- [ ] **Step 7: Verify Judgment/Multi-Attack have no type-lookup handler**

```bash
grep -n "judgment\|multiattack" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/dynamicPower.ts
```

Expected: no output.

- [ ] **Step 8: Verify locking moves have no lock mechanic**

```bash
grep -n "outrage\|petaldance\|thrash" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/dynamicPower.ts
```

Expected: no output — these deal damage as standard hits, never locking the user in.

- [ ] **Step 9: Write all wrong-behavior findings to report**

Add rows for: uturn/voltswitch/flipturn, trumpcard, payback, avalanche, assurance, echoedvoice, rollout, iceball, retaliate, highjumpkick, jumpkick, burnup, doubleshock, poltergeist, boltbeak, fishiousrend, judgment, multiattack, outrage, petaldance, thrash.

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit engine pass 2 — wrong-behavior gaps"
```

---

### Task 4: Engine Pass 3 — Data integrity check

Scan moves.json for basePower=0 on damaging moves, unknown target values, unknown secondary kinds.

**Files:**
- Read: `data/moves.json`

- [ ] **Step 1: Find damaging moves with basePower=0 and no inline case**

```bash
node -e "
const moves = require('./data/moves.json');
// Inline special cases from BattleEngine (OHKO, Counter family, fixed-damage, HP-halving, Endeavor, FinalGambit, BeatUp, Psywave, Present, SpitUp, Bide)
const INLINE = new Set(['sheercold','fissure','guillotine','horndrill','counter','mirrorcoat','metalburst','comeuppance','seismictoss','nightshade','dragonrage','sonichoom','superfang','naturesmadness','ruination','endeavor','finalgambit','beatup','psywave','present','spitup','bide']);
// dynamicPower resolvers
const DYNAMIC = new Set(['facade','flail','reversal','return','frustration','lowkick','grassknot','magnitude','wringout','crushgrip','hardpress','electroball','gyroball','trumpcard','heavyslam','heatcrash','punishment','naturalgift','foulplay','storedpower','ancientpower','machinepower','powertrip','payback','avalanche','assurance','echoedvoice','rollout','iceball','retaliate']);
const gaps = moves.filter(m => m.category !== 'status' && m.basePower === 0 && !INLINE.has(m.id) && !DYNAMIC.has(m.id) && !m.id.startsWith('10000000') && !m.id.startsWith('max') && !m.id.startsWith('gmax'));
console.log(gaps.map(m => m.id));
"
```

- [ ] **Step 2: Check for unrecognized target values**

```bash
node -e "
const moves = require('./data/moves.json');
const KNOWN = new Set(['normal','any','self','allySide','allyTeam','allyOrSelf','adjacentAllyOrSelf','allAdjacent','allAdjacentFoes','foeSide','all','scripted','randomNormal']);
const unknown = [...new Set(moves.map(m => m.target))].filter(t => !KNOWN.has(t));
console.log('Unknown targets:', unknown);
"
```

- [ ] **Step 3: Check for unrecognized secondary kinds**

```bash
node -e "
const moves = require('./data/moves.json');
const KNOWN = new Set(['status','stat','flinch','confusion','drain','recoil','recoil-hp','charge','multihit','ohko','volatile','binding','selfdestruct','recharge','clear-hazards-self','break-screens','pivot']);
const unknown = [];
for (const m of moves) {
  for (const s of m.secondaries ?? []) {
    if (!KNOWN.has(s.kind)) unknown.push({id:m.id, kind:s.kind});
  }
}
console.log('Unknown kinds:', [...new Set(unknown.map(x => x.kind))]);
"
```

- [ ] **Step 4: Write data gap findings to report**

Add any flagged moves to the Data Gaps table.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit engine pass 3 — data gaps"
```

---

### Task 5: UI Pass 1 — Battle log completeness

Check volatileAppliedText, volatileCuredText, and status-cured in BattleContext.tsx against all volatile names the engine emits.

**Files:**
- Read: `packages/client/src/battle/BattleContext.tsx` (lines 69–133)
- Read: `packages/server/src/engine/registrations.ts` (volatile-applied events)
- Read: `packages/server/src/engine/EffectEngine.ts` (volatile-cured events)

- [ ] **Step 1: Collect all volatile-applied events from engine**

```bash
grep "volatile-applied" packages/server/src/engine/registrations.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/EffectEngine.ts | grep -oP "volatile: '[^']+'" | sort -u
```

- [ ] **Step 2: Collect all volatile names handled in volatileAppliedText**

```bash
grep "case '" packages/client/src/battle/BattleContext.tsx | head -40
```

- [ ] **Step 3: Diff to find silent volatileAppliedText entries**

Volatiles emitted by the engine but absent from the switch:
- `infatuation`, `yawn`, `nightmare`, `focusenergy`, `laser-focus`, `imprison`, `magic-coat`, `snatch`, `dragon-cheer`, `foresight`, `miracle-eye`, `electrify`, `octolock`, `type-changed`, `minimize`, `geomancy-charge`, `transformed`, `mimic`, `power-trick`, `psych-up`, `sketch`, `charging-solarbeam`

- [ ] **Step 4: Check volatile-cured gaps**

```bash
grep "volatile-cured" packages/server/src/engine/EffectEngine.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/registrations.ts | grep -oP "volatile: '[^']+'"
```

Compare against cases in `volatileCuredText`. Missing: `lock-on`, `powder`, `power-trick`.

- [ ] **Step 5: Check status-cured event text**

```bash
grep -A5 "case 'status-cured'" packages/client/src/battle/BattleContext.tsx
```

Confirm only 'slp' produces visible text; brn/par/frz/psn/tox cures are silent.

- [ ] **Step 6: Check move-note MOVE_NOTE_TEXT coverage**

```bash
grep "move-note" packages/server/src/engine/registrations.ts | grep -oP "note: '[^']+'"
grep "MOVE_NOTE_TEXT" packages/client/src/battle/BattleContext.tsx -A20
```

Notes with no entry: `pp-reduced-by-N`, `item-bestowed`, `item-recycled`, `ability-swapped`, `ability-copied`, `ability-entrained`, `ability-changed-simple`, `ability-changed-insomnia`, `guard-split`, `power-split`, `power-shift`, `ally-switched`, `after-you`.

- [ ] **Step 7: Write UI gap findings to report**

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit UI pass 1 — battle log gaps"
```

---

### Task 6: UI Pass 2 — ActionPanel targeting and locked states

**Files:**
- Read: `packages/client/src/battle/overlays/ActionPanel.tsx`
- Read: `packages/client/src/battle/targeting.ts`

- [ ] **Step 1: Verify LOCKED_LABELS covers all lockedReason values**

`ActionRequestPayload['lockedReason']` = `'recharge' | 'sleep' | 'freeze' | 'bide'`.
`LOCKED_LABELS` in ActionPanel.tsx covers all four. ✓ No gap.

- [ ] **Step 2: Verify classifyTarget covers all MoveTarget values**

```bash
node -e "
const moves = require('./data/moves.json');
const targets = [...new Set(moves.map(m => m.target))].sort();
console.log(targets);
"
grep "classifyTarget\|case " packages/client/src/battle/targeting.ts
```

All 13 distinct target values in moves.json are handled. ✓ No gap.

- [ ] **Step 3: Write findings to report** (no gaps to add)

- [ ] **Step 4: Commit final report**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit UI pass 2 + finalize report"
```

---

### Task 7: Final report review

- [ ] **Step 1: Verify gap counts are reasonable**

```bash
wc -l docs/superpowers/specs/2026-09-15-moves-audit-report.md
```

- [ ] **Step 2: Check severity sort order within each section**

Manually verify High → Medium → Low sort within Engine Gaps and UI Gaps sections.

- [ ] **Step 3: Commit if any corrections made**

```bash
git add docs/superpowers/specs/2026-09-15-moves-audit-report.md
git commit -m "docs: moves audit report final corrections"
```
