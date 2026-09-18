import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { get } from "node:http";
import {
  loadReplay,
  parseReplay,
  decisionBrief,
  replayMarkdown,
} from "../src/replay.js";
import { startDemoServer, approvalGateProof } from "../src/demo-server.js";

const fixture = new URL(
  "../fixtures/ginkgo-cfps/example_plate_return.json",
  import.meta.url,
);
const original = readFileSync(fixture);
const manifest = JSON.parse(
  readFileSync(
    new URL("../fixtures/ginkgo-cfps/manifest.json", import.meta.url),
    "utf8",
  ),
);
function changed(fn: (plate: any) => void) {
  const plate = JSON.parse(original.toString());
  fn(plate);
  const bytes = Buffer.from(JSON.stringify(plate));
  return () =>
    parseReplay(bytes, {
      ...manifest,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
}

test("pinned public replay preserves coordinates, units, provenance, source flags and descriptive statistics", () => {
  const r = loadReplay();
  assert.equal(
    r.source.sha256,
    "a3dd77df4af84fd11cbbfd8a979e432b5fc9df469c84cb081c6e9025fe73f4e2",
  );
  assert.equal(r.wells.length, 384);
  assert.equal(r.conditions.length, 78);
  assert.equal(r.providerRunId, null);
  assert.equal(r.unit, "g/L");
  assert.equal(r.wells.find((w) => w.well === "A05")!.sampleId, "71");
  assert.equal(
    r.wells.find((w) => w.well === "A04")!.sampleId,
    "target_control",
  );
  assert.equal(
    r.wells.find((w) => w.well === "A01")!.concentration,
    3.054427588309031,
  );
  assert.deepEqual(r.wells.find((w) => w.well === "J21")!.sourceFlags, [
    "lysate",
  ]);
  assert.equal(r.qc.sourceFlaggedWells, 35);
  assert.equal(r.qc.excludedConditions, 7);
  assert.equal(r.ranking.length, 71);
  assert.equal(r.ranking[0]!.sampleId, "9");
  assert.deepEqual(r.ranking[0]!.excluded, ["J21"]);
  assert.ok(Math.abs(r.ranking[0]!.mean! - 1.1230872307606727) < 1e-12);
  assert.ok(Math.abs(r.ranking[0]!.sd! - 0.2695149985153569) < 1e-12);
  assert.equal(r.control.n, 16);
  assert.equal(r.qc.status, "reviewable");
  assert.ok(
    !JSON.stringify(r).includes("Main experimental design script"),
    "embedded source code must not enter the projected API",
  );
});

test("replay rejects tampered bytes, unsupported layouts, incomplete maps, and conflicting identities", () => {
  assert.throws(
    () => parseReplay(Buffer.concat([original, Buffer.from(" ")]), manifest),
    /integrity/,
  );
  assert.throws(
    changed((p) => {
      p.array_order = "row";
    }),
  );
  assert.throws(
    changed((p) => {
      delete p.concentration_results.concentration_g_L.A01;
    }),
    /coordinates/,
  );
  assert.throws(
    changed((p) => {
      p.reagent_flags.flags.Z99 = ["unknown"];
    }),
    /Unknown flagged/,
  );
  assert.throws(
    changed((p) => {
      p.samples[64].reagent_list = { conflicting: 1 };
    }),
    /Conflicting formulations/,
  );
  assert.throws(
    changed((p) => {
      p.samples[64].sample_id = "";
    }),
    /identity/,
  );
});

test("missing measurements are excluded without fabricated numeric placeholders", () => {
  const r = changed((p) => {
    p.concentration_results.concentration_g_L.P06 = null;
  })();
  assert.equal(r.wells.find((w) => w.well === "P06")!.eligible, false);
  assert.equal(r.conditions.find((c) => c.sampleId === "9")!.n, 2);
  assert.ok(!r.ranking.some((c) => c.sampleId === "9"));
});

test("injected control failure blocks ranking and all briefs without mutating source evidence", () => {
  const baseline = loadReplay();
  const failed = loadReplay("control-failure");
  assert.equal(failed.qc.status, "blocked");
  assert.equal(failed.qc.injectedWells, 24);
  assert.equal(failed.control.n, 0);
  assert.equal(failed.ranking.length, 0);
  assert.throws(() => decisionBrief(failed, "confirm"), /QC blocked/);
  assert.throws(() => decisionBrief(failed, "explore"), /QC blocked/);
  assert.equal(failed.source.sha256, baseline.source.sha256);
  assert.deepEqual(
    failed.wells.map((w) => w.sourceFlags),
    baseline.wells.map((w) => w.sourceFlags),
  );
  assert.deepEqual(readFileSync(fixture), original);
  const calibrationFailure = changed((p) => {
    p.standards_metrics.r2 = 0.2;
  })();
  assert.equal(calibrationFailure.qc.status, "blocked");
});

test("review briefs are stable, evidence-linked, unapproved and explicitly non-executable", () => {
  const r = loadReplay();
  const brief = decisionBrief(r, "confirm");
  assert.deepEqual(brief, decisionBrief(loadReplay(), "confirm"));
  assert.equal(brief.evidence.length, 2);
  assert.equal(decisionBrief(r, "explore").evidence.length, 5);
  assert.notEqual(brief.briefHash, decisionBrief(r, "explore").briefHash);
  assert.equal(brief.status, "unapproved-review-only");
  assert.equal(brief.providerAcceptance, false);
  assert.equal(brief.estimate, null);
  assert.match(brief.execution, /No order sent/);
  assert.match(replayMarkdown(r), /1.1231/);
  assert.match(
    replayMarkdown(loadReplay("control-failure")),
    /control-failure/,
  );
});

test("approval proof exercises real Harness gates in an isolated synthetic workspace", () => {
  const proof = approvalGateProof();
  assert.equal(proof.completedRuns, 1);
  assert.ok(proof.checks.every((c) => c.passed));
  assert.notEqual(proof.originalHash, proof.revisedHash);
  assert.equal(proof.audit.valid, true);
});

test("local server is read-only, serves allowlisted assets, and enforces QC at the API boundary", async () => {
  const { server, url } = await startDemoServer(0);
  try {
    const response = await fetch(`${url}/api/replay`);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-security-policy")!,
      /frame-ancestors 'none'/,
    );
    assert.equal((await response.json()).ranking[0].sampleId, "9");
    assert.equal(
      (await fetch(`${url}/api/brief?scenario=control-failure`)).status,
      409,
    );
    assert.equal(
      (await fetch(`${url}/api/brief?strategy=unknown`)).status,
      400,
    );
    assert.equal(
      (await fetch(`${url}/api/replay?scenario=unknown`)).status,
      400,
    );
    assert.equal(
      (await fetch(`${url}/api/replay`, { method: "POST" })).status,
      405,
    );
    assert.equal(
      (
        await fetch(`${url}/api/replay`, {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    // fetch/Undici normalizes Host; send a raw HTTP request to test rebinding.
    const hostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(
          `${url}/api/replay`,
          { headers: { Host: "evil.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).on("error", reject);
      },
    );
    assert.equal(hostStatus, 403);
    assert.equal(
      (
        await fetch(`${url}/api/replay`, {
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${url}/.bio/campaigns.sqlite`)).status, 404);
    assert.equal((await fetch(`${url}/package.json`)).status, 404);
    const download = await fetch(`${url}/api/brief?strategy=confirm`);
    assert.match(download.headers.get("content-disposition")!, /attachment/);
    assert.equal((await download.json()).status, "unapproved-review-only");
    assert.match(await (await fetch(url)).text(), /Bio Harness/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
