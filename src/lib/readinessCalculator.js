const IMPORTANCE = { HIGH: 1, MEDIUM: 0.6, LOW: 0.3 };

function importanceWeight(requirement) {
  if (requirement.importanceLevel && IMPORTANCE[requirement.importanceLevel] != null) {
    return IMPORTANCE[requirement.importanceLevel];
  }
  return typeof requirement.importance === "number" ? requirement.importance : 0.5;
}

export function calculateReadiness(requirements, studentSkillsBySkillId) {
  if (!requirements.length) return { overall: 0, skillGaps: [] };
  let weightedTotal = 0;
  let totalWeight = 0;
  const skillGaps = [];

  for (const req of requirements) {
    const weight = importanceWeight(req);
    const evidence = Number(studentSkillsBySkillId.get(req.skillId)?.evidenceScore ?? 0);
    weightedTotal += evidence * weight;
    totalWeight += weight;
    if (evidence < 70) skillGaps.push(req.skillId);
  }

  return {
    overall: totalWeight ? Math.round(weightedTotal / totalWeight) : 0,
    skillGaps,
  };
}

export function updateEvidence(previous, assessmentScore) {
  const oldScore = Number(previous ?? 0);
  const score = Number(assessmentScore ?? 0);
  return Math.round(oldScore * 0.7 + score * 0.3);
}
