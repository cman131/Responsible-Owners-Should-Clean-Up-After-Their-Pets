const ACC_STAGE_MULTS: number[] = [
  1 / 3, 36, 43, 50, 60, 75, 100, 133, 166, 200, 250, 266, 300,
].map((v) => typeof v === 'number' && v > 1 ? v / 100 : v);

export function accuracyStageMultiplier(stage: number): number {
  const idx = Math.max(0, Math.min(12, stage + 6));
  return ACC_STAGE_MULTS[idx] ?? 1;
}

export function evasionStageMultiplier(stage: number): number {
  return accuracyStageMultiplier(stage);
}

export function computeHitChance(
  moveAccuracy: number | true,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
): number | 'always' {
  if (moveAccuracy === true) return 'always';
  const raw =
    (moveAccuracy * accuracyStageMultiplier(attackerAccuracyStage)) /
    evasionStageMultiplier(defenderEvasionStage);
  return Math.min(100, Math.max(1, Math.floor(raw)));
}
