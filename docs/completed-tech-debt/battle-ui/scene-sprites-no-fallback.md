# 24 — BattleScene Sprite Images Have No Error Fallback

## State

Complete

## Summary

`BattleScene` loads animated Pokémon sprites from the PokémonShowdown CDN (`play.pokemonshowdown.com`). There is no `onError` handler on the `<img>` element. If the CDN is unreachable, the species name doesn't map cleanly (regional forms, custom names, whitespace), or the GIF simply doesn't exist, the image silently renders as a broken icon or empty space. The colored-box fallback only activates when `speciesName` is falsy — not when the image 404s.

## Problem Details

**File:** `packages/client/src/battle/BattleScene.tsx:65`

```tsx
const url = role === 'foe'
  ? `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(mon.speciesName)}.gif`
  : `https://play.pokemonshowdown.com/sprites/ani-back/${toShowdownId(mon.speciesName)}.gif`;
```

```tsx
{mon.speciesName ? (
  <img
    src={url}
    alt={mon.speciesName}
    style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
  />
) : (
  <div style={{ /* colored box fallback */ }} />
)}
```

If `mon.speciesName = 'Charizard'`, a URL is constructed and the fallback box is never shown — even if the image fails to load.

**File:** `packages/client/src/battle/utils.ts` — `toShowdownId()`

The function presumably lowercases and strips special characters, but edge cases (e.g. `"Mr. Mime"`, `"Nidoran♀"`, `"Farfetch'd"`, custom species) may produce invalid URLs.

## Impact

- Broken sprite icons in battle for any Pokémon whose name doesn't map to a valid Showdown sprite ID
- CDN unavailability (e.g. Showdown is down) results in all sprites disappearing — the battle scene shows only display name labels
- No graceful degradation to the colored-box placeholder

## Suggested Fix

Add an `onError` handler that falls back to the colored box:

```tsx
const [imgError, setImgError] = useState(false);

{mon.speciesName && !imgError ? (
  <img
    src={url}
    alt={mon.speciesName}
    onError={() => setImgError(true)}
    style={{ ... }}
  />
) : (
  <div style={{ background: role === 'foe' ? '#e74c3c' : '#2980b9', ... }} />
)}
```

Alternatively, pre-validate the sprite URL or maintain a local sprite set for commonly used Pokémon to eliminate the CDN dependency.

## Related Files

- `packages/client/src/battle/BattleScene.tsx`
- `packages/client/src/battle/utils.ts` (`toShowdownId`)
