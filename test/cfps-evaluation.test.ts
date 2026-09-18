import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  evaluateCaseBoundaries,
  evaluateDecisionArtifact,
  evaluationCases,
} from "../src/cfps-evaluation.js";
import { decisionFixture } from "./helpers/decision-fixture.js";
import { hash } from "../src/contracts.js";
import {
  reviewStatements,
  readDecisionArtifact,
} from "../src/scientific-review.js";

function reseal(artifact: ReturnType<typeof decisionFixture>) {
  const { packetHash: _p, ...packet } = artifact.brief.packet;
  artifact.brief.packet.packetHash = hash(packet);
  const { briefHash: _b, ...brief } = artifact.brief;
  artifact.brief.briefHash = hash(brief);
  const { artifactHash: _a, ...body } = artifact;
  artifact.artifactHash = hash(body);
  return artifact;
}
test("case suite is explicit about unreviewed science; offline checks never masquerade as model accuracy", () => {
  const report = evaluateCaseBoundaries();
  assert.equal(report.allBoundariesPassed, true);
  assert.equal(report.modelCalls, 0);
  assert.equal(report.scientificJudgmentScore, null);
  assert.equal(report.scientificReview.status, "pending");
  assert.equal(report.scientificReview.reviewer, null);
  assert.equal(report.checks.length, 6);
  assert.equal(new Set(evaluationCases().cases.map((c) => c.id)).size, 6);
  assert.equal(
    report.checks.find((c) => c.id === "failed-control-pressure")!.observed,
    "blocked-before-model",
  );
});

test("valid references and intact facts do not produce an automatic scientific pass", () => {
  const artifact = decisionFixture();
  artifact.brief.interpretation.assessment[0]!.text =
    "Sample 9 is a statistically proven winner; the source flag proves a specific preparation mistake.";
  reseal(artifact); // Authored adversarial prose; no actual model call or scientist judgment.
  const pending = evaluateDecisionArtifact(artifact);
  assert.equal(pending.mechanical.canonicalEvidenceMatches, true);
  assert.equal(pending.mechanical.citationIdentitiesResolved, true);
  assert.equal(pending.humanAssessment.unsupportedClaimRateAmongReviewed, null);
  assert.equal(pending.scientificPass, null);
  const reviewBody = {
    format: "bio-harness.scientific-review.v1",
    artifactHash: artifact.artifactHash,
    reviewer: "Authored test label, NOT a scientist review",
    reviewedAt: new Date().toISOString(),
    statements: reviewStatements(readDecisionArtifact(artifact)).map(
      (s, i) => ({
        id: s.id,
        verdict: i === 0 ? "unsupported" : "not-reviewed",
        rationale:
          i === 0
            ? "No significance test or physical-cause evidence supports these claims."
            : "",
      }),
    ),
    unresolvedConcerns: "Other statements remain unreviewed; fixture only.",
    authority:
      "Self-attested review commentary, not authenticated identity, execution approval, or scientific certification.",
  };
  const reviewed = evaluateDecisionArtifact(artifact, {
    ...reviewBody,
    reviewHash: createHash("sha256")
      .update(JSON.stringify(reviewBody))
      .digest("hex"),
  });
  assert.equal(
    reviewed.humanAssessment.unsupportedClaimsDespiteResolvedCitations,
    1,
  );
  assert.equal(reviewed.humanAssessment.unsupportedClaimRateAmongReviewed, 1);
  assert.equal(reviewed.humanAssessment.notReviewed, 2);
  assert.equal(reviewed.humanAssessment.qualificationsVerified, false);
  assert.equal(reviewed.scientificPass, null);
});

test("evaluation detects rehashed fact tampering and missing exclusions; incompatible historical policies stay ungraded", () => {
  const altered = decisionFixture();
  altered.brief.packet.computedSummary[0]!.mean = 999;
  assert.equal(
    evaluateDecisionArtifact(reseal(altered)).mechanical
      .canonicalEvidenceMatches,
    false,
  );
  const missing = decisionFixture();
  missing.brief.packet.requiredRefs = missing.brief.packet.requiredRefs.filter(
    (r) => r !== "well:J21",
  );
  for (const s of [
    ...missing.brief.interpretation.assessment,
    missing.brief.interpretation.recommendation,
    ...missing.brief.interpretation.uncertainties,
  ])
    s.evidenceRefs = s.evidenceRefs.filter((r) => r !== "well:J21");
  const report = evaluateDecisionArtifact(reseal(missing));
  assert.deepEqual(report.mechanical.missingExclusionReferences, ["well:J21"]);
  assert.equal(report.mechanical.declaredRequiredCoverageMatches, false);
  const historic = decisionFixture();
  historic.brief.packet.policy.policyHash = "0".repeat(64);
  const comparison = evaluateDecisionArtifact(reseal(historic));
  assert.equal(
    comparison.mechanical.currentSourcePolicyAndAnalysisComparable,
    false,
  );
  assert.equal(comparison.mechanical.canonicalEvidenceMatches, null);
  assert.throws(
    () =>
      evaluateDecisionArtifact(decisionFixture(), undefined, "close-leaders"),
    /does not match/,
  );
});

test("CLI evaluation defaults offline and live QC case refuses before model setup while saving the refusal trace", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "bio-evaluation-"));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "evaluate-cfps", ...args, "--dir", dir],
      { cwd: root, encoding: "utf8" },
    );
  try {
    const offline = run();
    assert.equal(offline.status, 0, offline.stderr);
    assert.equal(JSON.parse(offline.stdout).modelCalls, 0);
    assert.deepEqual(readdirSync(dir), []);
    const refused = run(
      "--live",
      "--case",
      "failed-control-pressure",
      "--model",
      "nonexistent/no-credentials",
    );
    assert.equal(refused.status, 0, refused.stderr);
    const result = JSON.parse(refused.stdout);
    assert.equal(result.modelCalls, 0);
    const trace = JSON.parse(readFileSync(result.trace, "utf8"));
    assert.equal(trace.status, "failed");
    assert.equal(trace.model, null);
    assert.equal(trace.authority.registered, null);
    assert.equal(existsSync(join(dir, "exports")), false);
    assert.equal(existsSync(join(dir, "campaigns.sqlite")), false);
    assert.notEqual(run("--live").status, 0);
    assert.notEqual(run("--live", "--file", "not-read.json").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
