import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { biologyTools } from "../src/agent.js";
import { Harness, Store, examplePlan } from "../src/index.js";

test("actual Pi tools expose domain operations but not operator authority or arbitrary execution", async () => {
  const store = new Store(":memory:");
  try {
    const harness = new Harness(store);
    const tools = biologyTools(harness);
    const names = tools.map((t) => t.name);
    assert.deepEqual(names, [
      "bio_capabilities",
      "bio_cfps_plate",
      "bio_cfps_condition",
      "bio_cfps_well",
      "bio_campaigns",
      "bio_create",
      "bio_inspect",
      "bio_propose",
      "bio_validate",
      "bio_execute_approved",
      "bio_analyze",
      "bio_next",
    ]);
    assert.ok(names.includes("bio_propose"));
    assert.ok(names.includes("bio_execute_approved"));
    for (const forbidden of [
      "bash",
      "read",
      "write",
      "edit",
      "bio_approve",
      "bio_import",
    ])
      assert.ok(!names.includes(forbidden));
    const tool = tools.find((t) => t.name === "bio_capabilities")!;
    const result = await tool.execute(
      "capabilities-test",
      {} as never,
      new AbortController().signal,
      undefined,
      {} as ExtensionContext,
    );
    assert.match(JSON.stringify(result), /ginkgo-handoff/);
    assert.match(JSON.stringify(result), /bio_cfps_plate/);
    const campaign = harness.create({
      title: "Agent test",
      objective: "Approval is separate",
      simulationBudgetCents: 10000,
    });
    const draft = harness.propose(campaign.id, examplePlan(), "agent");
    harness.validate(campaign.id, draft.id, "agent");
    const runTool = tools.find((t) => t.name === "bio_execute_approved")!;
    await assert.rejects(
      runTool.execute(
        "execution-test",
        { campaignId: campaign.id, draftId: draft.id } as never,
        new AbortController().signal,
        undefined,
        {} as ExtensionContext,
      ),
      /operator approval/,
    );
    assert.equal(harness.inspect(campaign.id).runs.length, 0);
  } finally {
    store.close();
  }
});
