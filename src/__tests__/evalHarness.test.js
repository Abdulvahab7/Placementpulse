import { failureFixtures } from "../testUtils/fixtures/failureFixtures.js";
import { extractSignals } from "../lib/failureSignals.js";

// Mirrors scripts/evalHarness.js's classifyFromSignals — kept inline here so
// this test doesn't depend on the script's console.log side effect.
function classifyFromSignals(signals) {
  if (signals.algorithmSelectionRisk.risk) return "algorithm_selection";
  if (signals.edgeCaseRisk.risk) return "edge_cases";
  if (signals.complexityAnalysisRisk.risk) return "complexity_analysis";
  if (signals.prematureSolving.risk) return "premature_solving";
  if (signals.timeManagementRisk.risk) return "time_management";
  return "implementation";
}

describe("AI Evaluation Harness — deterministic signal layer against 30 fixtures", () => {
  it("has 10 fixtures each for algorithm-selection, edge-case, and complexity-analysis", () => {
    const counts = failureFixtures.reduce((acc, f) => {
      acc[f.expectedPattern] = (acc[f.expectedPattern] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.algorithm_selection).toBe(10);
    expect(counts.edge_cases).toBe(10);
    expect(counts.complexity_analysis).toBe(10);
    expect(failureFixtures).toHaveLength(30);
  });

  it("reports actual classification matches/mismatches (not fabricated performance)", () => {
    const results = failureFixtures.map((fixture) => {
      const signals = extractSignals(fixture.attempt);
      const predicted = classifyFromSignals(signals);
      return { id: fixture.id, expected: fixture.expectedPattern, predicted };
    });

    const mismatches = results.filter((r) => r.predicted !== r.expected);
    // This asserts the CURRENT actual behavior of the signal layer against the
    // fixtures — if a future change to failureSignals.js regresses this, the
    // test fails loudly rather than silently reporting fabricated numbers.
    expect(mismatches).toEqual([]);
  });
});
