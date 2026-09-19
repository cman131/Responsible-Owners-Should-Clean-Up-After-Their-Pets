import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PokemonSpeciesSchema, HeldItemSchema, MoveSchema } from '@poke-fighter/shared';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..');

function loadJson(file: string): unknown[] {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf-8')) as unknown[];
}

let errors = 0;

function validate<T>(
  label: string,
  schema: z.ZodType<T>,
  records: unknown[]
): void {
  let localErrors = 0;
  for (const record of records) {
    const result = schema.safeParse(record);
    if (!result.success) {
      console.error(`[${label}] Invalid record:`, JSON.stringify(record, null, 2));
      console.error('Errors:', result.error.flatten());
      localErrors++;
      errors++;
    }
  }
  const status = localErrors === 0 ? 'OK' : `${localErrors} errors`;
  console.log(`[${label}] Validated ${records.length} records — ${status}`);
}

validate('pokemon', PokemonSpeciesSchema, loadJson('pokemon.json'));
validate('moves', MoveSchema, loadJson('moves.json'));
validate('items', HeldItemSchema, loadJson('items.json'));

if (errors > 0) {
  console.error(`\n✗ Validation failed with ${errors} errors`);
  process.exit(1);
}

console.log('\n✓ All data valid');
