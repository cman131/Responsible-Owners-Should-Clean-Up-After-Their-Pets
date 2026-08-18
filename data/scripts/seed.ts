import { Dex } from '@pkmn/dex';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..'); // writes to data/

const gen9 = Dex.forGen(9);

// Helper: compute evolution stage from prevo chain
function getEvoStage(speciesId: string): number {
  let stage = 1;
  let current = gen9.species.getByID(speciesId as any);
  while (current.prevo) {
    stage++;
    current = gen9.species.get(current.prevo);
  }
  // stage is how deep from base — reverse it to get stage from base
  return stage;
}

// Actually we want stage FROM base: base=1, first evo=2, second evo=3
// The loop above goes backwards from current to base counting steps,
// so 'stage' already equals the correct evolution stage number.

// ── Seed Pokémon species ──────────────────────────────────────────────────────
const allSpecies = gen9.species.all().map((s) => {
  // Compute evolution stage by traversing prevo chain
  let evoStage = 1;
  let cur = s;
  while (cur.prevo) {
    evoStage++;
    cur = gen9.species.get(cur.prevo);
  }

  return {
    id: s.num,
    name: s.id,
    displayName: s.name,
    types: s.types,
    baseStats: s.baseStats,
    abilities: s.abilities,
    learnset: [] as string[],
    evolutionStage: evoStage,
  };
});

// Fill learnsets — DexLearnsets only has async get(name), no all()
// We load learnsets per species using Promise.all
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

type T = typeof TYPES[number];
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
    // Look up from defender's perspective: defType.damageTaken[atkType]
    const encoding = gen9.types.get(def).damageTaken[atk] ?? 0;
    chart[atk]![def] = encodingToMultiplier(encoding);
  }
}

writeFileSync(join(dataDir, 'typechart.json'), JSON.stringify(chart, null, 2));
console.log('Seeded type chart');

console.log('\n✓ All data seeded successfully');
