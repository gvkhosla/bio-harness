import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cfpsPolicy, screenMeasurement } from "../src/cfps-policy.js";
import { hash } from "../src/contracts.js";
import { loadReplay, parseReplay } from "../src/replay.js";

test("versioned rules drive exclusions without imputing measurements or causes", () => {
  const { policyHash, ...body } = cfpsPolicy();
  assert.equal(policyHash, hash(body));
  assert.equal(body.version, 1);
  const replay = loadReplay();
  const j21 = replay.wells.find((w) => w.well === "J21")!;
  assert.equal(j21.screen.reasons[0]!.ruleId, "exclude-source-flag");
  assert.equal(j21.screen.unknownCause, true);
  assert.equal(j21.concentration, 0.6514959746477595);
  const missing = screenMeasurement({
    concentration: null,
    fluorescence: null,
    sourceFlags: [],
    demoFlags: [],
  });
  assert.equal(missing.eligible, false);
  assert.equal(missing.reasons.length, 2);
  assert.ok(
    missing.reasons.every((r) => r.ruleId === "exclude-missing-reading"),
  );
  const failure = loadReplay("control-failure");
  assert.equal(failure.qc.checks[0]!.passed, false);
  assert.equal(failure.qc.checks[0]!.observed, 0);
  assert.equal(
    failure.wells.find((w) => w.well === "A04")!.screen.reasons[0]!.origin,
    "local-demonstration",
  );
  assert.equal(
    replay.qc.policyManifest.policyHash,
    failure.qc.policyManifest.policyHash,
  );
  assert.equal(replay.software.files.length, 6);
  assert.ok(
    replay.software.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256)),
  );
});

test("source-reported calibration threshold is enforced on both sides, with a recorded policy check", () => {
  const base = new URL("../fixtures/ginkgo-cfps/", import.meta.url);
  const source = JSON.parse(
    readFileSync(new URL("example_plate_return.json", base), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", base), "utf8"),
  );
  for (const r2 of [0.97999, 0.98]) {
    const synthetic = structuredClone(source);
    synthetic.standards_metrics.r2 = r2;
    const bytes = Buffer.from(JSON.stringify(synthetic));
    const replay = parseReplay(bytes, {
      ...manifest,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    assert.equal(
      replay.qc.checks[1]!.passed,
      r2 >= cfpsPolicy().minimumCalibrationR2,
    );
    assert.equal(replay.qc.status, r2 < 0.98 ? "blocked" : "reviewable");
  }
});
