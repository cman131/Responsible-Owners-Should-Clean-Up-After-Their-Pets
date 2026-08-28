import { z } from 'zod';

export const SecondarySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), status: z.string(), chance: z.number().int().min(0).max(100), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('stat'), stat: z.enum(['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']), stages: z.number().int(), chance: z.number().int().min(0).max(100), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('flinch'), chance: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal('confusion'), chance: z.number().int().min(0).max(100), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('drain'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil-hp'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('multihit'), hits: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]) }),
  z.object({ kind: z.literal('ohko') }),
  z.object({ kind: z.literal('selfdestruct'), variant: z.enum(['normal', 'memento', 'healingwish']) }),
  z.object({ kind: z.literal('charge'), chargeVolatile: z.string() }),
  z.object({ kind: z.literal('recharge') }),
]);

export const MoveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum([
    'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
    'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
    'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', '???',
  ]),
  category: z.enum(['physical', 'special', 'status']),
  basePower: z.number().int().min(0),
  accuracy: z.union([z.number().int().min(1).max(100), z.literal(true)]),
  pp: z.number().int().min(1).max(64),
  priority: z.number().int().min(-7).max(5),
  target: z.enum([
    'normal', 'self', 'allAdjacentFoes', 'allAdjacent',
    'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe', 'any',
    'allies', 'allyTeam', 'allySide', 'foeSide', 'all', 'randomNormal', 'scripted',
  ]),
  makesContact: z.boolean(),
  effectId: z.string().optional(),
  effect: z.string().optional(),
  effectChance: z.number().int().min(0).max(100).optional(),
  critRatio: z.number().int().min(0).optional(),
  secondaries: SecondarySchema.array().optional(),
});

export type ValidatedMove = z.infer<typeof MoveSchema>;
