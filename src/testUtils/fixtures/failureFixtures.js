// Deterministic test fixtures for the Failure Autopsy AI evaluation harness.
// 10 algorithm-selection, 10 edge-case, and 10 complexity-analysis examples,
// each constructed so the deterministic signal extractor (failureSignals.js)
// should flag exactly the risk matching `expectedPattern`.

function algorithmSelectionFixture(i) {
  const pairs = [
    ["O(n^2)", "O(n log n)"],
    ["O(n^3)", "O(n^2)"],
    ["O(2^n)", "O(n)"],
    ["O(n^2)", "O(n)"],
    ["O(n log n)", "O(log n)"],
  ];
  const [actual, expected] = pairs[i % pairs.length];
  return {
    id: `algo-${i + 1}`,
    expectedPattern: "algorithm_selection",
    attempt: {
      type: "coding",
      correct: false,
      timeTaken: 30,
      chosenApproach: "iterate over all pairs and compare",
      actualComplexity: actual,
      expectedComplexity: expected,
      failedTestCases: [{ tag: "typical" }],
    },
  };
}

function edgeCaseFixture(i) {
  const failedSets = [
    [{ tag: "edge" }, { tag: "edge" }, { tag: "typical" }],
    [{ tag: "boundary" }, { tag: "boundary" }],
    [{ tag: "edge" }, { tag: "boundary" }, { tag: "typical" }, { tag: "typical" }],
    [{ tag: "edge" }],
    [{ tag: "boundary" }, { tag: "edge" }, { tag: "typical" }],
  ];
  return {
    id: `edge-${i + 1}`,
    expectedPattern: "edge_cases",
    attempt: {
      type: "coding",
      correct: false,
      timeTaken: 20,
      chosenApproach: "standard two-pointer scan",
      actualComplexity: "O(n)",
      expectedComplexity: "O(n)",
      failedTestCases: failedSets[i % failedSets.length],
    },
  };
}

function complexityAnalysisFixture(i) {
  const pairs = [
    ["O(n)", "O(n^2)"],
    ["O(log n)", "O(n)"],
    ["O(n log n)", "O(n^2)"],
    ["O(1)", "O(n)"],
    ["O(n)", "O(n^3)"],
  ];
  const [claimed, actual] = pairs[i % pairs.length];
  return {
    id: `cplx-${i + 1}`,
    expectedPattern: "complexity_analysis",
    attempt: {
      type: "coding",
      correct: false,
      timeTaken: 25,
      chosenApproach: "sort then binary search per query",
      claimedComplexity: claimed,
      actualComplexity: actual,
      expectedComplexity: actual,
      failedTestCases: [{ tag: "typical" }],
    },
  };
}

export const failureFixtures = [
  ...Array.from({ length: 10 }, (_, i) => algorithmSelectionFixture(i)),
  ...Array.from({ length: 10 }, (_, i) => edgeCaseFixture(i)),
  ...Array.from({ length: 10 }, (_, i) => complexityAnalysisFixture(i)),
];
