import { createHash } from "node:crypto";
import { z } from "zod";
import { hash } from "./contracts.js";
import {
  interpretationSchema,
  decisionRequestSchema,
} from "./cfps-decision.js";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z
  .object({
    artifactHash: hex,
    generation: z
      .object({
        kind: z.literal("pi-agent"),
        provider: z.string(),
        model: z.string(),
        sessionId: z.string(),
      })
      .strict(),
    brief: z
      .object({
        format: z.literal("bio-harness.cfps-agent-decision.v1"),
        status: z.literal("unapproved-review-only"),
        briefHash: hex,
        interpretation: interpretationSchema,
        packet: z
          .object({
            packetHash: hex,
            request: decisionRequestSchema,
            evidence: z.record(z.unknown()),
            requiredRefs: z.array(z.string()),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();
/** Historical integrity, not current-policy recomputation, provenance authentication or semantic validation. */
export function readDecisionArtifact(input: unknown) {
  const artifact = artifactSchema.parse(input);
  const { artifactHash, ...body } = artifact;
  const { briefHash, ...briefBody } = artifact.brief;
  const { packetHash, ...packetBody } = artifact.brief.packet;
  if (
    hash(input) !== hash(artifact) ||
    hash(body) !== artifactHash ||
    hash(briefBody) !== briefHash ||
    hash(packetBody) !== packetHash
  )
    throw new Error("Decision artifact integrity mismatch");
  for (const statement of reviewStatements(artifact))
    for (const ref of statement.evidenceRefs)
      if (!Object.hasOwn(artifact.brief.packet.evidence, ref))
        throw new Error(`Unknown evidence reference: ${ref}`);
  return artifact;
}
export type SavedDecisionArtifact = ReturnType<typeof artifactSchema.parse>;
export function reviewStatements(artifact: SavedDecisionArtifact) {
  const { assessment, recommendation, uncertainties } =
    artifact.brief.interpretation;
  return [
    ...assessment.map((s, i) => ({ id: `assessment:${i}`, ...s })),
    { id: "recommendation", ...recommendation },
    ...uncertainties.map((s, i) => ({ id: `uncertainties:${i}`, ...s })),
  ];
}
export const reviewSchema = z
  .object({
    format: z.literal("bio-harness.scientific-review.v1"),
    artifactHash: hex,
    reviewer: z.string().trim().min(1).max(120),
    reviewedAt: z.string().datetime(),
    statements: z
      .array(
        z
          .object({
            id: z.string().min(1).max(50),
            verdict: z.enum([
              "not-reviewed",
              "supported",
              "unsupported",
              "unclear",
            ]),
            rationale: z.string().trim().max(1500),
          })
          .strict(),
      )
      .min(3)
      .max(13),
    unresolvedConcerns: z.string().trim().min(1).max(3000),
    authority: z.literal(
      "Self-attested review commentary, not authenticated identity, execution approval, or scientific certification.",
    ),
    reviewHash: hex,
  })
  .strict();
export function readScientificReview(input: unknown, artifactInput: unknown) {
  const artifact = readDecisionArtifact(artifactInput);
  const review = reviewSchema.parse(input);
  // Hash the original serialized body; parsing must not silently normalize the signed-over text.
  const { reviewHash, ...body } = input as z.infer<typeof reviewSchema>;
  if (
    createHash("sha256").update(JSON.stringify(body)).digest("hex") !==
    reviewHash
  )
    throw new Error("Review integrity mismatch");
  if (review.artifactHash !== artifact.artifactHash)
    throw new Error("Review belongs to a different artifact");
  const ids = reviewStatements(artifact).map((s) => s.id);
  if (
    new Set(review.statements.map((s) => s.id)).size !== ids.length ||
    review.statements.length !== ids.length ||
    review.statements.some((s) => !ids.includes(s.id))
  )
    throw new Error("Review must cover each statement exactly once");
  if (
    review.statements.some((s) => s.verdict !== "not-reviewed" && !s.rationale)
  )
    throw new Error("Reviewed statements require a rationale");
  return review;
}
