// Deterministic Gap Engine. No LLM opinion involved — every number here is
// computed from stored roleRequirements + studentSkills evidence.

import { importanceLevelToWeight } from "../schemas/index.js";

/**
 * importanceWeight(requirement) -> number in [0,1]
 * Prefers the explicit HIGH/MEDIUM/LOW label when present (matches the JD
 * parsing / spec vocabulary); falls back to the raw numeric `importance`
 * field for older/manually-entered requirements that only have that.
 */
export function importanceWeight(requirement) {
  if (requirement.importanceLevel && importanceLevelToWeight[requirement.importanceLevel] != null) {
    return importanceLevelToWeight[requirement.importanceLevel];
  }
  return typeof requirement.importance === "number" ? requirement.importance : 0.5;
}

export function importanceLabel(requirement) {
  if (requirement.importanceLevel) return requirement.importanceLevel;
  const w = importanceWeight(requirement);
  if (w >= 0.8) return "HIGH";
  if (w >= 0.45) return "MEDIUM";
  return "LOW";
}

/**
 * gapScore = importanceWeight * (100 - evidenceScore)
 * Range: 0 (fully covered, or not required) .. 100 (critical & no evidence).
 */
export function computeGapScore(requirement, evidenceScore) {
  const weight = importanceWeight(requirement);
  const score = Math.round(weight * (100 - evidenceScore) * 100) / 100;
  return Math.max(0, Math.min(100, score));
}

/**
 * priority bucket, derived purely from gapScore. Thresholds were chosen so
 * that a HIGH-importance requirement with evidence 52 (gap 48) lands in HIGH,
 * and one with evidence 81 (gap 19) lands in LOW — matching the Phase 2 spec's
 * worked example.
 */
export function gapPriority(gapScore) {
  if (gapScore >= 40) return "HIGH";
  if (gapScore >= 20) return "MEDIUM";
  return "LOW";
}

/**
 * computeGaps(requirements, studentSkillsBySkillId)
 * requirements: array of roleRequirement docs ({skillId, importance, importanceLevel, sourceType, ...})
 * studentSkillsBySkillId: Map<skillId, studentSkill doc> (evidenceScore 0-100)
 *
 * Returns an array of { skillId, requirementImportance, evidenceScore, gap, priority, sourceType }
 * sorted by descending gap (biggest gap first).
 */
export function computeGaps(requirements, studentSkillsBySkillId) {
  const rows = requirements.map((req) => {
    const studentSkill = studentSkillsBySkillId.get(req.skillId);
    const evidenceScore = studentSkill?.evidenceScore ?? 0;
    const gap = computeGapScore(req, evidenceScore);
    return {
      skillId: req.skillId,
      requirementImportance: importanceLabel(req),
      evidenceScore,
      gap,
      priority: gapPriority(gap),
      sourceType: req.sourceType,
    };
  });
  return rows.sort((a, b) => b.gap - a.gap);
}

/**
 * summarize(gapRows) -> { biggestGap, highestImpactBlocker, sufficientlyDemonstrated }
 * - biggestGap: the single row with the highest gap score.
 * - highestImpactBlocker: the highest-gap row among HIGH-importance requirements
 *   specifically (the thing most likely to block placement), falling back to
 *   biggestGap if none are HIGH importance.
 * - sufficientlyDemonstrated: rows with evidenceScore >= 70 and gap <= 15.
 */
export function summarizeGaps(gapRows) {
  if (gapRows.length === 0) {
    return { biggestGap: null, highestImpactBlocker: null, sufficientlyDemonstrated: [] };
  }
  const biggestGap = gapRows[0];
  const highRows = gapRows.filter((r) => r.requirementImportance === "HIGH");
  const highestImpactBlocker = highRows.length > 0 ? highRows[0] : biggestGap;
  const sufficientlyDemonstrated = gapRows.filter((r) => r.evidenceScore >= 70 && r.gap <= 15);
  return { biggestGap, highestImpactBlocker, sufficientlyDemonstrated };
}
