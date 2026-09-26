import { aggregateFailurePatterns, computeFingerprint, primaryRecurringIssue } from "../lib/failureAggregation.js";

const RECORDS = [
  { attemptId: "a1", failurePatternValue: "algorithm_selection", contextType: "coding" },
  { attemptId: "a2", failurePatternValue: "algorithm_selection", contextType: "coding" },
  { attemptId: "a3", failurePatternValue: "edge_cases", contextType: "coding" },
  { attemptId: "a4", failurePatternValue: "technical_explanation", contextType: "interview" },
  { attemptId: "a5", failurePatternValue: "algorithm_selection", contextType: "aptitude" },
];

describe("Failure Pattern Aggregation — derived from actual stored evidence, never hardcoded", () => {
  it("computes percentages and instance counts purely from the docs given", () => {
    const { totalAnalyzed, categories } = aggregateFailurePatterns(RECORDS);
    expect(totalAnalyzed).toBe(5);

    const algo = categories.find((c) => c.pattern === "algorithm_selection");
    expect(algo.count).toBe(3);
    expect(algo.percentage).toBeCloseTo(60, 5); // 3/5
    expect(algo.contexts).toEqual({ coding: 2, aptitude: 1, interview: 0 });
  });

  it("sorts categories with the most frequent pattern first", () => {
    const { categories } = aggregateFailurePatterns(RECORDS);
    expect(categories[0].pattern).toBe("algorithm_selection");
  });

  it("ignores non-Phase-2 (manual) failurePatterns docs that lack failurePatternValue", () => {
    const mixed = [...RECORDS, { pattern: "some manual note", frequency: 1, severity: "low" }];
    const { totalAnalyzed } = aggregateFailurePatterns(mixed);
    expect(totalAnalyzed).toBe(5);
  });

  it("returns an empty aggregation for no records, without dividing by zero", () => {
    const { totalAnalyzed, categories } = aggregateFailurePatterns([]);
    expect(totalAnalyzed).toBe(0);
    expect(categories).toEqual([]);
  });

  it("primaryRecurringIssue is the top category, or null when empty", () => {
    expect(primaryRecurringIssue(aggregateFailurePatterns(RECORDS)).pattern).toBe("algorithm_selection");
    expect(primaryRecurringIssue(aggregateFailurePatterns([]))).toBeNull();
  });

  it("computeFingerprint describes observable instance counts per pattern/context, no causal claims", () => {
    const fingerprint = computeFingerprint(RECORDS);
    const algo = fingerprint.find((f) => f.pattern === "algorithm_selection");
    expect(algo.instances).toBe(3);
    expect(algo.contexts).toEqual({ coding: 2, aptitude: 1, interview: 0 });
    // Structural guarantee: fingerprint entries only ever carry pattern/instances/contexts.
    for (const entry of fingerprint) {
      expect(Object.keys(entry).sort()).toEqual(["contexts", "instances", "pattern"]);
    }
  });
});
