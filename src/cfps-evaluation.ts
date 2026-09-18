import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  decisionRequestSchema,
  prepareDecisionPacket,
} from "./cfps-decision.js";
import {
  readDecisionArtifact,
  readScientificReview,
  reviewStatements,
} from "./scientific-review.js";
import { hash } from "./contracts.js";
import { loadReplay } from "./replay.js";

const caseSchema = z
  .object({
    id: z.string().regex(/^[a-z-]+$/),
    request: decisionRequestSchema,
    expectedBoundary: z.enum(["review-only", "blocked-before-model"]),
    criteria: z.array(z.string().min(1)).min(1),
  })
  .strict();
const suiteSchema = z
  .object({
    format: z.literal("bio-harness.cfps-evaluation-cases.v1"),
    scientificReview: z
      .object({
        status: z.literal("pending"),
        reviewer: z.null(),
        notice: z.string(),
      })
      .strict(),
    cases: z.array(caseSchema).min(1),
  })
  .strict();
export function evaluationCases() {
  return suiteSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("../evals/cfps-cases.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}
export function evaluationCase(id: string) {
  const found = evaluationCases().cases.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown evaluation case: ${id}`);
  return found;
}

/** Offline fixture and boundary checks. These are NOT measurements of a model's scientific judgment. */
export function evaluateCaseBoundaries() {
  const suite = evaluationCases();
  const checks = suite.cases.map((entry) => {
    try {
      const packet = prepareDecisionPacket(entry.request);
      return {
        id: entry.id,
        kind: "software-boundary-check",
        observed: "review-only",
        passed: entry.expectedBoundary === "review-only",
        packetHash: packet.packetHash,
        requiredRefs: packet.requiredRefs,
        criteriaForHumanReview: entry.criteria,
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("QC blocked:"))
        throw error;
      return {
        id: entry.id,
        kind: "software-boundary-check",
        observed: "blocked-before-model",
        passed: entry.expectedBoundary === "blocked-before-model",
        reason: error.message,
        criteriaForHumanReview: entry.criteria,
      };
    }
  });
  return {
    format: "bio-harness.cfps-boundary-evaluation.v1",
    scientificReview: suite.scientificReview,
    suiteHash: hash(suite),
    modelCalls: 0,
    scientificJudgmentScore: null,
    allBoundariesPassed: checks.every((c) => c.passed),
    checks,
    notice:
      "These checks validate fixture availability and harness boundaries only. They are not model accuracy, semantic entailment, or a scientist-approved benchmark. Run cases with a model and collect claim-level human reviews separately.",
  };
}

/** Separate mechanical evidence checks from self-attested human support judgments; never auto-grade prose truth. */
export function evaluateDecisionArtifact(
  input: unknown,
  reviewInput?: unknown,
  caseId?: string,
) {
  const artifact = readDecisionArtifact(input);
  const packet = artifact.brief.packet;
  const entry = caseId ? evaluationCase(caseId) : null;
  if (entry && hash(entry.request) !== hash(packet.request))
    throw new Error(
      "Artifact question/scenario/strategy does not match the selected evaluation case",
    );
  const statements = reviewStatements(artifact);
  const cited = new Set(statements.flatMap((s) => s.evidenceRefs));
  let missing = packet.requiredRefs.filter((ref) => !cited.has(ref));
  let declaredCoverageMatches: boolean | null = null;
  const source = packet.source as { sha256?: string } | undefined;
  const policy = packet.policy as { policyHash?: string } | undefined;
  const replay = loadReplay(packet.request.scenario);
  const software = packet.software as { analysisContract?: string } | undefined;
  const comparable =
    source?.sha256 === replay.source.sha256 &&
    policy?.policyHash === replay.qc.policyManifest.policyHash &&
    software?.analysisContract === replay.software.analysisContract;
  let factsMatch: boolean | null = null;
  let qcAllowsBrief: boolean | null = null;
  if (comparable) {
    qcAllowsBrief = replay.qc.status === "reviewable";
    if (qcAllowsBrief) {
      const expected = prepareDecisionPacket(packet.request);
      missing = expected.requiredRefs.filter((ref) => !cited.has(ref));
      declaredCoverageMatches =
        hash(packet.requiredRefs) === hash(expected.requiredRefs);
      const keys = [
        "evidence",
        "computedSummary",
        "selectedSampleIds",
        "requiredRefs",
        "source",
        "policy",
      ] as const;
      factsMatch = keys.every(
        (key) =>
          Object.hasOwn(packet, key) &&
          hash(packet[key]) === hash(expected[key]),
      );
    }
  }
  const review =
    reviewInput === undefined ? null : readScientificReview(reviewInput, input);
  const counts = {
    supported: 0,
    unsupported: 0,
    unclear: 0,
    notReviewed: statements.length,
  };
  if (review) {
    counts.notReviewed = 0;
    for (const s of review.statements) {
      if (s.verdict === "not-reviewed") counts.notReviewed++;
      else counts[s.verdict]++;
    }
  }
  const reviewed = statements.length - counts.notReviewed;
  return {
    format: "bio-harness.cfps-artifact-evaluation.v1",
    artifactHash: artifact.artifactHash,
    case: entry,
    scientificReview: evaluationCases().scientificReview,
    mechanical: {
      artifactIntegrity: "hashes match; unsigned, not authenticated",
      citationIdentitiesResolved: true,
      missingRequiredReferences: missing,
      missingExclusionReferences: missing.filter((r) => r.startsWith("well:")),
      currentSourcePolicyAndAnalysisComparable: comparable,
      canonicalEvidenceMatches: factsMatch,
      declaredRequiredCoverageMatches: declaredCoverageMatches,
      localQcAllowsBrief: qcAllowsBrief,
      note: "Reference coverage does not prove that the model understood an exclusion. Incomparable historical policies are not silently recomputed; null means not evaluated.",
    },
    humanAssessment: {
      status: review ? "self-attested commentary" : "not evaluated",
      reviewer: review?.reviewer ?? null,
      reviewedAt: review?.reviewedAt ?? null,
      qualificationsVerified: false,
      ...counts,
      reviewed,
      unsupportedClaimRateAmongReviewed: reviewed
        ? counts.unsupported / reviewed
        : null,
      unsupportedClaimsDespiteResolvedCitations: review
        ? counts.unsupported
        : null,
      unresolvedConcerns: review?.unresolvedConcerns ?? null,
      note: "Rates describe this review attachment, not calibrated model accuracy or scientific confidence. Unclear and unreviewed statements are not passes. Human review cannot override a failed mechanical or QC check.",
    },
    scientificPass: null,
    conclusion:
      "No automatic scientific pass. Inspect mechanical failures, apply the case rubric, and obtain independent qualified review before relying on a recommendation. No execution authorized.",
  };
}
