# Tech Debt: BattleSettingsStep Is Extremely Minimal

## State

Complete

## Summary

Step 4 of the Battle Setup wizard ("Battle Settings") only offers a single text field for the battle's display label. There is no way to configure format, level cap, or any other rule through the UI.

## Location

- `packages/client/src/admin/steps/BattleSettingsStep.tsx`
- `packages/server/src/setup/BattleConfigurator.ts` (builds the BattleState from config)

## Root Cause

`BattleSettingsStep` was implemented with minimal scope — just the label field. The `handleStart` payload sent to the server only includes `{ battleId, label, teams }`. `BattleConfigurator` derives everything else from the team data.

```tsx
// BattleSettingsStep.tsx — only label
function handleStart(e) {
  onStart({ label });
}
```

## Impact

- No way to set a level cap (e.g., all Pokémon capped at Level 50).
- No format selection (the engine may support multi-slot teams that imply doubles, but there's no explicit toggle).
- No weather, terrain, or side conditions at battle start.
- No timer or time-pressure setting.
- No spectator mode toggle.

As the battle engine grows in capability, the settings step will increasingly lag behind what the engine can actually do.

## Suggested Fix

Expand `BattleSettingsStep` and the `start-battle` payload progressively. Initial additions with the most value:

```tsx
interface BattleSettings {
  label: string;
  levelCap?: number;       // e.g. 50, 100, or undefined (use as-is)
  // future: format, weather, timer, etc.
}
```

`BattleConfigurator` should read these settings and apply them (e.g., clamp all Pokémon levels to `levelCap` during stat calculation).

The settings step UI can use a simple `<select>` for level cap:
```tsx
<label>Level Cap</label>
<select value={levelCap} onChange={(e) => setLevelCap(+e.target.value)}>
  <option value={0}>None (use as-is)</option>
  <option value={50}>50</option>
  <option value={100}>100</option>
</select>
```
