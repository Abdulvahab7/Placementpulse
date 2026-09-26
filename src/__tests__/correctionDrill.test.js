import { generateFallbackQuestions, scoreQuestions } from "../lib/correctionDrill.js";
import { calculateReadiness, updateEvidence } from "../lib/readinessCalculator.js";

describe("final intervention logic", () => {
  it("generates targeted questions with unique IDs", () => {
    const qs = generateFallbackQuestions("algorithm_selection");
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.questionId)).size).toBe(3);
    expect(qs.every((q) => q.options.length >= 2)).toBe(true);
  });

  it("scores answers deterministically", () => {
    const qs = generateFallbackQuestions("edge_cases");
    expect(scoreQuestions(qs, { [qs[0].questionId]: qs[0].correctOption, [qs[1].questionId]: 99, [qs[2].questionId]: qs[2].correctOption })).toBe(67);
  });

  it("updates evidence using the documented weighted blend", () => {
    expect(updateEvidence(50, 100)).toBe(65);
    expect(updateEvidence(80, 50)).toBe(71);
  });

  it("calculates weighted role readiness and identifies low-evidence gaps", () => {
    const requirements = [
      { skillId: "dsa", importanceLevel: "HIGH" },
      { skillId: "sql", importanceLevel: "MEDIUM" },
    ];
    const skills = new Map([
      ["dsa", { evidenceScore: 50 }],
      ["sql", { evidenceScore: 80 }],
    ]);
    const result = calculateReadiness(requirements, skills);
    expect(result.overall).toBe(61);
    expect(result.skillGaps).toEqual(["dsa"]);
  });
});
