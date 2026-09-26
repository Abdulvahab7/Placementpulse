// AI Evaluation Harness (Phase 2 §12/§13).
//
// IMPORTANT / KNOWN LIMITATION (documented honestly, per PHASE_2_REPORT.md):
// This sandbox has no network access and no GEMINI_API_KEY configured, so this
// harness cannot make live Gemini calls. It instead evaluates the deterministic
// SIGNAL layer (failureSignals.js) that feeds Gemini — i.e. "given these 30
// fixtures, does the deterministic evidence point at the expected failure
// category before Gemini ever sees it?" This is a real, useful, and fully
// reproducible test of the evidence pipeline, but it is NOT a live-model
// accuracy measurement. Re-run against real Gemini output once GEMINI_API_KEY
// is configured (the classify() function below is where that would plug in).
//
// Run with: node src/scripts/evalHarness.js

import { failureFixtures } from "../testUtils/fixtures/failureFixtures.js";
import { extractSignals } from "../lib/failureSignals.js";

/**
 * Deterministic-signal-only classifier, used purely as an evaluation proxy in
 * place of a live Gemini call. Priority order mirrors how a human would read
 * the evidence: an algorithm-selection problem is diagnosed first because it
 * subsumes the others, then edge cases, then complexity-analysis mismatch.
 */
function classifyFromSignals(signals) {
  if (signals.algorithmSelectionRisk.risk) return "algorithm_selection";
  if (signals.edgeCaseRisk.risk) return "edge_cases";
  if (signals.complexityAnalysisRisk.risk) return "complexity_analysis";
  if (signals.prematureSolving.risk) return "premature_solving";
  if (signals.timeManagementRisk.risk) return "time_management";
  return "implementation";
}

function run() {
  const results = failureFixtures.map((fixture) => {
    const signals = extractSignals(fixture.attempt);
    const predicted = classifyFromSignals(signals);
    return { id: fixture.id, expected: fixture.expectedPattern, predicted, match: predicted === fixture.expectedPattern };
  });

  const matches = results.filter((r) => r.match);
  const mismatches = results.filter((r) => !r.match);
  const consistencyPercentage = Math.round((matches.length / results.length) * 1000) / 10;

  const report = {
    datasetSize: results.length,
    matches: matches.length,
    mismatches: mismatches.length,
    consistencyPercentage,
    mismatchDetail: mismatches,
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

run();
