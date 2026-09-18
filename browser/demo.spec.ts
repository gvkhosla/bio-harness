import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { readFileSync } from "node:fs";

test("evidence selection, provenance, downloads, gate proof and QC recovery work end to end", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#screen-state")).toHaveText(
    "Reviewable · local screen",
  );
  await expect(page.getByLabel("Authority and scenario")).toContainText(
    "offline public replay",
  );
  await page
    .getByText("Compare agent permission profiles", { exact: true })
    .click();
  await expect(page.locator("#authority-profiles")).toContainText(
    "This agent is NOT read-only",
  );
  await page
    .getByText("Compare agent permission profiles", { exact: true })
    .click();
  await expect(page.locator("#plate button")).toHaveCount(384);
  await expect(page.locator("#well-detail")).toContainText("sample 9");
  await page
    .getByRole("button", { name: "Inspect replicate J21", exact: true })
    .click();
  await expect(page.locator("#well-detail")).toContainText(
    "Source flag: lysate",
  );
  await expect(page.locator("#well-detail")).toContainText(
    "Excluded measurement",
  );
  await expect(page.locator("#well-detail")).toContainText(
    "exclude-source-flag",
  );
  await expect(page.locator("#well-detail")).toContainText(
    "Unknown: the physical cause",
  );
  await expect(page.locator("#well-detail")).toContainText("3 of 4 eligible");
  await expect(page.locator("#policy-version")).toContainText(
    "cfps-local-screen v1",
  );
  await page.getByRole("button", { name: "Sample 5", exact: true }).click();
  await expect(page.locator("#well-detail")).toContainText("4 of 4 eligible");
  await page.getByRole("button", { name: "Show all 71 candidates" }).click();
  await expect(page.locator("#ranking-body tr")).toHaveCount(71);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download review brief" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("cfps-confirm-review.json");
  const brief = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(brief.status).toBe("unapproved-review-only");
  expect(brief.evidence[0].sampleId).toBe("9");
  await page
    .getByRole("button", { name: "Prove the approval boundary" })
    .click();
  await expect(page.locator("#gate-result")).toContainText(
    "PASS · Revised plan does not inherit approval",
  );
  await page.getByRole("button", { name: "Inject control failure" }).click();
  await expect(page.locator("#screen-state")).toHaveText("QC blocked");
  await expect(page.locator("#authority-scenario")).toContainText(
    "control-failure",
  );
  await expect(page.locator("#authority-scenario")).toContainText(
    "Does not change an agent",
  );
  await expect(
    page.getByRole("button", { name: "Download review brief" }),
  ).toBeDisabled();
  await expect(page.locator("#ranking-body tr")).toHaveCount(0);
  expect(
    (await page.request.get("/api/brief?scenario=control-failure")).status(),
  ).toBe(409);
  await page
    .getByRole("button", { name: "Published example", exact: true })
    .click();
  await expect(page.locator("#screen-state")).toHaveText(
    "Reviewable · local screen",
  );
  await expect(
    page.getByRole("button", { name: "Download review brief" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`accessible, keyboard-operable and contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator("#workspace")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const selected = page.locator('#plate button[aria-pressed="true"]');
    await selected.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(
      page.locator('#plate button[aria-pressed="true"]'),
    ).toHaveAttribute("data-well", "P05");
    await expect(page.locator('#plate button[data-well="P05"]')).toBeFocused();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.getByRole("button", { name: "Inject control failure" }).click();
    await expect(page.locator("#blocked")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test("loading failures have an actionable recovery path", async ({ page }) => {
  await page.route("**/api/replay*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary test failure" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Temporary test failure");
  await expect(page.locator("#workspace")).toBeHidden();
  await page.unroute("**/api/replay*");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.locator("#workspace")).toBeVisible();
});
