import { z } from 'zod';

export const judgementPreflightEvidenceKindSchema = z.enum([
  'trait',
  'equipment',
  'player_vitals',
  'actor',
  'organization',
  'current_place',
  'current_scene',
  'current_weather',
  'case',
  'memory',
  'current_matter',
  'story_turn',
  'player_input'
]);

export const judgementPreflightFactorProposalSchema = z
  .object({
    sourceType: z.enum([
      'trait',
      'equipment',
      'status',
      'environment',
      'preparation',
      'other'
    ]),
    sourceId: z.string().trim().min(1).optional(),
    evidenceRef: z
      .object({
        kind: judgementPreflightEvidenceKindSchema,
        refId: z.string().trim().min(1)
      })
      .strict()
      .optional(),
    polarity: z.enum(['advantage', 'disadvantage']),
    magnitude: z.enum(['minor', 'moderate', 'major']),
    reason: z.string().trim().min(1)
  })
  .strict();

export const judgementPreflightSchema = z
  .object({
    hasJudgement: z.boolean(),
    reasonSummary: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    category: z
      .enum([
        'observation',
        'chase',
        'melee',
        'armed',
        'firearm',
        'crowd',
        'negotiation',
        'endurance',
        'will',
        'thinking',
        'other'
      ])
      .optional(),
    primaryAttribute: z
      .enum(['body', 'action', 'perception', 'thinking', 'negotiation', 'will'])
      .optional(),
    secondaryAttribute: z
      .enum(['body', 'action', 'perception', 'thinking', 'negotiation', 'will'])
      .optional(),
    difficultyTier: z
      .enum(['easy', 'standard', 'hard', 'dangerous', 'extreme'])
      .optional(),
    stakesSummary: z.string().trim().min(1).optional(),
    targetActorId: z.string().trim().min(1).optional(),
    targetOrganizationId: z.string().trim().min(1).optional(),
    combatIntent: z
      .enum(['none', 'chase', 'melee', 'armed', 'firearm', 'crowd'])
      .default('none'),
    factorProposals: z.array(judgementPreflightFactorProposalSchema).max(12).default([])
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.hasJudgement) {
      return;
    }
    (
      [
        ['category', value.category],
        ['primaryAttribute', value.primaryAttribute],
        ['difficultyTier', value.difficultyTier]
      ] as const
    ).forEach(([field, fieldValue]) => {
      if (fieldValue !== undefined) return;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `hasJudgement=true 时必须返回 ${field}`
      });
    });
  });

export type JudgementPreflight = z.infer<typeof judgementPreflightSchema>;
export type JudgementPreflightFactorProposal = z.infer<
  typeof judgementPreflightFactorProposalSchema
>;
export type JudgementPreflightEvidenceKind = z.infer<
  typeof judgementPreflightEvidenceKindSchema
>;
