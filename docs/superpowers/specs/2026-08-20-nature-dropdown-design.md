# Nature Dropdown Design

## Goal

Replace the free-text nature input in the TeamBuilder slot editor with a styled `<select>` dropdown showing all 25 valid Pokémon natures, each labelled with a stat-effect shorthand (e.g. `Adamant (+Atk / -SpA)` or `Hardy (neutral)`).

## Context

The TeamBuilder currently uses `<input type="text">` for the nature field, defaulting to `"hardy"`. The server's `NATURES` object in `packages/server/src/engine/stats.ts` already defines all 25 natures with their boost/drop stat pairs. The client has no validation — any string is accepted. This change constrains selection to valid natures and makes the stat effect immediately visible during selection.

## Design

### Data constant

A `NATURES` array is defined directly in `packages/client/src/admin/TeamBuilder.tsx` (only used there):

```ts
const NATURES = [
  { id: 'hardy',   boost: null,  drop: null  },
  { id: 'lonely',  boost: 'Atk', drop: 'Def' },
  { id: 'brave',   boost: 'Atk', drop: 'Spe' },
  { id: 'adamant', boost: 'Atk', drop: 'SpA' },
  { id: 'naughty', boost: 'Atk', drop: 'SpD' },
  { id: 'bold',    boost: 'Def', drop: 'Atk' },
  { id: 'relaxed', boost: 'Def', drop: 'Spe' },
  { id: 'impish',  boost: 'Def', drop: 'SpA' },
  { id: 'lax',     boost: 'Def', drop: 'SpD' },
  { id: 'timid',   boost: 'Spe', drop: 'Atk' },
  { id: 'hasty',   boost: 'Spe', drop: 'Def' },
  { id: 'jolly',   boost: 'Spe', drop: 'SpA' },
  { id: 'naive',   boost: 'Spe', drop: 'SpD' },
  { id: 'modest',  boost: 'SpA', drop: 'Atk' },
  { id: 'mild',    boost: 'SpA', drop: 'Def' },
  { id: 'quiet',   boost: 'SpA', drop: 'Spe' },
  { id: 'rash',    boost: 'SpA', drop: 'SpD' },
  { id: 'calm',    boost: 'SpD', drop: 'Atk' },
  { id: 'gentle',  boost: 'SpD', drop: 'Def' },
  { id: 'sassy',   boost: 'SpD', drop: 'Spe' },
  { id: 'careful', boost: 'SpD', drop: 'SpA' },
  { id: 'docile',  boost: null,  drop: null  },
  { id: 'serious', boost: null,  drop: null  },
  { id: 'bashful', boost: null,  drop: null  },
  { id: 'quirky',  boost: null,  drop: null  },
] as const;
```

Option label helper (inline, no separate function needed):

- `boost !== null` → `"Adamant (+Atk / -SpA)"` (title-cased id + stat pair)
- `boost === null` → `"Hardy (neutral)"`

### UI change

In `TeamBuilder.tsx`, replace:
```tsx
<input value={team[selectedSlot]?.nature ?? 'hardy'}
  onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
  style={{ ...inp, width: 100 }} />
```

With:
```tsx
<select value={team[selectedSlot]?.nature ?? 'hardy'}
  onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
  style={{ ...inp, width: 160 }}>
  {NATURES.map((n) => (
    <option key={n.id} value={n.id}>
      {n.id.charAt(0).toUpperCase() + n.id.slice(1)}
      {n.boost ? ` (+${n.boost} / -${n.drop})` : ' (neutral)'}
    </option>
  ))}
</select>
```

Width bumped from 100 to 160 to accommodate the longer label text.

### Type

`PokemonSet.nature` stays `string` in shared — no type-tightening in this change.

## Files Modified

- `packages/client/src/admin/TeamBuilder.tsx` — add `NATURES` constant, swap `<input>` for `<select>`

## Verification

1. Open TeamBuilder, select a slot with a Pokémon — nature field shows a dropdown with all 25 natures and stat shorthands
2. Change nature — value persists correctly on save/reload
3. `pnpm --filter @poke-fighter/client test --run` — all tests pass
