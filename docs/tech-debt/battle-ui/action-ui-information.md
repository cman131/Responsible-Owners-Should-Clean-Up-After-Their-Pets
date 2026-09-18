# Tech Debt: Missing Information in Battle Action UI (Move Types, Target HP)

## State

InProgress

Two gaps in the information shown to players when selecting moves. Both involve surfacing existing battle state that the UI already has access to but doesn't display.

---

## 1 — Action Panel Has No Move Type Indicator

### Summary

The `ActionPanel` displays move name and remaining PP but no type badge or color. Players cannot see at a glance whether a move is Fire, Water, Normal, etc. This matters most in Terastallize scenarios (where type matters for STAB), when choosing between coverage moves, or when trying to avoid using a move into an obvious immunity.

### Problem Details

The `ActionPanel` receives the full move list from `ActionRequestPayload`. Each move object includes a `type` field (e.g., `'Fire'`, `'Water'`). The panel renders only the name and PP:

```tsx
{moves.map((move, i) => (
  <button key={i} onClick={() => onSelectMove(i)}>
    {move.name}  {/* PP shown separately */}
  </button>
))}
```

There is no type badge, no color background, and no type label anywhere on the button.

### Impact

Players must memorize or guess the type of every move their Pokémon knows. In a fast-paced battle this is a meaningful information gap, especially for moves with misleading names or for players less familiar with the game.

### Suggested Fix

Add a small type badge to each move button using the existing `TYPE_COLORS` map (or equivalent):

```tsx
{moves.map((move, i) => (
  <button key={i} onClick={() => onSelectMove(i)} style={{ ... }}>
    <span style={{
      background: TYPE_COLORS[move.type] ?? '#666',
      borderRadius: 3,
      padding: '1px 5px',
      fontSize: 10,
      color: '#fff',
      marginRight: 6,
    }}>
      {move.type}
    </span>
    {move.name}
  </button>
))}
```

---

## 2 — Targeting Dropdown Shows No HP for Target Pokémon

### Summary

When a player selects a move that requires choosing a target (doubles/multi formats), a `<select>` dropdown appears with target slot display names but no HP indicator. The admin's `NpcTabPanel` renders a VS summary with mini HP bars for every possible target — players get no equivalent.

### Problem Details

The targeting `<select>` only renders display names:

```tsx
<select onChange={(e) => setTargetSlotId(e.target.value)}>
  {targets.map((t) => (
    <option key={t.slotId} value={t.slotId}>{t.displayName}</option>
  ))}
</select>
```

`targets` comes from `ActionRequestPayload.targets`, which includes `slotId` and `displayName`. Current HP is available in `BattleContext` (the `slots` map or equivalent state), but is not threaded into the targeting UI.

### Impact

Players must look up at the HP bar row to figure out which target is worth hitting. In a multi-slot format with 4+ Pokémon on the field this requires significant eye movement and mental mapping. The admin already has this information inline.

### Suggested Fix

Thread current HP data into the targeting component and render it alongside each option. Since `<option>` elements don't support rich rendering, replace the `<select>` with a custom button group for targeting:

```tsx
<div>
  {targets.map((t) => {
    const slot = battleSlots[t.slotId];
    const hpPct = slot ? Math.round((slot.currentHp / slot.maxHp) * 100) : null;
    return (
      <button key={t.slotId} onClick={() => setTargetSlotId(t.slotId)}>
        {t.displayName}
        {hpPct !== null && (
          <span style={{ color: hpColor(hpPct), marginLeft: 8, fontSize: 11 }}>
            {hpPct}% HP
          </span>
        )}
      </button>
    );
  })}
</div>
```
