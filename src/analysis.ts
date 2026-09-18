import type { Plan, Results } from "./contracts.js";

export function analyze(plan: Plan, results: Results) {
  const summaries = plan.conditions.map((condition) => {
    const all = results.observations.filter(
      (o) => o.conditionId === condition.id,
    );
    const values = all.filter((o) => o.qc === "pass").map((o) => o.value);
    const n = values.length;
    const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
    const sd =
      n > 1
        ? Math.sqrt(values.reduce((a, v) => a + (v - mean!) ** 2, 0) / (n - 1))
        : null;
    return {
      conditionId: condition.id,
      label: condition.label,
      role: condition.role,
      level: condition.level,
      n,
      excluded: all.length - n,
      mean,
      sd,
      standardError: sd === null ? null : sd / Math.sqrt(n),
    };
  });
  const problems: string[] = [];
  for (const s of summaries)
    if (s.n < 3)
      problems.push(`${s.conditionId}: fewer than 3 QC-passing replicates`);
  const negative = summaries.find((s) => s.role === "negative_control")!;
  const positive = summaries.find((s) => s.role === "positive_control")!;
  if (
    negative.mean === null ||
    positive.mean === null ||
    positive.mean <= negative.mean ||
    positive.mean - negative.mean <=
      3 * ((negative.sd ?? 0) + (positive.sd ?? 0))
  ) {
    problems.push(
      "Controls fail the local positive-vs-negative separation rule",
    );
  }
  const ranking = problems.length
    ? []
    : summaries
        .filter((s) => s.role === "test")
        .sort((a, b) =>
          plan.endpoint.direction === "maximize"
            ? b.mean! - a.mean!
            : a.mean! - b.mean!,
        );
  return {
    runId: results.runId,
    planHash: results.planHash,
    source: results.source,
    qc: problems.length ? ("fail" as const) : ("pass" as const),
    problems,
    summaries,
    ranking: ranking.map((s) => ({
      conditionId: s.conditionId,
      mean: s.mean,
      deltaFromNegative: s.mean! - negative.mean!,
    })),
    conclusion: problems.length
      ? "Inconclusive: resolve QC before ranking conditions."
      : `Descriptive leader: ${ranking[0]!.conditionId}. Requires independent confirmation; not a significance or causal claim.`,
    limitations: [
      results.source === "simulation"
        ? "Synthetic data only; no evidence about real cells."
        : "Externally imported and operator-attested results; provider authenticity is not verified.",
      "Local QC heuristic is not an assay-qualified acceptance criterion.",
      `${plan.replicateType} replicates; independence is not inferred from well count.`,
      "No p-values, clinical conclusions, biological response prediction, or automated physical changes.",
    ],
  };
}
