// Deterministic signal extraction, run BEFORE Gemini ever sees an attempt.
// Every signal here is explainable from observable fields on the attempt —
// no LLM judgment involved. These signals become the "structured evidence"
// bundle that is the only thing sent to Gemini for classification.

const COMPLEXITY_RANK = {
  "o(1)": 0,
  "o(log n)": 1,
  "o(n)": 2,
  "o(n log n)": 3,
  "o(n^2)": 4,
  "o(n^3)": 5,
  "o(2^n)": 6,
  "o(n!)": 7,
};

function rankComplexity(label) {
  if (!label) return null;
  const key = String(label).trim().toLowerCase().replace(/\s+/g, " ");
  return key in COMPLEXITY_RANK ? COMPLEXITY_RANK[key] : null;
}

/**
 * prematureSolving: no recorded planning step, or coding began (near-)
 * immediately after the approach was (or should have been) written down.
 */
export function prematureSolving(attempt) {
  const hasApproach = typeof attempt.chosenApproach === "string" && attempt.chosenApproach.trim().length >= 10;
  if (!hasApproach) {
    return {
      risk: true,
      explanation: "No recorded planning/approach step before submission.",
    };
  }
  if (attempt.approachStartedAt && attempt.codingStartedAt) {
    const planningSeconds =
      (new Date(attempt.codingStartedAt).getTime() - new Date(attempt.approachStartedAt).getTime()) / 1000;
    if (planningSeconds < 10) {
      return {
        risk: true,
        explanation: `Coding began ${Math.max(0, Math.round(planningSeconds))}s after the approach step started — planning was effectively skipped.`,
        value: planningSeconds,
      };
    }
    return { risk: false, explanation: "Planning step preceded coding by a reasonable margin.", value: planningSeconds };
  }
  return { risk: false, explanation: "An approach was recorded." };
}

/**
 * algorithmSelectionRisk: the chosen approach's actual complexity is a
 * strictly worse complexity class than what the constraints required.
 */
export function algorithmSelectionRisk(attempt) {
  const actual = rankComplexity(attempt.actualComplexity);
  const expected = rankComplexity(attempt.expectedComplexity);
  if (actual == null || expected == null) {
    return { risk: false, explanation: "Insufficient complexity data to assess algorithm selection." };
  }
  if (actual > expected) {
    return {
      risk: true,
      explanation: `Chosen approach runs at ${attempt.actualComplexity}, worse than the ${attempt.expectedComplexity} the constraints required.`,
      value: { actual: attempt.actualComplexity, expected: attempt.expectedComplexity },
    };
  }
  return { risk: false, explanation: "Chosen approach's complexity matches or beats what was required." };
}

/**
 * edgeCaseRisk: failures concentrate on edge/boundary test cases rather than
 * typical-case ones.
 */
export function edgeCaseRisk(attempt) {
  const failed = Array.isArray(attempt.failedTestCases) ? attempt.failedTestCases : [];
  if (failed.length === 0) {
    return { risk: false, explanation: "No failed test cases recorded." };
  }
  const edgeLike = failed.filter((t) => t.tag === "edge" || t.tag === "boundary").length;
  const fraction = edgeLike / failed.length;
  if (fraction >= 0.5) {
    return {
      risk: true,
      explanation: `${edgeLike} of ${failed.length} failed test cases were edge/boundary cases.`,
      value: fraction,
    };
  }
  return { risk: false, explanation: `Only ${edgeLike} of ${failed.length} failed test cases were edge/boundary cases.`, value: fraction };
}

/**
 * complexityAnalysisRisk: the student's own claimed complexity differs from
 * the measured/submitted (actual) complexity.
 */
export function complexityAnalysisRisk(attempt) {
  const claimed = rankComplexity(attempt.claimedComplexity);
  const actual = rankComplexity(attempt.actualComplexity);
  if (claimed == null || actual == null) {
    return { risk: false, explanation: "No claimed complexity to compare against measured complexity." };
  }
  if (claimed !== actual) {
    return {
      risk: true,
      explanation: `Student claimed ${attempt.claimedComplexity}, but measured/submitted complexity was ${attempt.actualComplexity}.`,
      value: { claimed: attempt.claimedComplexity, actual: attempt.actualComplexity },
    };
  }
  return { risk: false, explanation: "Claimed complexity matches measured complexity." };
}

/**
 * timeManagementRisk: time taken substantially exceeded the expected time
 * limit for this question.
 */
export function timeManagementRisk(attempt) {
  if (typeof attempt.expectedTimeLimit !== "number" || attempt.expectedTimeLimit <= 0) {
    return { risk: false, explanation: "No expected time limit recorded for this question." };
  }
  const ratio = attempt.timeTaken / attempt.expectedTimeLimit;
  if (ratio >= 1.5) {
    return {
      risk: true,
      explanation: `Took ${attempt.timeTaken}s against an expected ${attempt.expectedTimeLimit}s (${ratio.toFixed(2)}x).`,
      value: ratio,
    };
  }
  return { risk: false, explanation: `Time taken (${attempt.timeTaken}s) was within a reasonable margin of the expected ${attempt.expectedTimeLimit}s.`, value: ratio };
}

/**
 * extractSignals(attempt) -> the full structured evidence bundle used both
 * for display (deterministicSignals) and as the ONLY input sent to Gemini
 * for failure classification.
 */
export function extractSignals(attempt) {
  return {
    prematureSolving: prematureSolving(attempt),
    algorithmSelectionRisk: algorithmSelectionRisk(attempt),
    edgeCaseRisk: edgeCaseRisk(attempt),
    complexityAnalysisRisk: complexityAnalysisRisk(attempt),
    timeManagementRisk: timeManagementRisk(attempt),
    hintsUsed: attempt.hintsUsed ?? 0,
    attemptsCount: attempt.attemptsCount ?? 1,
    correct: attempt.correct,
    type: attempt.type,
  };
}
