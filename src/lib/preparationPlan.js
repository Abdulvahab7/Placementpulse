// Adaptive Preparation Engine (Phase 3).
//
// Deterministic, explainable plan generation on top of the existing Gap
// Engine (lib/gapEngine.js) and Failure Autopsy data (failurePatterns docs).
// Gemini is NOT used here — see PHASE_3_REPORT.md section 13 for why.
//
// Pipeline:
//   roleRequirements + studentSkills  --(gapEngine)-->  gap rows
//   gap rows + failurePatterns        --(this file)-->  prioritized skill order
//   prioritized skill order           --(this file)-->  ordered plan steps
//   step + progress evidence          --(this file)-->  progression / remediation decision

import { computeGaps } from "./gapEngine.js";

// ---------------------------------------------------------------------------
// 1. Failure pattern -> skill category heuristic (documented, centralized).
// failurePatterns docs are per-attempt and don't carry a skillId, so we map
// a failurePatternValue to the skill *categories* it most likely applies to.
// This is intentionally conservative and lives in one place so it can be
// swapped for a direct skillId link in a later phase without touching the
// rest of the engine.
// ---------------------------------------------------------------------------
export const FAILURE_PATTERN_TO_SKILL_CATEGORY = {
  algorithm_selection: ["DSA", "Algorithms"],
  edge_cases: ["DSA", "Algorithms", "Programming"],
  implementation: ["DSA", "Programming"],
  complexity_analysis: ["DSA", "Algorithms"],
  time_management: ["DSA", "Aptitude"],
  premature_solving: ["DSA", "Algorithms"],
  technical_explanation: ["Interview", "Communication"],
};

const SEVERITY_WEIGHT = { high: 1, medium: 0.6, low: 0.3 };

/**
 * failurePatternsForSkill(skill, failurePatternDocs)
 * Returns the subset of this user's failurePatterns docs whose pattern maps
 * to this skill's category, most-recent/most-severe first.
 */
export function failurePatternsForSkill(skill, failurePatternDocs) {
  const categories = new Set(
    Object.entries(FAILURE_PATTERN_TO_SKILL_CATEGORY)
      .filter(([, cats]) => cats.includes(skill.category))
      .map(([pattern]) => pattern)
  );
  if (categories.size === 0) return [];
  return failurePatternDocs
    .filter((d) => d.failurePatternValue && categories.has(d.failurePatternValue))
    .sort((a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0));
}

/**
 * failureBoost(skill, failurePatternDocs)
 * A 0..30 additive score bump: recurring, high-severity failures on a skill
 * push it up the priority order even if the raw gap score is close to
 * another skill's. Matches spec section 6/12 ("failure frequency/severity"
 * as an explicit priority input, and the roadmap must surface *why*).
 */
export function failureBoost(skill, failurePatternDocs) {
  const matches = failurePatternsForSkill(skill, failurePatternDocs);
  if (matches.length === 0) return 0;
  const severityScore = matches.reduce((sum, d) => sum + (SEVERITY_WEIGHT[d.severity] ?? 0), 0);
  const frequencyScore = Math.min(matches.length, 5) * 2; // diminishing, capped
  return Math.min(30, Math.round(severityScore * 4 + frequencyScore));
}

/**
 * prioritizeSkills(requirements, studentSkillsBySkillId, skillsById, failurePatternDocs)
 *
 * Combines the deterministic Gap Engine score with the Failure Autopsy
 * boost to produce the final preparation order. Returns rows sorted by
 * descending priorityScore, each carrying a human-readable `reason`.
 */
export function prioritizeSkills(requirements, studentSkillsBySkillId, skillsById, failurePatternDocs) {
  const gapRows = computeGaps(requirements, studentSkillsBySkillId);

  return gapRows
    .map((row) => {
      const skill = skillsById.get(row.skillId) || { id: row.skillId, name: row.skillId, category: "General" };
      const matchedFailures = failurePatternsForSkill(skill, failurePatternDocs);
      const boost = failureBoost(skill, failurePatternDocs);
      const priorityScore = Math.round((row.gap + boost) * 100) / 100;

      const reasonParts = [];
      reasonParts.push(
        row.requirementImportance === "HIGH"
          ? "High role requirement"
          : row.requirementImportance === "MEDIUM"
          ? "Medium role requirement"
          : "Low role requirement"
      );
      reasonParts.push(
        row.evidenceScore < 50
          ? "low demonstrated evidence"
          : row.evidenceScore < 75
          ? "moderate demonstrated evidence"
          : "strong demonstrated evidence"
      );
      if (matchedFailures.length > 0) {
        const top = matchedFailures[0];
        reasonParts.push(`recurring ${top.failurePatternValue.replace(/_/g, "-")} failures`);
      }

      return {
        ...row,
        skillName: skill.name,
        skillCategory: skill.category,
        failureBoost: boost,
        matchedFailurePatterns: matchedFailures.map((d) => d.failurePatternValue),
        priorityScore,
        reason: reasonParts.join(" + "),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

// ---------------------------------------------------------------------------
// 2. Step template expansion.
// Each prioritized skill becomes a short sequence of steps. If it has
// matched failure patterns, the sequence targets those patterns specifically
// instead of a generic "practice X" step (spec section 12).
// ---------------------------------------------------------------------------

const GENERIC_SEQUENCE = [
  { activityType: "learning", suffix: "Fundamentals review", minutes: 20 },
  { activityType: "guided_practice", suffix: "Guided practice", minutes: 30 },
  { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
];

const FAILURE_TARGETED_STEPS = {
  algorithm_selection: [
    { activityType: "learning", suffix: "Constraint identification", minutes: 15 },
    { activityType: "guided_practice", suffix: "Algorithm selection exercises", minutes: 30 },
    { activityType: "guided_practice", suffix: "Guided problems", minutes: 40 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  edge_cases: [
    { activityType: "learning", suffix: "Edge-case cataloguing", minutes: 15 },
    { activityType: "guided_practice", suffix: "Boundary & edge-case drills", minutes: 30 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  implementation: [
    { activityType: "learning", suffix: "Implementation walkthroughs", minutes: 20 },
    { activityType: "guided_practice", suffix: "Guided implementation practice", minutes: 35 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  complexity_analysis: [
    { activityType: "learning", suffix: "Complexity analysis review", minutes: 20 },
    { activityType: "guided_practice", suffix: "Complexity estimation drills", minutes: 30 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  time_management: [
    { activityType: "learning", suffix: "Time-boxing strategy", minutes: 15 },
    { activityType: "guided_practice", suffix: "Timed practice set", minutes: 30 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  premature_solving: [
    { activityType: "learning", suffix: "Problem decomposition", minutes: 15 },
    { activityType: "guided_practice", suffix: "Plan-before-code drills", minutes: 30 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
  technical_explanation: [
    { activityType: "learning", suffix: "Explanation structuring", minutes: 15 },
    { activityType: "guided_practice", suffix: "Mock explanation practice", minutes: 30 },
    { activityType: "assessment", suffix: "Mini assessment", minutes: 20 },
  ],
};

let stepCounter = 0;
function nextStepId() {
  stepCounter += 1;
  return `step_${Date.now().toString(36)}_${stepCounter}`;
}

/**
 * buildStepsForSkill(prioritizedSkillRow)
 * Returns an ordered array of step objects (no `order`/`status` yet — the
 * caller assigns those across the whole plan).
 */
export function buildStepsForSkill(row) {
  const templates =
    row.matchedFailurePatterns.length > 0
      ? FAILURE_TARGETED_STEPS[row.matchedFailurePatterns[0]] || GENERIC_SEQUENCE
      : GENERIC_SEQUENCE;

  const failureNote =
    row.matchedFailurePatterns.length > 0
      ? `Your recent attempts show repeated ${row.matchedFailurePatterns[0].replace(
          /_/g,
          "-"
        )} errors. This activity targets that weakness.`
      : `Targets the ${row.skillName} gap identified for this role.`;

  return templates.map((t, idx) => ({
    stepId: nextStepId(),
    skillId: row.skillId,
    title: `${row.skillName}: ${t.suffix}`,
    description: failureNote,
    activityType: t.activityType,
    prerequisite: idx === 0 ? null : "PREVIOUS_STEP", // resolved to a stepId by the caller
    status: "locked",
    failurePattern: row.matchedFailurePatterns[0] || null,
    estimatedMinutes: t.minutes,
  }));
}

/**
 * generatePlanSteps(prioritizedRows)
 * Flattens each skill's step sequence into one ordered plan, wiring
 * `prerequisite` to real stepIds and unlocking only the very first step.
 */
export function generatePlanSteps(prioritizedRows) {
  const steps = [];
  let order = 0;
  let lastStepId = null;

  for (const row of prioritizedRows) {
    const skillSteps = buildStepsForSkill(row);
    for (const step of skillSteps) {
      order += 1;
      const prerequisite = step.prerequisite === "PREVIOUS_STEP" ? lastStepId : lastStepId; // every step gates on the previous one
      steps.push({ ...step, order, prerequisite: order === 1 ? null : prerequisite });
      lastStepId = step.stepId;
    }
  }

  if (steps.length > 0) steps[0].status = "in_progress";
  return steps;
}

// ---------------------------------------------------------------------------
// 3. Progression rules — centralized, configurable thresholds (spec section 8).
// ---------------------------------------------------------------------------
export const PROGRESSION_CONFIG = {
  assessmentPassScore: 70, // 0-100
  blockingSeverities: ["high"], // an unresolved failure at this severity blocks progression
};

/**
 * evaluateProgression({ step, latestAssessmentScore, unresolvedHighSeverityFailure })
 * Returns { canProgress, reason }.
 * A student never advances purely because "time passed" — every call needs
 * explicit assessment evidence for `assessment`-type steps.
 */
export function evaluateProgression({ step, latestAssessmentScore = null, unresolvedHighSeverityFailure = false }) {
  if (step.activityType !== "assessment") {
    return { canProgress: true, reason: "Non-assessment step; completion is sufficient." };
  }
  if (latestAssessmentScore == null) {
    return { canProgress: false, reason: "No assessment evidence submitted yet." };
  }
  if (unresolvedHighSeverityFailure) {
    return {
      canProgress: false,
      reason: "A high-severity failure pattern for this skill is still unresolved.",
    };
  }
  if (latestAssessmentScore < PROGRESSION_CONFIG.assessmentPassScore) {
    return {
      canProgress: false,
      reason: `Assessment score ${latestAssessmentScore} is below the ${PROGRESSION_CONFIG.assessmentPassScore} threshold required to progress.`,
    };
  }
  return { canProgress: true, reason: "Assessment threshold met; no blocking failure pattern." };
}

/**
 * buildRemediationStep(step)
 * Inserts a remediation branch right after a failed assessment step,
 * returning to earlier practice rather than advancing (spec section 9).
 * Phase 4 will specialize this into the Correction Drill engine.
 */
export function buildRemediationStep(step) {
  return {
    stepId: nextStepId(),
    skillId: step.skillId,
    title: `${step.title.split(":")[0]}: Remediation`,
    description:
      "Progression requirements were not met. Revisit the fundamentals and guided practice for this skill before reattempting the assessment.",
    activityType: "remediation",
    prerequisite: step.stepId,
    status: "in_progress",
    failurePattern: step.failurePattern,
    estimatedMinutes: 30,
  };
}

/**
 * applyProgress(plan, { stepId, completed, assessmentScore, unresolvedHighSeverityFailure })
 *
 * Pure function: given a plan document and a progress event, returns the
 * updated `steps` array and `currentStep`. Does not touch Firestore —
 * the route layer persists the result.
 */
export function applyProgress(plan, { stepId, completed, assessmentScore = null, unresolvedHighSeverityFailure = false }) {
  const steps = plan.steps.map((s) => ({ ...s }));
  const idx = steps.findIndex((s) => s.stepId === stepId);
  if (idx === -1) {
    throw new Error(`Step ${stepId} not found in plan`);
  }
  const step = steps[idx];
  if (step.status === "locked") {
    throw new Error(`Step ${stepId} is locked and cannot receive progress yet.`);
  }

  if (!completed) {
    // Partial progress: leave status as in_progress, no branching decision yet.
    return { steps, currentStep: plan.currentStep };
  }

  const { canProgress, reason } = evaluateProgression({
    step,
    latestAssessmentScore: assessmentScore,
    unresolvedHighSeverityFailure,
  });

  if (canProgress) {
    step.status = "completed";
    step.progressionReason = reason;

    // Unlock the next step, if any, and remove it from being blocked.
    const nextIdx = steps.findIndex((s) => s.order === step.order + 1);
    let newCurrentStepId = plan.currentStep;
    if (nextIdx !== -1) {
      steps[nextIdx].status = "in_progress";
      newCurrentStepId = steps[nextIdx].stepId;
    } else {
      newCurrentStepId = null; // plan complete
    }
    return { steps, currentStep: newCurrentStepId };
  }

  // Progression blocked -> insert (or reuse) a remediation branch right after this step.
  step.status = "blocked";
  step.progressionReason = reason;

  const alreadyHasRemediation = steps.some(
    (s) => s.activityType === "remediation" && s.prerequisite === step.stepId
  );

  let updatedSteps = steps;
  let newCurrentStepId = plan.currentStep;

  if (!alreadyHasRemediation) {
    const remediation = buildRemediationStep(step);
    // Insert remediation immediately after `step`, shifting subsequent order values.
    updatedSteps = [];
    for (const s of steps) {
      updatedSteps.push(s);
      if (s.stepId === step.stepId) {
        updatedSteps.push({ ...remediation, order: s.order + 1 });
      }
    }
    updatedSteps = updatedSteps.map((s, i) => ({ ...s, order: i + 1 }));
    newCurrentStepId = remediation.stepId;
  } else {
    const remediationStep = updatedSteps.find(
      (s) => s.activityType === "remediation" && s.prerequisite === step.stepId
    );
    remediationStep.status = "in_progress";
    newCurrentStepId = remediationStep.stepId;
  }

  return { steps: updatedSteps, currentStep: newCurrentStepId };
}
