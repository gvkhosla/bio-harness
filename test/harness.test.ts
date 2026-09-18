import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  Harness,
  Store,
  examplePlan,
  hash,
  layout,
  planSchema,
  type Results,
} from "../src/index.js";
import { campaignReport } from "../src/report.js";

function fixture(budget = 10000) {
  const store = new Store(":memory:");
  const harness = new Harness(store);
  const campaign = harness.create({
    title: "Test",
    objective: "A bounded campaign",
    simulationBudgetCents: budget,
  });
  return { store, harness, id: campaign.id };
}
function approved(
  h: Harness,
  id: string,
  backend: "simulator" | "ginkgo-handoff" = "simulator",
) {
  const draft = h.propose(id, examplePlan(backend));
  assert.equal(h.validate(id, draft.id).valid, true);
  h.approve(id, draft.id, draft.hash, "scientist");
  return draft;
}
function external(h: Harness, id: string): Results {
  const run = h.execute(id, approved(h, id, "ginkgo-handoff").id);
  return {
    schemaVersion: 1,
    runId: run.id,
    planHash: run.planHash,
    source: "external",
    providerRunId: "operator-supplied-run",
    measuredAt: new Date().toISOString(),
    unit: "a.u.",
    notes: "Test fixture, not real provider evidence",
    observations: run.wells.map((w) => ({
      well: w.well,
      conditionId: w.conditionId,
      value:
        w.conditionId === "vehicle"
          ? 10
          : w.conditionId === "reference"
            ? 90
            : 50,
      qc: "pass",
    })),
  };
}

test("complete experiment loop gates execution, persists evidence, and requires fresh approval", () => {
  const { store, harness: h, id } = fixture();
  try {
    const draft = h.propose(id, examplePlan());
    assert.throws(() => h.execute(id, draft.id), /operator approval/);
    assert.throws(
      () => h.approve(id, draft.id, draft.hash, "operator"),
      /Validate/,
    );
    assert.equal(h.validate(id, draft.id).valid, true);
    assert.throws(
      () => h.approve(id, draft.id, "0".repeat(64), "operator"),
      /hash mismatch/,
    );
    h.approve(id, draft.id, draft.hash, "operator");
    const run = h.execute(id, draft.id);
    const repeated = h.execute(id, draft.id);
    assert.equal(repeated.id, run.id);
    assert.equal(h.inspect(id).simulationSpentCents, 4000);
    assert.equal(h.inspect(id).runs.length, 1);
    const analysis = h.analyze(id, run.id);
    assert.equal(analysis.source, "simulation");
    assert.equal(analysis.qc, "pass");
    assert.equal(analysis.ranking[0]?.conditionId, "mid");
    const next = h.next(id, run.id);
    assert.equal(next.status, "draft");
    assert.equal(next.approval, undefined);
    assert.throws(() => h.execute(id, next.id), /operator approval/);
    assert.match(campaignReport(h, id), /SIMULATION/);
    assert.equal(store.verify(id).valid, true);
  } finally {
    store.close();
  }
});

test("contract validates finite values, strict fields, controls, capacity, and duplicate identities", () => {
  const { store, harness: h, id } = fixture();
  try {
    assert.throws(() => h.propose(id, { ...examplePlan(), extra: "execute" }));
    const nan = examplePlan();
    nan.conditions[2]!.level = Number.NaN;
    assert.throws(() => h.propose(id, nan));
    const duplicate = examplePlan();
    duplicate.conditions[2]!.id = "vehicle";
    assert.match(
      h.validate(id, h.propose(id, duplicate).id).errors.join(),
      /unique/,
    );
    const noControl = examplePlan();
    noControl.conditions[0]!.role = "test";
    assert.match(
      h.validate(id, h.propose(id, noControl).id).errors.join(),
      /negative_control/,
    );
    const big = examplePlan();
    big.replicates = 12;
    big.conditions.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `extra_${i}`,
        label: "extra",
        role: "test" as const,
        level: 0.4,
      })),
    );
    assert.match(
      h.validate(id, h.propose(id, big).id).errors.join(),
      /96-well/,
    );
    assert.throws(() => layout(big), /96-well/);
    const plan = planSchema.parse(examplePlan());
    assert.equal(new Set(layout(plan).map((w) => w.well)).size, 20);
    assert.deepEqual(layout(plan), layout(plan));
    assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  } finally {
    store.close();
  }
});

test("budget is checked again at execution, including competing approvals", () => {
  const { store, harness: h, id } = fixture(4000);
  try {
    const a = approved(h, id);
    const b = approved(h, id);
    h.execute(id, a.id);
    assert.throws(() => h.execute(id, b.id), /budget exceeded/);
    assert.equal(h.inspect(id).runs.length, 1);
    assert.equal(h.inspect(id).simulationSpentCents, 4000);
    const draft = h.propose(id, examplePlan());
    assert.equal(h.validate(id, draft.id).valid, false);
    assert.equal(store.verify(id).valid, true);
  } finally {
    store.close();
  }
});

test("Ginkgo handoff is unsent, has unknown price, and cannot be analyzed before import", () => {
  const { store, harness: h, id } = fixture(0);
  try {
    const draft = approved(h, id, "ginkgo-handoff");
    const run = h.execute(id, draft.id);
    assert.equal(run.status, "awaiting_external_results");
    assert.equal(run.costCents, null);
    assert.equal(h.inspect(id).simulationSpentCents, 0);
    const bundle = h.exportHandoff(id, run.id);
    assert.match(bundle.notice, /No request has been sent/);
    assert.equal(bundle.approval?.scope, "handoff-only");
    assert.equal(bundle.planHash, draft.hash);
    assert.throws(() => h.analyze(id, run.id), /Completed results/);
    assert.equal(bundle.proposedWellMap.length, 20);
  } finally {
    store.close();
  }
});

test("external results enforce plan, sample identity, completeness, immutability and provenance", () => {
  const { store, harness: h, id } = fixture();
  try {
    const result = external(h, id);
    assert.throws(
      () =>
        h.importResults(id, { ...result, source: "simulation" }, "operator"),
      /Only external/,
    );
    assert.throws(
      () =>
        h.importResults(
          id,
          { ...result, planHash: "0".repeat(64) },
          "operator",
        ),
      /hash/,
    );
    assert.throws(
      () =>
        h.importResults(
          id,
          { ...result, observations: result.observations.slice(1) },
          "operator",
        ),
      /Incomplete/,
    );
    const dup = structuredClone(result);
    dup.observations[1] = dup.observations[0]!;
    assert.throws(() => h.importResults(id, dup, "operator"), /duplicate/);
    const wrong = structuredClone(result);
    wrong.observations[0]!.conditionId = "wrong";
    assert.throws(() => h.importResults(id, wrong, "operator"), /mismatched/);
    const run = h.importResults(id, result, "operator");
    assert.equal(run.importedBy, "operator");
    assert.equal(run.status, "completed");
    assert.equal(h.importResults(id, result, "operator").id, run.id);
    const changed = structuredClone(result);
    changed.observations[0]!.value++;
    assert.throws(() => h.importResults(id, changed, "operator"), /immutable/);
    assert.equal(h.analyze(id, run.id).source, "external");
    assert.throws(() => h.next(id, run.id), /simulation-only/);
  } finally {
    store.close();
  }
});

test("QC failure produces inconclusive analysis and no follow-up", () => {
  const { store, harness: h, id } = fixture();
  try {
    const result = external(h, id);
    for (const row of result.observations)
      if (row.conditionId === "reference") row.qc = "fail";
    h.importResults(id, result, "operator");
    const analysis = h.analyze(id, result.runId);
    assert.equal(analysis.qc, "fail");
    assert.deepEqual(analysis.ranking, []);
    assert.match(analysis.conclusion, /Inconclusive/);
    assert.throws(() => h.next(id, result.runId), /QC failed/);
  } finally {
    store.close();
  }
});

test("cancellation revokes approval, prevents imports, and cannot undo completed work", () => {
  const { store, harness: h, id } = fixture();
  try {
    const draft = approved(h, id);
    h.cancel(id, draft.id, "operator");
    assert.throws(() => h.execute(id, draft.id), /operator approval/);
    const results = external(h, id);
    const run = h.inspect(id).runs.find((r) => r.id === results.runId)!;
    h.cancel(id, run.draftId, "operator");
    assert.throws(
      () => h.importResults(id, results, "operator"),
      /not awaiting/,
    );
    const completed = approved(h, id);
    h.execute(id, completed.id);
    assert.throws(
      () => h.cancel(id, completed.id, "operator"),
      /cannot be cancelled/,
    );
  } finally {
    store.close();
  }
});

test("campaigns survive reopening and detect snapshot tampering", () => {
  const dir = mkdtempSync(join(tmpdir(), "bio-store-"));
  const path = join(dir, "state.sqlite");
  let store: Store | undefined;
  try {
    store = new Store(path);
    const h = new Harness(store);
    const c = h.create({
      title: "Durable",
      objective: "Persist a completed run",
      simulationBudgetCents: 4000,
    });
    const run = h.execute(c.id, approved(h, c.id).id);
    store.close();
    store = new Store(path);
    const restored = new Harness(store);
    assert.equal(restored.inspect(c.id).runs[0]?.id, run.id);
    assert.equal(restored.analyze(c.id, run.id).qc, "pass");
    const db = new DatabaseSync(path);
    try {
      assert.throws(() => db.exec("DELETE FROM events"), /append-only/);
      const changed = store.get(c.id);
      changed.simulationSpentCents = 0;
      db.prepare("UPDATE campaigns SET body = ? WHERE id = ?").run(
        JSON.stringify(changed),
        c.id,
      );
    } finally {
      db.close();
    }
    assert.throws(() => restored.inspect(c.id), /integrity failure/);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent processes start safely and cannot duplicate a run or debit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bio-concurrent-"));
  const path = join(dir, "campaigns.sqlite");
  const cli = new URL("../src/cli.ts", import.meta.url).pathname;
  const invoke = (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", cli, ...args, "--dir", dir],
        { cwd: new URL("..", import.meta.url).pathname },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(stderr)),
      );
    });
  try {
    const created = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        invoke(["new", `Parallel ${i}`, "Check concurrent startup"]),
      ),
    );
    const id = JSON.parse(created[0]!).id as string;
    const store = new Store(path);
    let draftId: string;
    try {
      draftId = approved(new Harness(store), id).id;
    } finally {
      store.close();
    }
    const outputs = await Promise.all(
      Array.from({ length: 4 }, () => invoke(["run", id, draftId])),
    );
    assert.equal(
      new Set(outputs.map((output) => JSON.parse(output).id)).size,
      1,
    );
    const reopened = new Store(path);
    try {
      assert.equal(reopened.list().length, 4);
      assert.equal(reopened.get(id).runs.length, 1);
      assert.equal(reopened.get(id).simulationSpentCents, 4000);
      assert.equal(reopened.verify(id).valid, true);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI runs offline demo and reopens its campaign from another process", () => {
  const dir = mkdtempSync(join(tmpdir(), "bio-cli-"));
  try {
    const cli = new URL("../src/cli.ts", import.meta.url).pathname;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cli, "demo", "--dir", dir, "--json"],
      { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname },
    );
    assert.equal(result.status, 0, result.stderr);
    const demo = JSON.parse(result.stdout);
    assert.equal(demo.runs.length, 2);
    assert.equal(demo.nextDraftStatus, "draft");
    assert.equal(demo.simulationSpentCents, 8000);
    const show = spawnSync(
      process.execPath,
      ["--import", "tsx", cli, "show", demo.campaignId, "--dir", dir],
      { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname },
    );
    assert.equal(show.status, 0, show.stderr);
    assert.equal(JSON.parse(show.stdout).runs.length, 2);
    const invalid = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        cli,
        "approve",
        demo.campaignId,
        demo.nextDraftId,
        "--dir",
        dir,
      ],
      { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname },
    );
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Missing --hash/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
