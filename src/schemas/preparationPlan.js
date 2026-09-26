import { z } from "zod";

export const activityTypeEnum = z.enum([
  "learning",
  "guided_practice",
  "assessment",
  "remediation",
  "review",
  "interview_prep",
]);

export const stepStatusEnum = z.enum(["locked", "in_progress", "completed", "blocked"]);

export const preparationPlanStepSchema = z.object({
  stepId: z.string().min(1),
  order: z.number().int().min(1),
  skillId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  activityType: activityTypeEnum,
  prerequisite: z.string().nullable(),
  status: stepStatusEnum,
  failurePattern: z.string().nullable(),
  estimatedMinutes: z.number().min(0),
  progressionReason: z.string().optional(),
});

export const preparationPlanSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  status: z.enum(["active", "completed"]).default("active"),
  currentStep: z.string().nullable(),
  steps: z.array(preparationPlanStepSchema),
});

// POST /api/preparation-plans body
export const createPreparationPlanSchema = z.object({
  roleId: z.string().min(1),
});

// POST /api/preparation-plans/:planId/progress body
export const preparationPlanProgressSchema = z.object({
  stepId: z.string().min(1),
  completed: z.boolean(),
  assessmentScore: z.number().min(0).max(100).optional().nullable(),
});
