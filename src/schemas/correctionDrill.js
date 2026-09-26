import { z } from "zod";

export const drillQuestionSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1).max(3000),
  options: z.array(z.string().min(1).max(500)).min(2).max(6),
  correctOption: z.number().int().min(0).max(5),
  explanation: z.string().min(1).max(2000),
});

export const correctionDrillSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  skillId: z.string().min(1),
  failurePattern: z.enum([
    "algorithm_selection",
    "edge_cases",
    "implementation",
    "complexity_analysis",
    "time_management",
    "premature_solving",
    "technical_explanation",
  ]),
  sourceAttemptIds: z.array(z.string()).default([]),
  questions: z.array(drillQuestionSchema).min(1).max(10),
  status: z.enum(["generated", "in_progress", "completed", "expired"]),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  score: z.number().min(0).max(100).nullable().optional(),
});

export const createCorrectionDrillSchema = z.object({
  roleId: z.string().min(1),
  skillId: z.string().min(1),
  failurePattern: correctionDrillSchema.shape.failurePattern,
  sourceAttemptIds: z.array(z.string()).max(20).default([]),
});

export const submitCorrectionDrillSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(5)),
});

export const reassessmentSchema = z.object({
  drillId: z.string().min(1),
  answers: z.record(z.string(), z.number().int().min(0).max(5)),
});
