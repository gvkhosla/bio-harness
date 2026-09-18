import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createHash } from "node:crypto";

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
