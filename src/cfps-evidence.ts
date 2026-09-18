import { z } from "zod";
import { loadReplay, type Replay, type ReplayWell } from "./replay.js";

const scenarioSchema = z.enum(["original", "control-failure"]);
const plateInput = z
  .object({
    scenario: scenarioSchema,
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
const conditionInput = z
  .object({
    scenario: scenarioSchema,
    sampleId: z.string().regex(/^(0|[1-9][0-9]{0,2})$/),
  })
  .strict();
const wellInput = z
  .object({
    scenario: scenarioSchema,
    well: z.string().regex(/^[A-P](0[1-9]|1[0-9]|2[0-4])$/),
  })
  .strict();

function context(replay: Replay) {
  return {
    evidenceKind: replay.source.evidenceKind,
    scenario: replay.scenario,
    plateId: replay.plateId,
    providerRunId: replay.providerRunId,
    source: {
      url: replay.source.url,
      commit: replay.source.commit,
      sha256: replay.source.sha256,
      integrity:
        "Local bytes match pinned manifest; NOT provider authentication.",
      attribution: replay.source.attribution,
      license: replay.source.license,
    },
    units: {
      concentration: replay.unit,
      fluorescence: "source raw reading; unit not specified in the fixture",
    },
    qc: replay.qc,
    software: replay.software,
    statisticsOrigin:
      "Bio Harness descriptive statistics over locally eligible observations; not provider-supplied statistics or significance tests.",
    limitations: replay.limitations,
    authority:
      "Read-only evidence. No campaign mutation, approval, result import, brief generation, or execution. Scenario is explicit per call; it is not synchronized with the browser selection.",
  };
}

function observation(well: ReplayWell) {
  return {
    ...well,
    sourcePointers: {
      sample: `/samples/${well.column * 16 + well.row}`,
      concentration: `/concentration_results/concentration_g_L/${well.well}`,
      fluorescence: `/fluorescence_results/fluorescence/${well.well}`,
      flags: well.sourceFlags.length
        ? `/reagent_flags/flags/${well.well}`
        : null,
    },
    derivedFields: ["formulationHash", "eligible", "demoFlags", "screen"],
    exclusionReasons: well.screen.reasons.map((reason) => reason.explanation),
  };
}

/** Fixed vendored source only. Never accepts paths, URLs, arbitrary JSON, or caller-provided observations. */
export function cfpsPlate(input: unknown) {
  const params = plateInput.parse(input);
  const replay = loadReplay(params.scenario);
  return {
    ...context(replay),
    question: replay.question,
    proteinTarget: replay.proteinTarget,
    geometry: { rows: 16, columns: 24, sampleOrder: "column-major" },
    counts: {
      wells: replay.wells.length,
      experimentalConditions: replay.conditions.length,
      rankableConditions: replay.ranking.length,
    },
    sampleIds: replay.conditions.map((c) => c.sampleId),
    calibration: replay.calibration,
    calibrationPointer: "/standards_metrics",
    targetControl: replay.control,
    shortlist: replay.ranking.slice(0, params.limit),
    shortlistReturned: Math.min(params.limit, replay.ranking.length),
    shortlistTruncated: replay.ranking.length > params.limit,
    nextInspection:
      "Use bio_cfps_condition with an exact sampleId for all four replicates, or bio_cfps_well with an exact A01–P24 coordinate. Cite source URL, scenario, and returned JSON pointers. A blocked QC state has no shortlist.",
  };
}

export function cfpsCondition(input: unknown) {
  const params = conditionInput.parse(input);
  const replay = loadReplay(params.scenario);
  const condition = replay.conditions.find(
    (c) => c.sampleId === params.sampleId,
  );
  if (!condition)
    throw new Error(
      `Unknown experimental sample ID: ${params.sampleId}. Inspect bio_cfps_plate for valid IDs.`,
    );
  const rankIndex = replay.ranking.findIndex(
    (c) => c.sampleId === params.sampleId,
  );
  return {
    ...context(replay),
    condition,
    descriptiveRank: rankIndex < 0 ? null : rankIndex + 1,
    observations: replay.wells
      .filter((w) => condition.wells.includes(w.well))
      .map(observation),
  };
}

export function cfpsWell(input: unknown) {
  const params = wellInput.parse(input);
  const replay = loadReplay(params.scenario);
  const well = replay.wells.find((w) => w.well === params.well)!;
  return { ...context(replay), observation: observation(well) };
}
