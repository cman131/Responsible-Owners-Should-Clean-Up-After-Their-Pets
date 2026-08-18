import { z } from 'zod';

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
});

export type ValidatedMove = z.infer<typeof MoveSchema>;
