import {
  prematureSolving,
  algorithmSelectionRisk,
  edgeCaseRisk,
  complexityAnalysisRisk,
  timeManagementRisk,
  extractSignals,
} from "../lib/failureSignals.js";

describe("Deterministic Failure Signal Extraction", () => {
  describe("prematureSolving", () => {
    it("flags risk when no approach was recorded", () => {
      expect(prematureSolving({}).risk).toBe(true);
    });

    it("flags risk when coding started immediately after the approach step", () => {
      const attempt = {
        chosenApproach: "brute force nested loop over all pairs",
        approachStartedAt: "2026-01-01T00:00:00.000Z",
        codingStartedAt: "2026-01-01T00:00:03.000Z",
      };
      expect(prematureSolving(attempt).risk).toBe(true);
    });

    it("does not flag risk when planning preceded coding by a reasonable margin", () => {
      const attempt = {
        chosenApproach: "two-pointer approach after sorting the array",
        approachStartedAt: "2026-01-01T00:00:00.000Z",
        codingStartedAt: "2026-01-01T00:02:00.000Z",
      };
      expect(prematureSolving(attempt).risk).toBe(false);
    });
  });

  describe("algorithmSelectionRisk", () => {
    it("flags risk when actual complexity is worse than expected", () => {
      const result = algorithmSelectionRisk({ actualComplexity: "O(n^2)", expectedComplexity: "O(n log n)" });
      expect(result.risk).toBe(true);
    });

    it("does not flag risk when actual complexity matches or beats expected", () => {
      expect(algorithmSelectionRisk({ actualComplexity: "O(n)", expectedComplexity: "O(n)" }).risk).toBe(false);
      expect(algorithmSelectionRisk({ actualComplexity: "O(log n)", expectedComplexity: "O(n)" }).risk).toBe(false);
    });

    it("does not flag risk when complexity data is missing", () => {
      expect(algorithmSelectionRisk({}).risk).toBe(false);
    });
  });

  describe("edgeCaseRisk", () => {
    it("flags risk when the majority of failures are edge/boundary cases", () => {
      const attempt = {
        failedTestCases: [{ tag: "edge" }, { tag: "boundary" }, { tag: "typical" }],
      };
      expect(edgeCaseRisk(attempt).risk).toBe(true);
    });

    it("does not flag risk when failures are mostly typical-case", () => {
      const attempt = {
        failedTestCases: [{ tag: "typical" }, { tag: "typical" }, { tag: "edge" }],
      };
      expect(edgeCaseRisk(attempt).risk).toBe(false);
    });

    it("does not flag risk with no failed test cases", () => {
      expect(edgeCaseRisk({}).risk).toBe(false);
    });
  });

  describe("complexityAnalysisRisk", () => {
    it("flags risk when claimed complexity differs from measured complexity", () => {
      const result = complexityAnalysisRisk({ claimedComplexity: "O(n)", actualComplexity: "O(n^2)" });
      expect(result.risk).toBe(true);
    });

    it("does not flag risk when claimed matches measured", () => {
      expect(complexityAnalysisRisk({ claimedComplexity: "O(n)", actualComplexity: "O(n)" }).risk).toBe(false);
    });
  });

  describe("timeManagementRisk", () => {
    it("flags risk when time taken is well beyond the expected limit", () => {
      expect(timeManagementRisk({ timeTaken: 90, expectedTimeLimit: 30 }).risk).toBe(true);
    });

    it("does not flag risk within a reasonable margin", () => {
      expect(timeManagementRisk({ timeTaken: 35, expectedTimeLimit: 30 }).risk).toBe(false);
    });

    it("does not flag risk when no expected time limit is recorded", () => {
      expect(timeManagementRisk({ timeTaken: 500 }).risk).toBe(false);
    });
  });

  it("extractSignals bundles all five signals plus basic attempt facts", () => {
    const signals = extractSignals({
      type: "coding",
      correct: false,
      hintsUsed: 2,
      attemptsCount: 3,
      chosenApproach: "brute force",
    });
    expect(Object.keys(signals)).toEqual(
      expect.arrayContaining([
        "prematureSolving",
        "algorithmSelectionRisk",
        "edgeCaseRisk",
        "complexityAnalysisRisk",
        "timeManagementRisk",
        "hintsUsed",
        "attemptsCount",
        "correct",
        "type",
      ])
    );
  });
});
