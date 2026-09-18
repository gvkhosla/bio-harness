import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DecisionTrace, traceError } from "../src/decision-trace.js";

test("trace checkpoints preserve incomplete work, rejection, durations and integrity without claiming success", () => {
  const dir = mkdtempSync(join(tmpdir(), "bio-trace-"));
  try {
    const trace = new DecisionTrace(dir, {
      question: "test",
      scenario: "original",
      strategy: "confirm",
    });
    const end = trace.start("tool:submission", { packetHash: "wrong" });
    const incomplete = JSON.parse(readFileSync(trace.path, "utf8"));
    assert.equal(incomplete.status, "running");
    assert.equal(incomplete.events[0].state, "started");
    end({ error: "packet mismatch" }, true);
    assert.throws(() => end({}), /already finished/);
    trace.finish("failed");
    const { traceHash, ...body } = JSON.parse(readFileSync(trace.path, "utf8"));
    assert.equal(
      traceHash,
      createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    );
    assert.equal(body.events[1].state, "rejected");
    assert.ok(body.events[1].elapsedMs >= 0);
    assert.equal(body.artifact, null);
    assert.equal(body.model, null);
    assert.equal(statSync(trace.path).mode & 0o777, 0o600);
    assert.throws(() => trace.start("after-finish"), /finalized/);
    assert.match(
      traceError(new Error("Bearer sample-secret-value")),
      /redacted/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
