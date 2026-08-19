export interface DamageInput {
  level: number;
  attackStat: number;     // effective attack or sp.atk (with boosts already applied)
  defenseStat: number;    // effective defense or sp.def
  basePower: number;
  typeEffectiveness: number;  // 0 | 0.25 | 0.5 | 1 | 2 | 4
  stab: boolean;
  isBurned: boolean;      // halves physical damage if category = 'physical'
  randomFactor: number;   // 0.85–1.0 (for real battles, pick random; for tests, pass 1.0)
  isCritical?: boolean;
  otherModifiers?: number; // combined product of all other multipliers (items, abilities, etc.)
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

export function calcDamage(input: DamageInput): DamageResult {
  const {
    level, attackStat, defenseStat, basePower,
    typeEffectiveness, stab, isBurned, randomFactor,
    isCritical = false, otherModifiers = 1,
  } = input;

  if (basePower === 0) return { damage: 0, isCrit: false };

  // Step 1: base damage
  let dmg = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * basePower * attackStat) / defenseStat) / 50) + 2;

  // Step 2: critical hit
  if (isCritical) dmg = Math.floor(dmg * 1.5);

  // Step 3: random factor (85–100%)
  dmg = Math.floor(dmg * randomFactor);

  // Step 4: STAB
  if (stab) dmg = Math.floor(dmg * 1.5);

  // Step 5: type effectiveness
  dmg = Math.floor(dmg * typeEffectiveness);

  // Step 6: burn
  if (isBurned) dmg = Math.floor(dmg / 2);

  // Step 7: other modifiers (items, abilities, etc.) — multiplicative chain
  dmg = Math.floor(dmg * otherModifiers);

  return { damage: Math.max(1, dmg), isCrit: isCritical };
}

export function randomDamageFactor(): number {
  // returns a value in [0.85, 1.0] matching PS's damage roll
  return (85 + Math.floor(Math.random() * 16)) / 100;
}
