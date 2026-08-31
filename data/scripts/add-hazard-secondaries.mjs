import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const movesPath = join(__dirname, '../moves.json');
const moves = JSON.parse(readFileSync(movesPath, 'utf-8'));

const hazardSecondaries = {
  'rapidspin':    [{ kind: 'clear-hazards-self' }],
  'brickbreak':   [{ kind: 'break-screens', screensOnly: true }],
  'psychicfangs': [{ kind: 'break-screens', screensOnly: false }],
  'ragingbull':   [{ kind: 'break-screens', screensOnly: false }],
};

const updated = moves.map(m => {
  const extra = hazardSecondaries[m.id];
  if (!extra) return m;
  const existing = Array.isArray(m.secondaries) ? m.secondaries : [];
  return { ...m, secondaries: [...existing, ...extra] };
});

writeFileSync(movesPath, JSON.stringify(updated, null, 2));
const found = Object.keys(hazardSecondaries).filter(id => moves.some(m => m.id === id));
console.log(`Updated ${found.length} moves: ${found.join(', ')}`);
