# Tech Debt: Missing Fields in PokemonSlotEditor (EV/IV, Tera Type)

## State

Complete

Two data fields present in `PokemonSet` are never surfaced in `PokemonSlotEditor`: EV/IV spreads and Tera type. Both can be added to the same form in the same implementation pass.

---

## 1 — No EV/IV Editor

### Summary

The `PokemonSet` schema includes full EV and IV fields, but `PokemonSlotEditor` never renders controls for them. Every Pokémon is silently created with 0 EVs and 31 IVs regardless of what the builder might intend.

### Location

- `packages/client/src/admin/PokemonSlotEditor.tsx`
- `packages/shared/src/types/registry.ts` (PokemonSet definition)

### Root Cause

When a species is selected via `pickPokemon`, EVs and IVs are initialized to defaults and then never surfaced in the UI:

```tsx
// PokemonSlotEditor.tsx — defaults set but never editable
onChange({
  speciesId: species.id,
  // ...
  evs: value.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: value.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
});
```

The rendered form covers: species, nickname, level, ability, item, nature, and moves — but has no EV or IV inputs.

### Impact

- All Pokémon have 0 EVs and perfect IVs with no flexibility for competitive or narrative builds.
- Saved NPC profiles and player default teams store these 0/31 values permanently.
- No 508 EV cap enforcement or remaining-EV counter.

### Suggested Fix

Add a collapsible EV/IV section to `PokemonSlotEditor` below the nature field. Each stat row should have an EV input (0–252), an IV input (0–31), and a running EV total display.

```tsx
<details>
  <summary style={lbl}>EVs / IVs</summary>
  {(['hp','atk','def','spa','spd','spe'] as const).map((stat) => (
    <div key={stat} style={{ display:'flex', gap:8, alignItems:'center' }}>
      <span style={{ ...lbl, minWidth: 32 }}>{stat.toUpperCase()}</span>
      <input type="number" min={0} max={252}
        value={value.evs?.[stat] ?? 0}
        onChange={(e) => updateField('evs', { ...value.evs, [stat]: +e.target.value })} />
      <input type="number" min={0} max={31}
        value={value.ivs?.[stat] ?? 31}
        onChange={(e) => updateField('ivs', { ...value.ivs, [stat]: +e.target.value })} />
    </div>
  ))}
</details>
```

Total EV enforcement should clamp or warn when the sum exceeds 508.

---

## 2 — No Tera Type Picker

### Summary

The `PokemonSet` type includes an optional `teraType?: PokemonType` field, but `PokemonSlotEditor` never renders a control for it. There is no way to assign a Tera type to any Pokémon through the UI.

### Location

- `packages/client/src/admin/PokemonSlotEditor.tsx`
- `packages/shared/src/types/registry.ts` (PokemonSet.teraType)
- `packages/shared/src/types/pokemon.ts` (PokemonType union)

### Root Cause

The field exists in the data model but was simply never wired to a UI control. `pickPokemon` does not initialize `teraType` and `updateField` is never called for it.

### Impact

All Pokémon in all battles have no Tera type set. When Terastallization is used in the battle engine, every existing saved team will be missing this data.

### Suggested Fix

Add a Tera type `<select>` to `PokemonSlotEditor` below the nature or ability field. Options should be all 18 standard types from the `PokemonType` union. Default to the Pokémon's primary type on species pick; allow clearing to `undefined`.

```tsx
const TERA_TYPES: PokemonType[] = [
  'Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
  'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy',
];

<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <label style={lbl}>Tera</label>
  <select
    value={value.teraType ?? ''}
    onChange={(e) => updateField('teraType', e.target.value as PokemonType || undefined)}
    style={{ ...inp, width: 140 }}
  >
    <option value="">— none —</option>
    {TERA_TYPES.map((t) => (
      <option key={t} value={t} style={{ background: TYPE_COLORS[t] }}>{t}</option>
    ))}
  </select>
</div>
```

When picking a new species, default `teraType` to `species.types[0]`.
