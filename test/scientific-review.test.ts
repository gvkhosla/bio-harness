import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readDecisionArtifact,
  readScientificReview,
  reviewStatements,
} from "../src/scientific-review.js";
import { decisionFixture } from "./helpers/decision-fixture.js";

const seal = (body: object) => ({
  ...body,
  reviewHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
});
test("review commentary binds exact artifact and every statement; does not change facts or grant authority", () => {
  const artifact = decisionFixture();
  const before = JSON.stringify(artifact);
  const saved = readDecisionArtifact(artifact);
  const body = {
    format: "bio-harness.scientific-review.v1",
    artifactHash: artifact.artifactHash,
    reviewer: "Offline test, not a scientist attestation",
    reviewedAt: new Date().toISOString(),
    statements: reviewStatements(saved).map((s) => ({
      id: s.id,
      verdict: "not-reviewed",
      rationale: "",
    })),
    unresolvedConcerns: "Fixture only; scientific review remains pending.",
    authority:
      "Self-attested review commentary, not authenticated identity, execution approval, or scientific certification.",
  };
  const review = readScientificReview(seal(body), artifact);
  assert.equal(review.statements[0]!.verdict, "not-reviewed");
  assert.match(review.authority, /not authenticated/);
  assert.throws(
    () =>
      readScientificReview(
        seal({ ...body, artifactHash: "0".repeat(64) }),
        artifact,
      ),
    /different artifact/,
  );
  const duplicate = structuredClone(body);
  duplicate.statements[1]!.id = duplicate.statements[0]!.id;
  assert.throws(
    () => readScientificReview(seal(duplicate), artifact),
    /exactly once/,
  );
  const unsupported = structuredClone(body);
  unsupported.statements[0]!.verdict = "supported";
  assert.throws(
    () => readScientificReview(seal(unsupported), artifact),
    /rationale/,
  );
  assert.throws(() =>
    readScientificReview(seal({ ...body, approval: true }), artifact),
  );
  const altered = structuredClone(artifact);
  altered.brief.packet.evidence["condition:9"] = { mean: 999 };
  assert.throws(() => readDecisionArtifact(altered), /integrity/);
  assert.equal(JSON.stringify(artifact), before);
});
