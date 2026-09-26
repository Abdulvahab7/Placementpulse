// Deterministic aggregation over stored failurePatterns classification records.
// No hardcoded dashboard bars: every percentage/count here is derived from the
// actual documents passed in.

const CONTEXT_TYPES = ["coding", "aptitude", "interview"];

/**
 * aggregateFailurePatterns(classificationDocs)
 * classificationDocs: failurePatterns docs that carry `failurePatternValue`
 * (i.e. Phase 2 Gemini-classification records; older/manual failurePatterns
 * docs without that field are ignored for this view).
 *
 * Returns: { totalAnalyzed, categories: [{ pattern, count, percentage, contexts }] }
 * sorted by descending count, so the first entry is the primary recurring issue.
 */
export function aggregateFailurePatterns(classificationDocs) {
  const records = classificationDocs.filter((d) => d.failurePatternValue);
  const totalAnalyzed = records.length;

  const byPattern = new Map();
  for (const rec of records) {
    const key = rec.failurePatternValue;
    if (!byPattern.has(key)) {
      byPattern.set(key, { pattern: key, count: 0, contexts: { coding: 0, aptitude: 0, interview: 0 } });
    }
    const entry = byPattern.get(key);
    entry.count += 1;
    const ctx = CONTEXT_TYPES.includes(rec.contextType) ? rec.contextType : null;
    if (ctx) entry.contexts[ctx] += 1;
  }

  const categories = [...byPattern.values()]
    .map((entry) => ({
      ...entry,
      percentage: totalAnalyzed > 0 ? Math.round((entry.count / totalAnalyzed) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalAnalyzed, categories };
}

/**
 * computeFingerprint(classificationDocs)
 * Student-level aggregated profile: per pattern, total observable instances
 * broken down by context. Purely descriptive — no causal or psychological claims.
 */
export function computeFingerprint(classificationDocs) {
  const { categories } = aggregateFailurePatterns(classificationDocs);
  return categories.map(({ pattern, count, contexts }) => ({
    pattern,
    instances: count,
    contexts,
  }));
}

/**
 * primaryRecurringIssue(aggregation) -> the top category, or null.
 */
export function primaryRecurringIssue(aggregation) {
  return aggregation.categories.length > 0 ? aggregation.categories[0] : null;
}
