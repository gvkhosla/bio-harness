import { z } from "zod";
import { hash } from "./contracts.js";
import { loadReplay } from "./replay.js";
import { cfpsCondition } from "./cfps-evidence.js";
import { authorityProfile } from "./authority.js";

const paragraph = z
  .string()
  .trim()
  .min(1)
  .max(1500)
  .refine(
    (text) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text),
    "Control characters are not allowed",
  );
const citedText = z
  .object({
    text: paragraph,
    evidenceRefs: z.array(z.string().min(1).max(100)).min(1).max(12),
  })
  .strict();
export const decisionRequestSchema = z
  .object({
    question: paragraph,
    scenario: z.enum(["original", "control-failure"]),
    strategy: z.enum(["confirm", "explore"]),
  })
  .strict();
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export const interpretationSchema = z
  .object({
    assessment: z.array(citedText).min(1).max(6),
    recommendation: citedText,
    uncertainties: z.array(citedText).min(1).max(6),
    wouldChangeDecision: z.array(paragraph).min(1).max(4),
  })
  .strict();
const submissionSchema = z
  .object({
    packetHash: z.string().regex(/^[a-f0-9]{64}$/),
    interpretation: interpretationSchema,
  })
  .strict();

/** Harness-owned facts: the model may cite these but cannot supply or overwrite them. */
export function prepareDecisionPacket(input: unknown) {
  const request = decisionRequestSchema.parse(input);
  const replay = loadReplay(request.scenario);
  if (replay.qc.status !== "reviewable")
    throw new Error(
      `QC blocked: no decision brief may be generated. ${replay.qc.problems.join(" ")}`,
    );
  const candidates = replay.ranking.slice(
    0,
    request.strategy === "confirm" ? 2 : 5,
  );
  const evidence: Record<string, unknown> = {
    "plate:qc": { origin: "harness-local-policy", ...replay.qc },
    "plate:calibration": {
      ...replay.calibration,
      sourcePointer: "/standards_metrics",
    },
    "plate:target-control": {
      origin: "harness-computed",
      ...replay.control,
      unit: replay.unit,
      concentrationPointers: replay.control.wells.map(
        (well) => `/concentration_results/concentration_g_L/${well}`,
      ),
      note: "Named reference, not a declared negative control; not proof of assay validity.",
    },
  };
  const requiredRefs: string[] = [];
  for (const candidate of candidates) {
    const result = cfpsCondition({
      scenario: request.scenario,
      sampleId: candidate.sampleId,
    });
    if (result.source.sha256 !== replay.source.sha256)
      throw new Error("Source changed while building the decision packet");
    const ref = `condition:${candidate.sampleId}`;
    requiredRefs.push(ref);
    evidence[ref] = {
      origin: "harness-computed",
      ...candidate,
      unit: replay.unit,
      descriptiveRank: result.descriptiveRank,
      inputs: candidate.wells.map((well) => `well:${well}`),
    };
    for (const well of result.observations) {
      evidence[`well:${well.well}`] = {
        origin: "source-measurement-with-local-screen",
        ...well,
        unit: replay.unit,
        fluorescenceUnit: "unspecified in source",
      };
      if (!well.eligible) requiredRefs.push(`well:${well.well}`);
    }
  }
  if (candidates.length > 1) {
    const [first, second] = candidates;
    evidence[`comparison:${first!.sampleId}:${second!.sampleId}`] = {
      origin: "harness-computed",
      inputs: [`condition:${first!.sampleId}`, `condition:${second!.sampleId}`],
      differenceInMeans: first!.mean! - second!.mean!,
      unit: replay.unit,
      note: "Descriptive difference only; no significance test or independence assumption.",
    };
  }
  const body = {
    format: "bio-harness.cfps-decision-packet.v1",
    request,
    authority: authorityProfile("cfps-decision"),
    policy: replay.qc.policyManifest,
    software: replay.software,
    source: {
      url: replay.source.url,
      sha256: replay.source.sha256,
      commit: replay.source.commit,
      plateId: replay.plateId,
      providerRunId: replay.providerRunId,
      evidenceKind: replay.source.evidenceKind,
      attribution: replay.source.attribution,
      license: replay.source.license,
      integrity: "Local pinned-byte check, not provider authentication.",
    },
    computedSummary: candidates.map((c) => ({
      sampleId: c.sampleId,
      eligible: c.n,
      total: c.total,
      mean: c.mean,
      sd: c.sd,
      unit: replay.unit,
      excluded: c.excluded,
      evidenceRef: `condition:${c.sampleId}`,
    })),
    selectedSampleIds: candidates.map((c) => c.sampleId),
    selectionRule:
      "Harness-selected top descriptive means after local QC; two for confirmation or five for exploration. Not an agent-designed experiment.",
    evidence,
    requiredRefs,
    limitations: replay.limitations,
    interpretationInstructions:
      "Use only supplied evidence IDs as citations. Cover each selected condition and every excluded selected well. Keep numeric facts in the harness-owned evidence; supply assessment, recommendation, uncertainties, and what would change the decision. Interpretive prose is model-authored and requires human review, even when citations resolve. No wet-lab protocol, approval, quote or order.",
  };
  return { ...body, packetHash: hash(body) };
}
export type DecisionPacket = ReturnType<typeof prepareDecisionPacket>;

/** Citation existence/coverage checks are NOT semantic or scientific validation of prose. */
export function assembleDecisionBrief(
  requestInput: unknown,
  submissionInput: unknown,
) {
  const packet = prepareDecisionPacket(requestInput);
  const submission = submissionSchema.parse(submissionInput);
  if (submission.packetHash !== packet.packetHash)
    throw new Error(
      "Evidence packet mismatch: question, scenario, strategy, source, or computed evidence changed; inspect the current packet",
    );
  const sections = [
    ...submission.interpretation.assessment,
    submission.interpretation.recommendation,
    ...submission.interpretation.uncertainties,
  ];
  const cited = new Set<string>();
  for (const section of sections) {
    if (new Set(section.evidenceRefs).size !== section.evidenceRefs.length)
      throw new Error("Duplicate evidence reference within a statement");
    for (const ref of section.evidenceRefs) {
      if (!Object.hasOwn(packet.evidence, ref))
        throw new Error(`Unknown evidence reference: ${ref}`);
      cited.add(ref);
    }
  }
  const missing = packet.requiredRefs.filter((ref) => !cited.has(ref));
  if (missing.length)
    throw new Error(
      `Missing required evidence coverage: ${missing.join(", ")}`,
    );
  const body = {
    format: "bio-harness.cfps-agent-decision.v1",
    status: "unapproved-review-only",
    packet,
    interpretation: submission.interpretation,
    authorship:
      "Interpretation supplied by caller; model/session identity is recorded by the agent runner, not accepted from model arguments.",
    validation: {
      packetHash: "matched recomputed evidence",
      references: "resolved against packet and required coverage present",
      semantics:
        "NOT validated: references may exist without supporting the prose. Human scientific review is required.",
    },
    execution:
      "No plan, approval, quote, or order. Not an executable protocol. No campaign or source data changed.",
  };
  return { ...body, briefHash: hash(body) };
}
export type AgentDecisionBrief = ReturnType<typeof assembleDecisionBrief>;

const provenanceSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    sessionId: z.string().min(1),
  })
  .strict();
export function decisionArtifact(
  brief: AgentDecisionBrief,
  provenanceInput: unknown,
) {
  // Revalidate before exporting, including hashes; do not bless caller-modified evidence.
  const rebuilt = assembleDecisionBrief(brief.packet.request, {
    packetHash: brief.packet.packetHash,
    interpretation: brief.interpretation,
  });
  if (hash(brief) !== hash(rebuilt))
    throw new Error("Decision brief integrity mismatch");
  const provenance = provenanceSchema.parse(provenanceInput);
  const body = { brief, generation: { kind: "pi-agent", ...provenance } };
  return { ...body, artifactHash: hash(body) };
}
export type DecisionArtifact = ReturnType<typeof decisionArtifact>;

// Interpretive text is untrusted: escape markdown/HTML rather than exporting active markup.
function plain(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+!|]/g, "\\$&")
    .replace(/\r?\n/g, " ");
}
export function decisionMarkdown(artifact: DecisionArtifact) {
  const { brief } = artifact;
  const { packet, interpretation } = brief;
  const statement = (s: z.infer<typeof citedText>) =>
    `- ${plain(s.text)}\n  - References: ${s.evidenceRefs.map((ref) => `\`${ref}\``).join(", ")}`;
  const lines = [
    "# CFPS agent decision brief",
    "",
    "**Unapproved · public-example replay · no order sent**",
    "",
    `Question: ${plain(packet.request.question)}`,
    `Scenario: ${packet.request.scenario}`,
    `Direction: ${packet.request.strategy}`,
    `Local policy: ${packet.policy.id} v${packet.policy.version} · ${packet.policy.policyHash}`,
    `Analysis contract: ${packet.software.analysisContract} · package ${packet.software.packageVersion}`,
    ...packet.software.files.map((f) => `Module ${f.file}: ${f.sha256}`),
    packet.software.boundary,
    "",
    `Source: ${packet.source.url}`,
    `Attribution: ${plain(packet.source.attribution)} · ${plain(packet.source.license)}`,
    `Source integrity: ${packet.source.integrity}`,
    `Source SHA-256: ${packet.source.sha256}`,
    `Evidence packet: ${packet.packetHash}`,
    `Brief hash: ${brief.briefHash}`,
    `Artifact hash: ${artifact.artifactHash}`,
    "",
    `Model: ${plain(artifact.generation.provider)}/${plain(artifact.generation.model)}`,
    `Pi session: ${plain(artifact.generation.sessionId)}`,
    "",
    "## Computed observations — descriptive, not significance",
    "",
    "| Sample | Eligible / total | Mean (g/L) | Sample SD (g/L) | Excluded wells | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...packet.computedSummary.map(
      (c) =>
        `| ${c.sampleId} | ${c.eligible} / ${c.total} | ${c.mean?.toFixed(6) ?? "missing"} | ${c.sd?.toFixed(6) ?? "missing"} | ${c.excluded.join(", ") || "none"} | ${c.evidenceRef} |`,
    ),
    "",
    "Full precision and original measurements appear in the evidence appendix below.",
    "",
    "## Model interpretation — requires human review",
    "",
    "### Assessment",
    ...interpretation.assessment.map(statement),
    "",
    "### Recommendation",
    statement(interpretation.recommendation),
    "",
    "### Uncertainties",
    ...interpretation.uncertainties.map(statement),
    "",
    "### What would change this decision?",
    ...interpretation.wouldChangeDecision.map((s) => `- ${plain(s)}`),
    "",
    "## Validation boundary",
    brief.validation.semantics,
    brief.execution,
    "",
    "## Harness-owned evidence — not model-generated measurements",
    "",
    packet.selectionRule,
    "",
  ];
  for (const [ref, fact] of Object.entries(packet.evidence))
    lines.push(
      `### ${ref}`,
      "",
      "```json",
      JSON.stringify(fact, null, 2),
      "```",
      "",
    );
  lines.push(
    "## Scientific limits",
    ...packet.limitations.map((s) => `- ${s}`),
    "",
  );
  return lines.join("\n");
}
