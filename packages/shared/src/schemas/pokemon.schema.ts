import { z } from 'zod';

export const HeldItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  effectId: z.string().min(1),
  isBerry: z.boolean(),
  equippable: z.boolean(),
});

const StatsSchema = z.object({
  hp: z.number().int().min(1).max(255),
  atk: z.number().int().min(1).max(255),
  def: z.number().int().min(1).max(255),
  spa: z.number().int().min(1).max(255),
  spd: z.number().int().min(1).max(255),
  spe: z.number().int().min(1).max(255),
});

const PokemonTypeSchema = z.enum([
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', '???',
]);

export const PokemonSpeciesSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1),
  types: z.union([
    z.tuple([PokemonTypeSchema]),
    z.tuple([PokemonTypeSchema, PokemonTypeSchema]),
  ]),
  baseStats: StatsSchema,
  abilities: z.object({
    0: z.string(),
    1: z.string().optional(),
    H: z.string().optional(),
  }),
  baseExpYield: z.number().int().min(0),
  expGrowth: z.enum(['Erratic', 'Fast', 'MediumFast', 'MediumSlow', 'Slow', 'Fluctuating']),
  learnset: z.array(z.string()),
  evolutionStage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type ValidatedPokemonSpecies = z.infer<typeof PokemonSpeciesSchema>;
