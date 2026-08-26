import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const movesPath = join(__dirname, '../moves.json');
const moves = JSON.parse(readFileSync(movesPath, 'utf-8'));

const secondaryEffects = {
  'flamethrower': { effect: 'brn', effectChance: 10 },
  'fireblast':    { effect: 'brn', effectChance: 10 },
  'firepunch':    { effect: 'brn', effectChance: 10 },
  'lavaplume':    { effect: 'brn', effectChance: 30 },
  'scald':        { effect: 'brn', effectChance: 30 },
  'thunderbolt':  { effect: 'par', effectChance: 10 },
  'thunder':      { effect: 'par', effectChance: 30 },
  'thunderpunch': { effect: 'par', effectChance: 10 },
  'bodyslam':     { effect: 'par', effectChance: 30 },
  'icebeam':      { effect: 'frz', effectChance: 10 },
  'blizzard':     { effect: 'frz', effectChance: 10 },
  'icepunch':     { effect: 'frz', effectChance: 10 },
  'poisonsting':  { effect: 'psn', effectChance: 30 },
  'poisonjab':    { effect: 'psn', effectChance: 30 },
  'sludgebomb':   { effect: 'psn', effectChance: 30 },
  'sludge':       { effect: 'psn', effectChance: 30 },
};

const updated = moves.map(m => {
  const eff = secondaryEffects[m.id];
  return eff ? { ...m, ...eff } : m;
});

writeFileSync(movesPath, JSON.stringify(updated, null, 2));
const found = Object.keys(secondaryEffects).filter(id => moves.some(m => m.id === id));
console.log(`Updated ${found.length} moves: ${found.join(', ')}`);
