import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  prepareDecisionPacket,
  assembleDecisionBrief,
  decisionArtifact,
  decisionMarkdown,
} from "../src/cfps-decision.js";
import { createDecisionRun } from "../src/cfps-decision-agent.js";
import { hash } from "../src/contracts.js";
import { loadReplay } from "../src/replay.js";

const request = {
  question: "Why not simply choose sample 9?",
  scenario: "original",
  strategy: "confirm",
};
function submission(input = request) {
  const packet = prepareDecisionPacket(input);
  return {
    packetHash: packet.packetHash,
    interpretation: {
      assessment: [
        {
          text: "The descriptive leaders have similar means; ranking alone does not establish superiority. The flagged replicate remains visible and excluded.",
          evidenceRefs: [...packet.requiredRefs],
        },
      ],
      recommendation: {
        text: "Seek expert-reviewed independent confirmation before selecting a winner.",
        evidenceRefs: packet.requiredRefs.filter((r) =>
          r.startsWith("condition:"),
        ),
      },
      uncertainties: [
        {
          text: "Local screening is not provider-qualified assay acceptance or proof of biological independence.",
          evidenceRefs: ["plate:qc"],
        },
      ],
      wouldChangeDecision: [
        "A loss of the apparent ordering in independent repeats would change the recommendation.",
      ],
    },
  };
}
function invoke(
  run: ReturnType<typeof createDecisionRun>,
  name: string,
  input: unknown,
) {
  return run.tools
    .find((t) => t.name === name)!
    .execute(
      "decision-test",
      input as never,
      new AbortController().signal,
      undefined,
      {} as ExtensionContext,
    );
}
function toolSubmission(input = request) {
  const s = submission(input);
  return {
    packetHash: s.packetHash,
    interpretationJson: JSON.stringify(s.interpretation),
  };
}

test("decision packet owns exact statistics, excludes flagged measurements, and binds question/scenario/strategy", () => {
  const packet = prepareDecisionPacket(request);
  const replay = loadReplay();
  assert.deepEqual(packet, prepareDecisionPacket(request));
  assert.deepEqual(packet.selectedSampleIds, ["9", "5"]);
  assert.deepEqual(packet.requiredRefs, [
    "condition:9",
    "well:J21",
    "condition:5",
  ]);
  const condition = packet.evidence["condition:9"] as {
    mean: number;
    sd: number;
    n: number;
    excluded: string[];
  };
  assert.equal(condition.mean, replay.ranking[0]!.mean);
  assert.equal(condition.sd, replay.ranking[0]!.sd);
  assert.equal(condition.n, 3);
  assert.deepEqual(condition.excluded, ["J21"]);
  const j21 = packet.evidence["well:J21"] as {
    eligible: boolean;
    sourcePointers: { flags: string };
    sourceFlags: string[];
  };
  assert.equal(j21.eligible, false);
  assert.deepEqual(j21.sourceFlags, ["lysate"]);
  assert.equal(j21.sourcePointers.flags, "/reagent_flags/flags/J21");
  const comparison = packet.evidence["comparison:9:5"] as {
    differenceInMeans: number;
  };
  assert.equal(
    comparison.differenceInMeans,
    replay.ranking[0]!.mean! - replay.ranking[1]!.mean!,
  );
  assert.notEqual(
    packet.packetHash,
    prepareDecisionPacket({ ...request, question: "Different decision" })
      .packetHash,
  );
  assert.notEqual(
    packet.packetHash,
    prepareDecisionPacket({ ...request, strategy: "explore" }).packetHash,
  );
  assert.equal(
    prepareDecisionPacket({ ...request, strategy: "explore" }).selectedSampleIds
      .length,
    5,
  );
  assert.ok(!JSON.stringify(packet).includes('"metadata":'));
  assert.ok(JSON.stringify(packet).length < 30000);
  assert.equal(packet.source.attribution, replay.source.attribution);
  assert.equal(packet.source.license, replay.source.license);
  assert.equal(packet.computedSummary[0]!.mean, condition.mean);
  assert.equal(packet.computedSummary[0]!.eligible, condition.n);
  const exploration = prepareDecisionPacket({
    ...request,
    strategy: "explore",
  });
  assert.ok(JSON.stringify(exploration).length < 50000);
  assert.equal(
    assembleDecisionBrief(
      { ...request, strategy: "explore" },
      submission({ ...request, strategy: "explore" }),
    ).packet.packetHash,
    exploration.packetHash,
  );
});

test("brief validation rejects invented references, missing exclusions, stale packets and caller-owned facts", () => {
  const good = submission();
  const brief = assembleDecisionBrief(request, good);
  assert.equal(brief.status, "unapproved-review-only");
  assert.deepEqual(brief.packet, prepareDecisionPacket(request));
  const { briefHash, ...body } = brief;
  assert.equal(briefHash, hash(body));
  assert.throws(
    () =>
      assembleDecisionBrief(request, { ...good, packetHash: "0".repeat(64) }),
    /packet mismatch/,
  );
  assert.throws(
    () => assembleDecisionBrief({ ...request, strategy: "explore" }, good),
    /packet mismatch/,
  );
  for (const ref of [
    "well:Z99",
    "https://invented.example/paper",
    "__proto__",
    "constructor",
    "condition:999",
  ]) {
    const bad = structuredClone(good);
    bad.interpretation.assessment[0]!.evidenceRefs.push(ref);
    assert.throws(
      () => assembleDecisionBrief(request, bad),
      /Unknown evidence reference/,
    );
  }
  const missing = structuredClone(good);
  missing.interpretation.assessment[0]!.evidenceRefs = [
    "condition:9",
    "condition:5",
  ];
  assert.throws(() => assembleDecisionBrief(request, missing), /well:J21/);
  const duplicate = structuredClone(good);
  duplicate.interpretation.assessment[0]!.evidenceRefs.push("condition:9");
  assert.throws(() => assembleDecisionBrief(request, duplicate), /Duplicate/);
  assert.throws(() =>
    assembleDecisionBrief(request, { ...good, facts: { mean: 999 } }),
  );
  assert.throws(() =>
    assembleDecisionBrief(request, {
      ...good,
      interpretation: { ...good.interpretation, approval: true },
    }),
  );
  assert.throws(() =>
    assembleDecisionBrief(request, {
      ...good,
      interpretation: { ...good.interpretation, uncertainties: [] },
    }),
  );
  assert.throws(() =>
    assembleDecisionBrief(request, {
      ...good,
      interpretation: {
        ...good.interpretation,
        wouldChangeDecision: ["\u001b[31m"],
      },
    }),
  );
});

test("resolving a citation does not certify prose semantics, and artifacts say so", () => {
  const s = submission();
  s.interpretation.assessment[0]!.text =
    "This deliberately unsupported test sentence claims a proven winner.";
  const brief = assembleDecisionBrief(request, s);
  assert.match(brief.validation.semantics, /NOT validated/);
  assert.match(brief.validation.semantics, /Human scientific review/);
  assert.equal(brief.status, "unapproved-review-only");
  assert.match(brief.authorship, /supplied by caller/);
});

test("restricted Pi run requires context, permits correction, freezes successful output and exposes no campaign tools", async () => {
  const run = createDecisionRun(request);
  assert.deepEqual(
    run.tools.map((t) => t.name),
    ["bio_cfps_decision_context", "bio_cfps_submit_decision"],
  );
  assert.throws(() => run.result(), /No decision brief submitted/);
  await assert.rejects(
    invoke(run, "bio_cfps_submit_decision", toolSubmission()),
    /Inspect/,
  );
  await assert.rejects(
    invoke(run, "bio_cfps_decision_context", { scenario: "control-failure" }),
    /no arguments/,
  );
  const context = await invoke(run, "bio_cfps_decision_context", {});
  assert.match(JSON.stringify(context), /well:J21/);
  await assert.rejects(
    invoke(run, "bio_cfps_submit_decision", {
      ...toolSubmission(),
      scenario: "original",
    }),
    /Unexpected/,
  );
  await assert.rejects(
    invoke(run, "bio_cfps_submit_decision", {
      ...toolSubmission(),
      interpretationJson: "not JSON",
    }),
  );
  await assert.rejects(
    invoke(run, "bio_cfps_submit_decision", {
      ...toolSubmission(),
      interpretationJson: "x".repeat(24001),
    }),
    /24000/,
  );
  assert.throws(() => run.result(), /No decision brief/);
  await assert.rejects(
    invoke(
      run,
      "bio_cfps_submit_decision",
      toolSubmission({ ...request, question: "Different operator question" }),
    ),
    /packet mismatch/,
  );
  const accepted = await invoke(
    run,
    "bio_cfps_submit_decision",
    toolSubmission(),
  );
  assert.match(JSON.stringify(accepted), /unapproved-review-only/);
  const first = run.result();
  await invoke(run, "bio_cfps_submit_decision", toolSubmission()); // idempotent replay
  const revision = toolSubmission();
  const text = JSON.parse(revision.interpretationJson);
  text.assessment[0].text = "Different interpretation.";
  await assert.rejects(
    invoke(run, "bio_cfps_submit_decision", {
      ...revision,
      interpretationJson: JSON.stringify(text),
    }),
    /immutable/,
  );
  first.interpretation.assessment[0]!.text = "Attempted external mutation";
  assert.notEqual(
    run.result().interpretation.assessment[0]!.text,
    first.interpretation.assessment[0]!.text,
  );
});

test("artifact contains immutable canonical evidence, model attribution and escaped model prose", () => {
  const s = submission();
  s.interpretation.assessment[0]!.text =
    "<script>alert(1)</script> [untrusted link](https://example.com) `code`";
  const brief = assembleDecisionBrief(request, s);
  const artifact = decisionArtifact(brief, {
    provider: "offline-test",
    model: "not-a-live-model",
    sessionId: "test-session",
  });
  const { artifactHash, ...body } = artifact;
  assert.equal(artifactHash, hash(body));
  const markdown = decisionMarkdown(artifact);
  assert.match(markdown, /Unapproved/);
  assert.match(markdown, /Model interpretation/);
  assert.match(markdown, /NOT validated/);
  assert.match(markdown, /Harness-owned evidence/);
  assert.match(markdown, /&lt;script&gt;/);
  assert.ok(!markdown.includes("<script>"));
  assert.ok(!markdown.includes("[untrusted link](https://example.com)"));
  assert.match(markdown, /1.1230872307606727/);
  assert.match(
    markdown,
    /\| 9 \| 3 \/ 4 \| 1.123087 \| 0.269515 \| J21 \| condition:9 \|/,
  );
  assert.match(markdown, /Attribution:/);
  const altered = structuredClone(brief);
  altered.packet.evidence["condition:9"] = { mean: 999 };
  assert.throws(
    () => decisionArtifact(altered, artifact.generation),
    /integrity mismatch/,
  );
  assert.throws(() =>
    decisionArtifact(brief, { provider: "", model: "", sessionId: "" }),
  );
});

test("blocked QC and bad CLI inputs retain failure traces without model initialization or campaign access", () => {
  assert.throws(
    () => createDecisionRun({ ...request, scenario: "control-failure" }),
    /QC blocked/,
  );
  assert.throws(() =>
    prepareDecisionPacket({ ...request, strategy: "execute" }),
  );
  assert.throws(() =>
    prepareDecisionPacket({ ...request, source: "https://example.com" }),
  );
  const root = fileURLToPath(new URL("..", import.meta.url));
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "cfps-brief-cli-"));
  const fixture = new URL(
    "../fixtures/ginkgo-cfps/example_plate_return.json",
    import.meta.url,
  );
  const bytes = readFileSync(fixture);
  try {
    for (const args of [
      ["--scenario", "control-failure"],
      ["--strategy", "execute"],
    ]) {
      const state = join(dir, "must-not-exist");
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          cli,
          "cfps-brief",
          request.question,
          ...args,
          "--model",
          "nonexistent/no-credentials",
          "--dir",
          state,
          "--json",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.ok(!result.stderr.includes("Model is not in"));
      if (args.includes("control-failure"))
        assert.match(result.stderr, /QC blocked/);
      assert.equal(existsSync(join(state, "campaigns.sqlite")), false);
      assert.equal(existsSync(join(state, "exports")), false);
      const traces = readdirSync(join(state, "traces")).filter((f) =>
        f.endsWith(".trace.json"),
      );
      const records = traces.map((f) =>
        JSON.parse(readFileSync(join(state, "traces", f), "utf8")),
      );
      assert.ok(
        records.every(
          (r) =>
            r.status === "failed" && r.model === null && r.artifact === null,
        ),
      );
    }
    assert.deepEqual(readFileSync(fixture), bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
