import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decisionFixture } from "../test/helpers/decision-fixture.js";
import { readScientificReview } from "../src/scientific-review.js";

export function testTrace() {
  const body = {
    format: "bio-harness.decision-trace.v1",
    runId: "offline-browser-test",
    startedAt: "2026-09-18T00:00:00Z",
    status: "failed",
    request: {
      question: '<img src=x onerror="window.injected=true">',
      scenario: "control-failure",
      strategy: "confirm",
    },
    model: null,
    artifact: null,
    elapsedMs: 10,
    cost: "No model initialized in this synthetic test record",
    events: [
      {
        sequence: 1,
        span: 1,
        at: "2026-09-18T00:00:00Z",
        phase: "policy-check",
        state: "rejected",
        elapsedMs: 10,
        payload: { error: "QC blocked: no decision brief may be generated" },
      },
    ],
  };
  return {
    ...body,
    traceHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}
for (const width of [1440, 390]) {
  test(`evidence layers and separately bound human review work at ${width}px`, async ({
    page,
  }) => {
    const artifact = decisionFixture();
    const { traceHash: _, ...body } = testTrace();
    const recordBody = {
      ...body,
      status: "completed",
      request: artifact.brief.packet.request,
      model: { ...artifact.generation },
      artifact,
    };
    const record = {
      ...recordBody,
      traceHash: createHash("sha256")
        .update(JSON.stringify(recordBody))
        .digest("hex"),
    };
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/trace");
    await page.getByLabel("Decision trace JSON").setInputFiles({
      name: "authored-test.trace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(record)),
    });
    await expect(page.locator("#artifact-status")).toContainText(
      "NOT semantically validated",
    );
    await page
      .getByRole("navigation", { name: "Run sections" })
      .getByRole("link", { name: "Timeline", exact: true })
      .click();
    await expect(page.locator("#timeline-title")).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.getElementById("timeline-title")!.getBoundingClientRect()
            .top >=
          document.querySelector(".trace-nav")!.getBoundingClientRect().bottom,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Inspect well:J21", exact: true })
      .first()
      .click();
    await expect(page.locator("#cited-evidence")).toContainText(
      "Published observation",
    );
    await expect(page.locator("#cited-evidence")).toContainText(
      "Harness calculation",
    );
    await expect(page.locator("#cited-evidence")).toBeFocused();
    await page
      .getByLabel("Review verdict for assessment:0", { exact: true })
      .selectOption("unclear");
    await page
      .getByLabel("Review rationale for assessment:0", { exact: true })
      .fill("Offline test note; requires scientific review.");
    await page
      .getByLabel("Reviewer name")
      .fill("Test reviewer (not a scientist attestation)");
    await page
      .getByLabel("Unresolved concerns")
      .fill("Independence remains unresolved.");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download review notes" }).click();
    const download = await downloading;
    const bytes = readFileSync((await download.path())!);
    const review = readScientificReview(JSON.parse(bytes.toString()), artifact);
    expect(review.statements[0]!.verdict).toBe("unclear");
    await page.getByLabel("Reopen review notes").setInputFiles({
      name: "review.json",
      mimeType: "application/json",
      buffer: bytes,
    });
    await expect(page.locator("#human-status")).toContainText(
      "1/3 statements reviewed",
    );
    await expect(page.locator("#human-status")).toContainText("No approval");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const { reviewHash: __, ...reviewBody } = JSON.parse(bytes.toString());
    reviewBody.artifactHash = "0".repeat(64);
    const wrong = {
      ...reviewBody,
      reviewHash: createHash("sha256")
        .update(JSON.stringify(reviewBody))
        .digest("hex"),
    };
    await page.getByLabel("Reopen review notes").setInputFiles({
      name: "wrong.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(wrong)),
    });
    await expect(page.locator("#human-status")).toContainText(
      "another artifact",
    );
  });
  test(`local trace is readable, safe, accessible and not uploaded at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/trace");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.getByLabel("Decision trace JSON").setInputFiles({
      name: "synthetic.trace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(testTrace())),
    });
    await expect(page.locator("#trace-status")).toContainText("hash matches");
    await expect(page.locator("#run-facts")).toContainText("Not initialized");
    await expect(page.locator("#timeline")).toContainText("rejected");
    await page.getByText("Inspect output / error", { exact: true }).click();
    await expect(page.locator("#timeline pre")).toContainText("QC blocked");
    expect(await page.locator("#run-facts img").count()).toBe(0);
    expect(requests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const bad = testTrace();
    bad.status = "completed";
    await page.getByLabel("Decision trace JSON").setInputFiles({
      name: "edited.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(page.locator("#trace-status")).toContainText("hash mismatch");
    await expect(page.locator("#trace-content")).toBeHidden();
  });
}
