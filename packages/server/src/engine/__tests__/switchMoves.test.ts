/*
 * Pivot-Switch Flow Contract
 * ==========================
 * This file tests all "pivot" status moves: Baton Pass, Shed Tail, Parting Shot, Teleport,
 * Roar, and Whirlwind. They all extend or mirror the pivot infrastructure used by U-turn /
 * Volt Switch (damaging pivot moves).
 *
 * End-to-end flow for a pivot-switch move:
 *   1. BattleEngine.executeMove() detects `secs.some(sec => sec.kind === 'pivot')` after the
 *      move resolves. If the attacker has a bench member, it returns `{ pivotSwitch: true }`.
 *   2. resolveTurn() (BattleEngine.ts ~L153) catches `moveResult.pivotSwitch`, records which
 *      slots still need to act (remainingActions / remainingSlotOrder), and immediately returns
 *      `{ pivotSlots: [slotId], remainingActions, remainingSlotOrder, movedSlotIds }`.
 *   3. BattleRoom.ts (~L491) receives `result.pivotSlots`, stores the interrupted-turn context
 *      in `this.interruptedTurnContext`, and invokes `onSwitchRequestCb` so the client is
 *      prompted to select a replacement.
 *   4. The player responds; BattleRoom calls
 *      `engine.processForceSwitch(state, slotId, targetInstanceId, 'forced')` which delegates
 *      to `performSwitch` — the same path used by all regular switches (ability hooks, hazards,
 *      volatile cleanup, stat-boost resets, etc.).
 *   5. After the forced switch resolves, BattleRoom calls `engine.resumeTurn(...)` with the
 *      saved context to finish any remaining actions in the original turn order.
 *
 * Status pivot moves follow this same contract. The key differences per move are:
 *   - Baton Pass: pass volatile status and stat boosts to the incoming partner.
 *   - Shed Tail: pass a Substitute to the incoming partner.
 *   - Parting Shot: lower target's Atk+SpAtk before switching out (fails vs. Dark types).
 *   - Teleport: switch self without any side effects (fails if attacker is at full-speed trap).
 *   - Roar / Whirlwind: force the *opponent* to switch to a random bench member (phazing).
 */

import { describe, it } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _engine = new BattleEngine();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _state = make1v1State();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _bench = makePokemon({ instanceId: 'p1-bench' });

describe('switchMoves', () => {
  it.todo('placeholder — individual move suites will be added in subsequent tasks');
});
