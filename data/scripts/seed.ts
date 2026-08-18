import { Dex } from '@pkmn/dex';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..'); // writes to data/

const gen9 = Dex.forGen(9);

// ── Growth rate mapping (PokeAPI name → our enum) ─────────────────────────────
const GROWTH_RATE_MAP: Record<string, string> = {
  'slow': 'Slow',
  'medium': 'MediumFast',
  'fast': 'Fast',
  'medium-slow': 'MediumSlow',
  'fast-then-very-slow': 'Fluctuating',
  'slow-then-very-fast': 'Erratic',
};

// ── Fetch exp data from PokeAPI ───────────────────────────────────────────────
// @pkmn/dex does not include baseExp or expGrowth (PS focuses on competitive,
// not level-up mechanics). We source these from PokeAPI which is authoritative.

interface PokeApiExpData {
  baseExpYield: number;
  expGrowth: string;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function fetchExpDataForDexNum(dexNum: number): Promise<PokeApiExpData> {
  try {
    const [pokemonRes, speciesRes] = await Promise.all([
      fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${dexNum}`),
      fetchWithRetry(`https://pokeapi.co/api/v2/pokemon-species/${dexNum}`),
    ]);

    const pokemon = await pokemonRes.json() as { base_experience: number | null };
    const species = await speciesRes.json() as { growth_rate: { name: string } };

    return {
      baseExpYield: pokemon.base_experience ?? 100,
      expGrowth: GROWTH_RATE_MAP[species.growth_rate.name] ?? 'MediumFast',
    };
  } catch {
    return { baseExpYield: 100, expGrowth: 'MediumFast' };
  }
}

// Collect unique positive dex numbers (formes share the base species' num)
const allSpeciesRaw = gen9.species.all();
const uniquePosDexNums = [...new Set(allSpeciesRaw.map(s => s.num).filter(n => n > 0))];

console.log(`Fetching exp data for ${uniquePosDexNums.length} species from PokeAPI...`);

const expDataMap = new Map<number, PokeApiExpData>();
const CONCURRENCY = 5;

for (let i = 0; i < uniquePosDexNums.length; i += CONCURRENCY) {
  const batch = uniquePosDexNums.slice(i, i + CONCURRENCY);
  const results = await Promise.all(
    batch.map(async (num) => ({ num, data: await fetchExpDataForDexNum(num) }))
  );
  for (const { num, data } of results) {
    expDataMap.set(num, data);
  }
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, uniquePosDexNums.length)}/${uniquePosDexNums.length}`);
  // Small pause between batches to avoid overwhelming PokeAPI
  if (i + CONCURRENCY < uniquePosDexNums.length) {
    await new Promise(r => setTimeout(r, 100));
  }
}
console.log('\n✓ Exp data fetched');

// ── Seed Pokémon species ──────────────────────────────────────────────────────
const allSpecies = allSpeciesRaw.map((s) => {
  // Compute evolution stage by traversing prevo chain
  let evolutionStage = 1;
  let cur = s;
  while (cur.prevo) {
    evolutionStage++;
    cur = gen9.species.get(cur.prevo);
  }

  const expData = s.num > 0
    ? (expDataMap.get(s.num) ?? { baseExpYield: 100, expGrowth: 'MediumFast' })
    : { baseExpYield: 100, expGrowth: 'MediumFast' };

  return {
    id: s.num,
    name: s.id,
    displayName: s.name,
    types: s.types,
    baseStats: s.baseStats,
    abilities: s.abilities,
    baseExpYield: expData.baseExpYield,
    expGrowth: expData.expGrowth,
    learnset: [] as string[],
    evolutionStage,
  };
});

// Fill learnsets — DexLearnsets only has async get(name), no all()
const learnsetResults = await Promise.all(
  allSpecies.map((s) => gen9.learnsets.get(s.name))
);

for (let i = 0; i < allSpecies.length; i++) {
  const ls = learnsetResults[i];
  allSpecies[i]!.learnset = ls?.learnset ? Object.keys(ls.learnset) : [];
}

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'pokemon.json'), JSON.stringify(allSpecies, null, 2));
console.log(`Seeded ${allSpecies.length} species`);

// ── Seed Moves ────────────────────────────────────────────────────────────────
const allMoves = gen9.moves.all().map((m) => ({
  id: m.id,
  name: m.name,
  type: m.type,
  category: m.category.toLowerCase() as 'physical' | 'special' | 'status',
  basePower: m.basePower,
  accuracy: m.accuracy,
  pp: m.pp,
  priority: m.priority,
  target: m.target,
  makesContact: m.flags?.contact === 1,
  effectId: m.id,
}));

writeFileSync(join(dataDir, 'moves.json'), JSON.stringify(allMoves, null, 2));
console.log(`Seeded ${allMoves.length} moves`);

// ── Seed Abilities ────────────────────────────────────────────────────────────
const allAbilities = gen9.abilities.all().map((a) => ({
  id: a.id,
  name: a.name,
  effectId: a.id,
}));

writeFileSync(join(dataDir, 'abilities.json'), JSON.stringify(allAbilities, null, 2));
console.log(`Seeded ${allAbilities.length} abilities`);

// ── Seed Held Items ───────────────────────────────────────────────────────────
const allItems = gen9.items.all().map((i) => ({
  id: i.id,
  name: i.name,
  effectId: i.id,
  isBerry: !!i.isBerry,
}));

writeFileSync(join(dataDir, 'items.json'), JSON.stringify(allItems, null, 2));
console.log(`Seeded ${allItems.length} items`);

// ── Seed Type Chart ───────────────────────────────────────────────────────────
// Gen 9 type chart as a 2D lookup: chart[attackingType][defendingType] = multiplier
// damageTaken is on the DEFENDER type: damageTaken[attackingType] = encoding
// encoding: 0=normal(1x), 1=super effective(2x), 2=not very effective(0.5x), 3=immune(0x)
const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

const chart: Record<string, Record<string, number>> = {};

function encodingToMultiplier(encoding: number): number {
  switch (encoding) {
    case 1: return 2;
    case 2: return 0.5;
    case 3: return 0;
    default: return 1; // 0 = normal
  }
}

for (const atk of TYPES) {
  chart[atk] = {};
  for (const def of TYPES) {
    const encoding = gen9.types.get(def).damageTaken[atk] ?? 0;
    chart[atk]![def] = encodingToMultiplier(encoding);
  }
}

writeFileSync(join(dataDir, 'typechart.json'), JSON.stringify(chart, null, 2));
console.log('Seeded type chart');

console.log('\n✓ All data seeded successfully');
