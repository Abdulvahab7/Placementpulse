import { computeGapScore, gapPriority, computeGaps, summarizeGaps, importanceWeight } from "../lib/gapEngine.js";

describe("Gap Engine — deterministic calculation (not an LLM opinion)", () => {
  it("matches the Phase 2 spec worked example: DSA HIGH/52 -> high priority, Java HIGH/81 -> low priority", () => {
    const dsaReq = { skillId: "dsa", importanceLevel: "HIGH", sourceType: "historical" };
    const javaReq = { skillId: "java", importanceLevel: "HIGH", sourceType: "historical" };

    const dsaGap = computeGapScore(dsaReq, 52);
    const javaGap = computeGapScore(javaReq, 81);

    expect(gapPriority(dsaGap)).toBe("HIGH");
    expect(gapPriority(javaGap)).toBe("LOW");
  });

  it("falls back to numeric importance when importanceLevel is absent", () => {
    expect(importanceWeight({ importance: 0.9 })).toBe(0.9);
    expect(importanceWeight({})).toBe(0.5);
  });

  it("gapScore is 0 when evidence is full (100) regardless of importance", () => {
    expect(computeGapScore({ importanceLevel: "HIGH" }, 100)).toBe(0);
  });

  it("gapScore is 0 when importance is LOW and evidence is 0 relative to weight (not literally 0)", () => {
    const score = computeGapScore({ importanceLevel: "LOW" }, 0);
    expect(score).toBeCloseTo(30, 5); // 0.3 * (100 - 0)
  });

  it("computeGaps sorts by descending gap and summarizeGaps identifies the biggest gap / blocker / sufficient skills", () => {
    const requirements = [
      { skillId: "dsa", importanceLevel: "HIGH" },
      { skillId: "java", importanceLevel: "HIGH" },
      { skillId: "sql", importanceLevel: "LOW" },
    ];
    const studentSkills = new Map([
      ["dsa", { evidenceScore: 52 }],
      ["java", { evidenceScore: 81 }],
      ["sql", { evidenceScore: 90 }],
    ]);

    const gaps = computeGaps(requirements, studentSkills);
    expect(gaps[0].skillId).toBe("dsa");
    expect(gaps.map((g) => g.skillId)).toEqual(["dsa", "java", "sql"]);

    const summary = summarizeGaps(gaps);
    expect(summary.biggestGap.skillId).toBe("dsa");
    expect(summary.highestImpactBlocker.skillId).toBe("dsa");
    expect(summary.sufficientlyDemonstrated.map((s) => s.skillId)).toContain("sql");
  });

  it("treats a skill with no student evidence as evidenceScore 0", () => {
    const requirements = [{ skillId: "unseen", importanceLevel: "HIGH" }];
    const gaps = computeGaps(requirements, new Map());
    expect(gaps[0].evidenceScore).toBe(0);
    expect(gaps[0].priority).toBe("HIGH");
  });

  it("summarizeGaps handles an empty requirement list", () => {
    const summary = summarizeGaps([]);
    expect(summary.biggestGap).toBeNull();
    expect(summary.highestImpactBlocker).toBeNull();
    expect(summary.sufficientlyDemonstrated).toEqual([]);
  });
});
