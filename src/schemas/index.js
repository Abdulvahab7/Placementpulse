import { z } from "zod";

// ---- users ----
export const userProfileSchema = z.object({
  name: z.string().min(1).max(120),
  college: z.string().min(1).max(200),
  branch: z.string().min(1).max(120),
  year: z.number().int().min(1).max(6),
  targetRoles: z.array(z.string().min(1)).max(20).default([]),
  resumeUrl: z.string().url().optional().nullable(),
});
export const userProfileUpdateSchema = userProfileSchema.partial();

// ---- skills ----
export const skillSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
});

// ---- studentSkills ----
export const studentSkillSchema = z.object({
  skillId: z.string().min(1),
  evidenceScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  lastAssessed: z.string().datetime().optional(),
});
export const studentSkillUpdateSchema = studentSkillSchema.partial().extend({
  skillId: z.string().min(1),
});

// ---- companies ----
export const companySchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(["manual", "scraped", "partner"]),
});

// ---- roles ----
export const roleSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().min(1).max(200),
});

// ---- roleRequirements ----
// NOTE (Phase 2): sourceType here intentionally uses a different vocabulary than
// companySchema/roleSchema's sourceType. See PHASE_2_PRE_IMPLEMENTATION.md for why.
// - verified: confirmed directly from the company/employer
// - historical: derived from past confirmed placement cycles
// - student_contributed: reported by a student, unverified
// - ai_inferred: parsed by Gemini from a pasted JD; NEVER presented as verified
export const roleRequirementSourceType = z.enum([
  "verified",
  "historical",
  "student_contributed",
  "ai_inferred",
]);
export const importanceLevelEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);

// Map a HIGH/MEDIUM/LOW importance label to the numeric weight used by the Gap Engine.
export const importanceLevelToWeight = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 };

export const roleRequirementSchema = z.object({
  roleId: z.string().min(1),
  skillId: z.string().min(1),
  importance: z.number().min(0).max(1),
  importanceLevel: importanceLevelEnum.optional(),
  sourceType: roleRequirementSourceType,
});
export const roleRequirementUpdateSchema = roleRequirementSchema.partial();

// ---- attempts ----
// Phase 2 adds optional Failure Autopsy evidence fields on top of the Phase 1
// required fields. Nothing existing was removed or made stricter.
export const attemptContextType = z.enum(["coding", "aptitude", "interview"]);

export const attemptSchema = z.object({
  type: z.string().min(1).max(60),
  questionId: z.string().min(1),
  answer: z.string().max(5000),
  correct: z.boolean(),
  timeTaken: z.number().min(0),
  hintsUsed: z.number().int().min(0).default(0),
  attemptsCount: z.number().int().min(1).default(1),
  // ---- Phase 2: Failure Autopsy evidence (all optional, additive) ----
  contextType: attemptContextType.optional(),
  chosenApproach: z.string().max(2000).optional(),
  failedTestCases: z
    .array(
      z.object({
        name: z.string().max(200).optional(),
        tag: z.enum(["edge", "boundary", "typical", "large_input", "other"]).default("other"),
      })
    )
    .optional(),
  actualComplexity: z.string().max(40).optional(), // measured/submitted, e.g. "O(n^2)"
  expectedComplexity: z.string().max(40).optional(), // required for known constraints
  claimedComplexity: z.string().max(40).optional(), // student's own stated complexity
  approachStartedAt: z.string().datetime().optional(),
  codingStartedAt: z.string().datetime().optional(),
  expectedTimeLimit: z.number().min(0).optional(), // seconds, for timeManagementRisk
  finalCorrection: z.string().max(2000).optional(),
});

// ---- failurePatterns ----
// Phase 2 writes one failurePatterns doc per analyzed attempt (Gemini failure
// classification, always backed by deterministic evidence). Existing required
// fields are unchanged; new fields are optional additions.
export const failurePatternValues = z.enum([
  "algorithm_selection",
  "edge_cases",
  "implementation",
  "complexity_analysis",
  "time_management",
  "premature_solving",
  "technical_explanation",
]);

export const failurePatternSchema = z.object({
  pattern: z.string().min(1).max(200),
  frequency: z.number().int().min(0),
  severity: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string()).default([]),
  lastDetected: z.string().datetime().optional(),
  // ---- Phase 2: Failure Autopsy classification record ----
  attemptId: z.string().min(1).optional(),
  contextType: attemptContextType.optional(),
  failurePatternValue: failurePatternValues.optional(),
  confidence: z.number().min(0).max(1).optional(),
  intervention: z.string().max(2000).optional(),
  deterministicSignals: z.record(z.any()).optional(),
  source: z.enum(["gemini_classification"]).optional(),
});

// Gemini's raw structured output for failure classification, validated before storage.
export const geminiFailureClassificationSchema = z.object({
  failure_pattern: failurePatternValues,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).min(1),
  intervention: z.string().min(1).max(2000),
});

// Gemini's raw structured output for JD parsing, validated before storage.
export const geminiJdParseSchema = z.object({
  skills: z
    .array(
      z.object({
        skill: z.string().min(1).max(120),
        importance: importanceLevelEnum,
      })
    )
    .min(1),
});

// ---- interventions ----
export const interventionSchema = z.object({
  failurePattern: z.string().min(1).max(200),
  activity: z.string().min(1).max(200),
  status: z.enum(["pending", "in_progress", "completed"]).default("pending"),
  result: z.string().max(2000).optional().nullable(),
});

// ---- readiness ----
export const readinessSchema = z.object({
  roleId: z.string().min(1),
  overall: z.number().min(0).max(100),
  skillGaps: z.array(z.string()).default([]),
});

// ---- preparationPlans (Phase 3) ----
export {
  activityTypeEnum,
  stepStatusEnum,
  preparationPlanStepSchema,
  preparationPlanSchema,
  createPreparationPlanSchema,
  preparationPlanProgressSchema,
} from "./preparationPlan.js";

// ---- correction drills / reassessment (final phase) ----
export {
  drillQuestionSchema,
  correctionDrillSchema,
  createCorrectionDrillSchema,
  submitCorrectionDrillSchema,
  reassessmentSchema,
} from "./correctionDrill.js";
