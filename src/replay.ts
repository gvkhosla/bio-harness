import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { hash } from "./contracts.js";
import { cfpsPolicy, screenMeasurement } from "./cfps-policy.js";
import { analysisIdentity } from "./analysis-identity.js";

const finite = z.number().finite();
const readings = z.record(finite.nullable());
const sampleSchema = z.object({
  sample_id: z.string(),
  sample_type: z.enum([
    "experimental",
    "standard",
    "positive_control_mixed",
    "empty",
  ]),
  reagent_list: z.record(z.unknown()).nullable(),
});
// A read-only result projection, NOT Ginkgo's experiment validator or an ordering contract.
const plateSchema = z.object({
  plate_id: z.string().min(1),
  run_id: z.string().nullable(),
  n_rows: z.literal(16),
  n_columns: z.literal(24),
  array_order: z.literal("column"),
  reserved_columns: z.array(z.number()).length(0),
  replicate_factor: z.literal(4),
  protein_target: z.string(),
  samples: z.array(sampleSchema).length(384),
  fluorescence_results: z.object({ fluorescence: readings }),
  concentration_results: z.object({ concentration_g_L: readings }),
  reagent_flags: z.object({ flags: z.record(z.array(z.string())) }),
  standards_metrics: z.object({ r2: finite, mape: finite }),
});
const manifestSchema = z.object({
  repository: z.literal(
    "https://github.com/ginkgobioworks/ginkgo-automation-cfps",
  ),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  path: z.literal("examples/example_plate_return.json"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  license: z.literal("MIT"),
  attribution: z.string(),
  evidenceKind: z.literal("published-example"),
  notice: z.string(),
});
export type Scenario = "original" | "control-failure";
export type Strategy = "confirm" | "explore";
export type ReplayWell = {
  well: string;
  row: number;
  column: number;
  sampleId: string;
  role: z.infer<typeof sampleSchema>["sample_type"];
  formulationHash: string | null;
  concentration: number | null;
  fluorescence: number | null;
  sourceFlags: string[];
  demoFlags: string[];
  eligible: boolean;
  screen: ReturnType<typeof screenMeasurement>;
};
export function summarize(values: number[]) {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const sd =
    n > 1
      ? Math.sqrt(values.reduce((a, b) => a + (b - mean!) ** 2, 0) / (n - 1))
      : null;
  return { n, mean, sd };
}

export function parseReplay(
  bytes: Buffer,
  manifestInput: unknown,
  scenario: Scenario = "original",
) {
  if (!["original", "control-failure"].includes(scenario))
    throw new Error("Unknown replay scenario");
  const policy = cfpsPolicy();
  const manifest = manifestSchema.parse(manifestInput);
  if (
    bytes.length !== manifest.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
  )
    throw new Error(
      "Source artifact integrity failure; restore the pinned fixture",
    );
  const plate = plateSchema.parse(JSON.parse(bytes.toString("utf8")));
  const coordinates = new Set(
    Array.from(
      { length: 384 },
      (_, i) =>
        `${String.fromCharCode(65 + (i % 16))}${String(Math.floor(i / 16) + 1).padStart(2, "0")}`,
    ),
  );
  for (const map of [
    plate.fluorescence_results.fluorescence,
    plate.concentration_results.concentration_g_L,
  ]) {
    if (
      Object.keys(map).length !== 384 ||
      Object.keys(map).some((k) => !coordinates.has(k))
    )
      throw new Error("Result coordinates must cover exactly A01 through P24");
  }
  if (Object.keys(plate.reagent_flags.flags).some((k) => !coordinates.has(k)))
    throw new Error("Unknown flagged well");
  const wells: ReplayWell[] = plate.samples.map((sample, i) => {
    const row = i % 16;
    const column = Math.floor(i / 16);
    const well = `${String.fromCharCode(65 + row)}${String(column + 1).padStart(2, "0")}`;
    const sourceFlags = plate.reagent_flags.flags[well] ?? [];
    const demoFlags =
      scenario === "control-failure" &&
      sample.sample_type === "positive_control_mixed"
        ? ["Injected control failure — demonstration only"]
        : [];
    const concentration = plate.concentration_results.concentration_g_L[well]!;
    const fluorescence = plate.fluorescence_results.fluorescence[well]!;
    const screen = screenMeasurement({
      concentration,
      fluorescence,
      sourceFlags,
      demoFlags,
    });
    return {
      well,
      row,
      column,
      sampleId: sample.sample_id,
      role: sample.sample_type,
      formulationHash: sample.reagent_list ? hash(sample.reagent_list) : null,
      concentration,
      fluorescence,
      sourceFlags,
      demoFlags,
      eligible: screen.eligible,
      screen,
    };
  });
  const groups = new Map<string, ReplayWell[]>();
  for (const well of wells.filter((w) => w.role === "experimental")) {
    if (!well.sampleId || !well.formulationHash)
      throw new Error("Experimental sample identity/formulation is missing");
    const group = groups.get(well.sampleId) ?? [];
    if (group.some((w) => w.formulationHash !== well.formulationHash))
      throw new Error(`Conflicting formulations for sample ${well.sampleId}`);
    group.push(well);
    groups.set(well.sampleId, group);
  }
  const conditions = [...groups].map(([sampleId, members]) => ({
    sampleId,
    formulationHash: members[0]!.formulationHash!,
    wells: members.map((w) => w.well),
    ...summarize(
      members.filter((w) => w.eligible).map((w) => w.concentration!),
    ),
    excluded: members.filter((w) => !w.eligible).map((w) => w.well),
    total: members.length,
  }));
  if (
    !conditions.length ||
    conditions.some((c) => c.total !== plate.replicate_factor)
  )
    throw new Error("Expected four wells per experimental sample");
  // Use the named repeated reference, not an invented negative control or pooled unlike controls.
  const reference = wells.filter(
    (w) =>
      w.role === "positive_control_mixed" && w.sampleId === "target_control",
  );
  const control = {
    ...summarize(
      reference.filter((w) => w.eligible).map((w) => w.concentration!),
    ),
    total: reference.length,
    wells: reference.map((w) => w.well),
  };
  const problems: string[] = [];
  if (control.n < policy.minimumEligibleWells)
    problems.push(
      "Fewer than three eligible target-control wells; candidate ranking and follow-up briefs are blocked.",
    );
  if (plate.standards_metrics.r2 < policy.minimumCalibrationR2)
    problems.push(
      "Source-reported calibration R² is below the demo review threshold of 0.98.",
    );
  const candidates = conditions
    .filter((c) => c.n >= policy.minimumEligibleWells)
    .sort((a, b) => b.mean! - a.mean! || a.sampleId.localeCompare(b.sampleId));
  if (!candidates.length)
    problems.push("No experimental condition has three eligible measurements.");
  const ranking = problems.length ? [] : candidates;
  return {
    format: "bio-harness.cfps-replay.v1" as const,
    scenario,
    software: analysisIdentity(),
    source: {
      ...manifest,
      url: `${manifest.repository}/blob/${manifest.commit}/${manifest.path}`,
      verified: true as const,
    },
    plateId: plate.plate_id,
    providerRunId: plate.run_id,
    proteinTarget: plate.protein_target,
    question:
      "Which conditions in this published CFPS example merit independent confirmation after a transparent data-quality screen?",
    unit: "g/L" as const,
    wells,
    conditions,
    ranking,
    control,
    calibration: {
      r2: plate.standards_metrics.r2,
      mape: plate.standards_metrics.mape,
      origin: "source-reported; not recomputed",
    },
    qc: {
      status: problems.length ? ("blocked" as const) : ("reviewable" as const),
      problems,
      sourceFlaggedWells: wells.filter((w) => w.sourceFlags.length).length,
      injectedWells: wells.filter((w) => w.demoFlags.length).length,
      excludedConditions: conditions.filter(
        (c) => c.n < policy.minimumEligibleWells,
      ).length,
      policy: policy.summary,
      policyManifest: policy,
      checks: [
        {
          ruleId: "minimum-replication",
          target: "target-control",
          observed: control.n,
          minimum: policy.minimumEligibleWells,
          passed: control.n >= policy.minimumEligibleWells,
        },
        {
          ruleId: "calibration-r2",
          target: "source-reported calibration",
          observed: plate.standards_metrics.r2,
          minimum: policy.minimumCalibrationR2,
          passed: plate.standards_metrics.r2 >= policy.minimumCalibrationR2,
        },
        {
          ruleId: "minimum-replication",
          target: "eligible candidate groups",
          observed: candidates.length,
          minimum: 1,
          passed: candidates.length > 0,
        },
      ],
    },
    limitations: [
      "Published example data; no experiment was performed by Bio Harness. Provider run ID is null in the source.",
      "Concentrations and calibration metrics are copied from the source, not recalibrated or independently authenticated.",
      "The target-control distribution is context, not proof of assay validity. No negative-control group is declared in this file.",
      "Well replicates are not independent biological repeats. Descriptive ranking is not statistical significance or a validated optimum.",
      "Selection on the same plate is exploratory. Confirmation requires a new, independently reviewed experiment.",
      "This replay ranks concentration, not cost efficiency. No current provider quote or qualified execution contract is available.",
      "CFPS is cell-free; this does not establish living-cell capabilities. Source metadata is never executed or used as instructions.",
    ],
  };
}
export type Replay = ReturnType<typeof parseReplay>;

export function loadReplay(scenario: Scenario = "original") {
  const base = new URL("../fixtures/ginkgo-cfps/", import.meta.url);
  return parseReplay(
    readFileSync(new URL("example_plate_return.json", base)),
    JSON.parse(readFileSync(new URL("manifest.json", base), "utf8")),
    scenario,
  );
}

/** A review brief, never an executable plan, Ginkgo schema, approval, or order. */
export function decisionBrief(replay: Replay, strategy: Strategy) {
  if (replay.qc.status !== "reviewable" || !replay.ranking.length)
    throw new Error("QC blocked: no follow-up brief may be generated");
  if (!["confirm", "explore"].includes(strategy))
    throw new Error("Unknown review strategy");
  const leaders = replay.ranking.slice(0, strategy === "confirm" ? 2 : 5);
  const body = {
    format: "bio-harness.scientific-review-brief.v1",
    status: "unapproved-review-only",
    strategy,
    source: {
      url: replay.source.url,
      sha256: replay.source.sha256,
      commit: replay.source.commit,
      plateId: replay.plateId,
    },
    evidence: leaders.map((c) => ({
      sampleId: c.sampleId,
      mean: c.mean,
      sd: c.sd,
      unit: replay.unit,
      n: c.n,
      wells: c.wells,
      excluded: c.excluded,
      formulationHash: c.formulationHash,
    })),
    rationale:
      strategy === "confirm"
        ? "Independently reassess the two descriptive leaders before claiming a reproducible advantage. Retain the reference condition and have a scientist define appropriate controls and independent replication."
        : "Review the five descriptive leaders as a candidate set. A scientist should assess formulation diversity, confounding, and feasible contrasts before proposing new conditions; this is not an optimized experimental design.",
    decisionToResolve:
      strategy === "confirm"
        ? "Does the apparent ordering persist in an independently reviewed repeat?"
        : "Which feasible contrasts would best distinguish competing explanations for the observed response?",
    wouldChangeOurMind:
      "A failed control, loss of the apparent ordering in independent repeats, or substantial overlap in the repeat measurements would require revising the recommendation—not declaring a winner.",
    unknowns: [
      "Independent repeatability",
      "Assay-qualified acceptance criteria",
      "Suitable replication and confirmation design",
      "Workflow feasibility, logistics, quote, and turnaround",
    ],
    providerAcceptance: false,
    execution:
      "No order sent. Not a Ginkgo API payload or executable protocol. A provider-qualified plan and new operator approval are required before any future execution.",
    estimate: null,
    qcPolicy: replay.qc.policy,
    policyManifest: replay.qc.policyManifest,
    software: replay.software,
    limitations: replay.limitations,
  };
  return { ...body, briefHash: hash(body) };
}

export function replayMarkdown(replay: Replay) {
  const lines = [
    "# CFPS evidence replay",
    "",
    "Published Ginkgo example · not live execution · not independently authenticated",
    "",
    replay.question,
    "",
    `Source: ${replay.source.url}`,
    `SHA-256: ${replay.source.sha256}`,
    `Scenario: ${replay.scenario}`,
    `Screen: ${replay.qc.status}`,
    `Policy: ${replay.qc.policyManifest.id} v${replay.qc.policyManifest.version} · ${replay.qc.policyManifest.policyHash}`,
    `Analysis: ${replay.software.analysisContract} · package ${replay.software.packageVersion}`,
    "Local module file hashes (not signed execution proof):",
    ...replay.software.files.map((f) => `- ${f.file}: ${f.sha256}`),
    "",
    replay.qc.policy,
    "",
    ...replay.qc.problems,
    "",
    "## Descriptive ranking",
    "",
    "| Sample | Mean (g/L) | SD | Eligible / total | Excluded wells |",
    "| --- | --- | --- | --- | --- |",
    ...replay.ranking.map(
      (c) =>
        `| ${c.sampleId} | ${c.mean!.toFixed(4)} | ${c.sd?.toFixed(4) ?? "—"} | ${c.n} / ${c.total} | ${c.excluded.join(", ") || "None"} |`,
    ),
    "",
    "## Limits",
    ...replay.limitations.map((s) => `- ${s}`),
  ];
  return lines.join("\n") + "\n";
}
