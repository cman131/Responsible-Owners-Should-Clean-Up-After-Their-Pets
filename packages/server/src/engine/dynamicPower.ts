export function resolvePower(
  move: { id: string; effectId?: string; basePower: number },
  attacker: Record<string, unknown>,
  target: Record<string, unknown>,
  field: Record<string, unknown>
): number {
  return move.basePower;
}
