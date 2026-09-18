import type { Harness } from "./harness.js";

export function campaignReport(harness: Harness, campaignId: string): string {
  const campaign = harness.inspect(campaignId);
  const audit = harness.store.verify(campaignId);
  const lines = [
    `# ${campaign.title}`,
    "",
    campaign.objective,
    "",
    `Campaign: \`${campaign.id}\``,
    `Simulation ledger: $${(campaign.simulationSpentCents / 100).toFixed(2)} / $${(campaign.simulationBudgetCents / 100).toFixed(2)} (fictional; no actual charges)`,
    "",
    "**No live laboratory orders have been submitted by this harness.**",
    "",
  ];
  for (const run of campaign.runs) {
    const draft = campaign.drafts.find((d) => d.id === run.draftId)!;
    lines.push(
      `## ${draft.plan.title}`,
      "",
      `Run: \`${run.id}\` · ${run.backend} · ${run.status}`,
      `Plan hash: \`${run.planHash}\``,
      `Approved by: ${draft.approval?.by ?? "none"}`,
      "",
      `Question: ${draft.plan.question}`,
      `Analysis plan: ${draft.plan.analysisPlan}`,
      "",
    );
    if (run.status !== "completed") {
      lines.push("No completed observations available.", "");
      continue;
    }
    const result = harness.analyze(campaignId, run.id);
    lines.push(
      `**Source: ${result.source.toUpperCase()}**`,
      "",
      `QC: ${result.qc}`,
      result.conclusion,
      "",
      "| Condition | Passing n | Excluded | Mean | SD |",
      "|---|---:|---:|---:|---:|",
    );
    for (const s of result.summaries)
      lines.push(
        `| ${s.conditionId} | ${s.n} | ${s.excluded} | ${s.mean?.toFixed(3) ?? "n/a"} | ${s.sd?.toFixed(3) ?? "n/a"} |`,
      );
    lines.push(
      "",
      ...result.problems.map((p) => `- QC issue: ${p}`),
      ...result.limitations.map((l) => `- ${l}`),
      "",
    );
  }
  lines.push(
    "## Audit",
    "",
    `${audit.events} hash-linked events verified. Head: \`${audit.head}\``,
    "",
    "Local integrity checks are not signatures, provider attestation, or regulatory compliance.",
    "",
  );
  return lines.join("\n");
}
