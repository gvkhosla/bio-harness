import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { biologyTools } from "../src/agent.js";
import { Harness, Store, examplePlan, loadReplay } from "../src/index.js";

function setup() {
  const store = new Store(":memory:");
  const harness = new Harness(store);
  const tools = biologyTools(harness);
  const invoke = async (name: string, params: unknown) => {
    const tool = tools.find((t) => t.name === name)!;
    assert.ok(tool, `Missing tool ${name}`);
    const result = await tool.execute(
      "evidence-test",
      params as never,
      new AbortController().signal,
      undefined,
      {} as ExtensionContext,
    );
    assert.equal(result.content[0]!.type, "text");
    return JSON.parse((result.content[0] as { text: string }).text);
  };
  return { store, harness, tools, invoke };
}
const fixturePath = new URL(
  "../fixtures/ginkgo-cfps/example_plate_return.json",
  import.meta.url,
);
const manifestPath = new URL(
  "../fixtures/ginkgo-cfps/manifest.json",
  import.meta.url,
);

test("actual Pi evidence tools return bounded plate context and the same statistics as the workbench", async () => {
  const { store, invoke } = setup();
  try {
    const plate = await invoke("bio_cfps_plate", { scenario: "original" });
    const expected = loadReplay();
    assert.equal(plate.counts.wells, 384);
    assert.equal(plate.counts.experimentalConditions, 78);
    assert.equal(plate.counts.rankableConditions, 71);
    assert.equal(plate.shortlistReturned, 10);
    assert.equal(plate.shortlistTruncated, true);
    assert.deepEqual(plate.shortlist, expected.ranking.slice(0, 10));
    assert.deepEqual(plate.qc, expected.qc);
    assert.deepEqual(plate.calibration, expected.calibration);
    assert.equal(plate.providerRunId, null);
    assert.equal(plate.units.concentration, "g/L");
    assert.match(plate.units.fluorescence, /not specified/);
    assert.match(plate.source.integrity, /NOT provider authentication/);
    assert.equal(plate.sampleIds.length, 78);
    assert.equal(
      (await invoke("bio_cfps_plate", { scenario: "original", limit: 1 }))
        .shortlist.length,
      1,
    );
    const largest = await invoke("bio_cfps_plate", {
      scenario: "original",
      limit: 20,
    });
    assert.equal(largest.shortlist.length, 20);
    assert.ok(JSON.stringify(largest, null, 2).length < 20000);
  } finally {
    store.close();
  }
});

test("sample 9 includes all four source-linked replicates and explains the J21 exclusion", async () => {
  const { store, invoke } = setup();
  try {
    const condition = await invoke("bio_cfps_condition", {
      scenario: "original",
      sampleId: "9",
    });
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const atPointer = (pointer: string) =>
      pointer
        .slice(1)
        .split("/")
        .reduce((value, key) => value[key], raw);
    assert.equal(condition.condition.n, 3);
    assert.equal(condition.descriptiveRank, 1);
    assert.equal(condition.observations.length, 4);
    assert.equal(condition.condition.mean, loadReplay().ranking[0]!.mean);
    assert.equal(condition.condition.sd, loadReplay().ranking[0]!.sd);
    assert.deepEqual(condition.condition.excluded, ["J21"]);
    for (const well of condition.observations) {
      assert.equal(atPointer(well.sourcePointers.sample).sample_id, "9");
      assert.equal(
        atPointer(well.sourcePointers.concentration),
        well.concentration,
      );
      assert.equal(
        atPointer(well.sourcePointers.fluorescence),
        well.fluorescence,
      );
      if (well.sourcePointers.flags)
        assert.deepEqual(
          atPointer(well.sourcePointers.flags),
          well.sourceFlags,
        );
    }
    const j21 = await invoke("bio_cfps_well", {
      scenario: "original",
      well: "J21",
    });
    assert.deepEqual(
      j21.observation,
      condition.observations.find((w: { well: string }) => w.well === "J21"),
    );
    assert.deepEqual(j21.observation.sourceFlags, ["lysate"]);
    assert.deepEqual(j21.observation.exclusionReasons, ["Source flag: lysate"]);
    assert.equal(j21.observation.eligible, false);
    assert.equal(j21.source.sha256, condition.source.sha256);
    assert.match(
      j21.source.url,
      /\/blob\/c92353b47a214930f07442aabdb6c3242cc301d0\/examples\/example_plate_return.json$/,
    );
    const standard = await invoke("bio_cfps_well", {
      scenario: "original",
      well: "A01",
    });
    assert.equal(standard.observation.role, "standard");
    assert.equal(standard.observation.concentration, 3.054427588309031);
    const last = await invoke("bio_cfps_well", {
      scenario: "original",
      well: "P24",
    });
    assert.equal(last.observation.sourcePointers.sample, "/samples/383");
  } finally {
    store.close();
  }
});

test("explicit failure views retain observations but withhold ranks and separate injected flags", async () => {
  const { store, invoke } = setup();
  try {
    const failed = await invoke("bio_cfps_plate", {
      scenario: "control-failure",
    });
    assert.equal(failed.qc.status, "blocked");
    assert.deepEqual(failed.shortlist, []);
    assert.equal(failed.shortlistTruncated, false);
    assert.equal(failed.qc.injectedWells, 24);
    const sample = await invoke("bio_cfps_condition", {
      scenario: "control-failure",
      sampleId: "9",
    });
    assert.equal(sample.descriptiveRank, null);
    assert.equal(sample.qc.status, "blocked");
    assert.equal(sample.observations.length, 4);
    const control = await invoke("bio_cfps_well", {
      scenario: "control-failure",
      well: "A04",
    });
    const original = await invoke("bio_cfps_well", {
      scenario: "original",
      well: "A04",
    });
    assert.equal(
      control.observation.concentration,
      original.observation.concentration,
    );
    assert.deepEqual(
      control.observation.sourceFlags,
      original.observation.sourceFlags,
    );
    assert.deepEqual(original.observation.demoFlags, []);
    assert.equal(control.observation.demoFlags.length, 1);
    assert.equal(control.observation.eligible, false);
    assert.equal(original.observation.eligible, true);
    assert.equal(control.source.sha256, original.source.sha256);
    assert.equal(
      (await invoke("bio_cfps_plate", { scenario: "original" })).shortlist
        .length,
      10,
    );
  } finally {
    store.close();
  }
});

test("tool execution rejects malformed identities, unbounded requests and arbitrary input even without SDK validation", async () => {
  const { store, invoke, tools } = setup();
  try {
    for (const params of [
      {},
      { scenario: "live" },
      { scenario: "original", limit: 0 },
      { scenario: "original", limit: 21 },
      { scenario: "original", limit: 1.5 },
      { scenario: "original", limit: "10" },
      { scenario: "original", file: "../../.env" },
      { scenario: "original", url: "https://example.com" },
    ]) {
      await assert.rejects(invoke("bio_cfps_plate", params));
    }
    for (const sampleId of [
      "999",
      "09",
      "../9",
      "target_control",
      "9;execute",
      9,
    ])
      await assert.rejects(
        invoke("bio_cfps_condition", { scenario: "original", sampleId }),
      );
    for (const well of ["A00", "A25", "Q01", "a01", "A1", "../../.env", "J21 "])
      await assert.rejects(
        invoke("bio_cfps_well", { scenario: "original", well }),
      );
    await assert.rejects(
      invoke("bio_cfps_well", {
        scenario: "original",
        well: "J21",
        value: 100,
      }),
    );
    await assert.rejects(
      invoke("bio_cfps_condition", {
        scenario: "original",
        sampleId: "9",
        approve: true,
      }),
    );
    assert.deepEqual(
      tools.filter((t) => t.name.startsWith("bio_cfps_")).map((t) => t.name),
      ["bio_cfps_plate", "bio_cfps_condition", "bio_cfps_well"],
    );
    for (const tool of tools.filter((t) => t.name.startsWith("bio_cfps_")))
      assert.equal(tool.parameters.additionalProperties, false);
  } finally {
    store.close();
  }
});

test("evidence inspection leaves source bytes, campaigns, approvals and audit history untouched; metadata/code stays outside tool outputs", async () => {
  const { store, harness, invoke } = setup();
  try {
    const campaign = harness.create({
      title: "Unrelated campaign",
      objective: "Must not change",
      simulationBudgetCents: 10000,
    });
    const draft = harness.propose(campaign.id, examplePlan());
    harness.validate(campaign.id, draft.id);
    harness.approve(campaign.id, draft.id, draft.hash, "Test operator");
    const before = JSON.stringify({
      state: store.list(),
      events: store.events(campaign.id),
    });
    const bytes = readFileSync(fixturePath);
    const manifest = readFileSync(manifestPath);
    for (const scenario of ["original", "control-failure"]) {
      const outputs = await Promise.all([
        invoke("bio_cfps_plate", { scenario }),
        invoke("bio_cfps_condition", { scenario, sampleId: "9" }),
        invoke("bio_cfps_well", { scenario, well: "J21" }),
      ]);
      for (const output of outputs) {
        const serialized = JSON.stringify(output);
        assert.ok(!serialized.includes('"metadata":'));
        assert.ok(!serialized.includes('"code":'));
        assert.ok(!serialized.includes('"reagent_list":'));
        assert.ok(!serialized.includes("Main experimental design script"));
        assert.match(serialized, /Read-only evidence/);
      }
    }
    assert.equal(
      JSON.stringify({
        state: store.list(),
        events: store.events(campaign.id),
      }),
      before,
    );
    assert.deepEqual(readFileSync(fixturePath), bytes);
    assert.deepEqual(readFileSync(manifestPath), manifest);
    assert.equal(store.verify(campaign.id).valid, true);
  } finally {
    store.close();
  }
});
