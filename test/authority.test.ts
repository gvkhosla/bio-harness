import { test } from "node:test";
import assert from "node:assert/strict";
import { authorityProfile } from "../src/authority.js";
import { createDecisionRun } from "../src/cfps-decision-agent.js";
import { biologyTools, createScopedSession } from "../src/agent.js";
import { Store } from "../src/store.js";
import { Harness } from "../src/harness.js";

test("permission profiles match actual tools and reject permission drift before model setup", async () => {
  const decision = createDecisionRun({
    question: "Offline authority test",
    scenario: "original",
    strategy: "confirm",
  });
  assert.equal(
    authorityProfile(
      "cfps-decision",
      decision.tools.map((t) => t.name),
    ).tools.length,
    2,
  );
  const store = new Store(":memory:");
  try {
    const tools = biologyTools(new Harness(store));
    assert.equal(
      authorityProfile(
        "campaign",
        tools.map((t) => t.name),
      ).tools.length,
      12,
    );
    assert.throws(
      () =>
        authorityProfile(
          "cfps-decision",
          tools.map((t) => t.name),
        ),
      /does not match/,
    );
    await assert.rejects(
      createScopedSession(
        tools,
        "test",
        "not-created",
        "nonexistent/model",
        "cfps-decision",
      ),
      /authority profile/,
    );
    assert.match(authorityProfile("campaign").runnerWrites, /NOT read-only/);
    assert.match(authorityProfile("campaign").approval, /outside/);
    assert.match(
      authorityProfile("cfps-decision").approval,
      /never grants approval/,
    );
    assert.throws(
      () =>
        authorityProfile("campaign", [
          ...tools.map((t) => t.name),
          "bio_approve",
        ]),
      /does not match/,
    );
  } finally {
    store.close();
  }
});
