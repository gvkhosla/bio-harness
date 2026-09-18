import { hash, rng, type Plan, type Results } from "./contracts.js";
import type { Campaign, Draft, Run } from "./store.js";

export function simulate(plan: Plan, run: Run): Results {
  const random = rng(parseInt(run.planHash.slice(0, 8), 16));
  return {
    schemaVersion: 1,
    runId: run.id,
    planHash: run.planHash,
    source: "simulation",
    providerRunId: `sim-${run.id}`,
    measuredAt: run.createdAt,
    unit: plan.endpoint.unit,
    observations: run.wells.map((well) => {
      const condition = plan.conditions.find((c) => c.id === well.conditionId)!;
      const center =
        condition.role === "negative_control"
          ? 10
          : condition.role === "positive_control"
            ? 90
            : 10 + 80 * Math.exp(-((condition.level - 0.62) ** 2) / 0.06);
      return {
        well: well.well,
        conditionId: condition.id,
        value: Math.round((center + (random() - 0.5) * 8) * 1000) / 1000,
        qc: "pass" as const,
      };
    }),
    notes:
      "SYNTHETIC DATA. Toy response function, not a biological prediction. No physical experiment took place.",
  };
}

export function handoff(campaign: Campaign, draft: Draft, run: Run) {
  return {
    format: "bio-harness.partner-request.v1",
    notice:
      "LOCAL FEASIBILITY REQUEST. Not a Ginkgo API format, quote, certified protocol, submitted order, or execution authorization. No request has been sent.",
    campaign: {
      id: campaign.id,
      title: campaign.title,
      objective: campaign.objective,
    },
    runId: run.id,
    planHash: draft.hash,
    approval: draft.approval,
    intendedProvider: "Ginkgo Bioworks",
    request: draft.plan,
    proposedWellMap: run.wells,
    unresolved: [
      "Provider confirmation of assay, cell model, and sample acceptance",
      "Provider-qualified SOP and physical parameters; normalized levels are NOT instrument instructions",
      "Institutional biosafety review and sample logistics",
      "Binding quote, turnaround, commercial terms, and separate purchase authorization",
      "Mapping provider observations to the local result contract and sample identities",
    ],
    resultContract: {
      schemaVersion: 1,
      runId: run.id,
      planHash: draft.hash,
      source: "external",
      providerRunId: "<actual provider identifier>",
      measuredAt: "<ISO 8601 timestamp>",
      unit: draft.plan.endpoint.unit,
      observations: run.wells.map((w) => ({
        well: w.well,
        conditionId: w.conditionId,
        value: "<finite number>",
        qc: "<pass|fail>",
      })),
      notes: "<provenance, QC, deviations, and source artifact references>",
    },
    integrity: { requestHash: hash({ plan: draft.plan, wells: run.wells }) },
  };
}
