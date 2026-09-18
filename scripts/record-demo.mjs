import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { startDemoServer } from "../src/demo-server.ts";

const output = resolve(".bio/demo-walkthrough.webm");
mkdirSync(resolve(".bio"), { recursive: true });
const temporary = mkdtempSync(resolve(".bio/recording-"));
const { server, url } = await startDemoServer(0);
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: temporary, size: { width: 1440, height: 1000 } },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("#workspace").waitFor();
  await page.waitForTimeout(2500);
  await page
    .getByRole("button", { name: "Inspect replicate J21", exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Sample 5", exact: true }).click();
  await page.waitForTimeout(2000);
  await page.locator("#ranking-title").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.locator("#failure").click();
  await page.locator("#blocked").waitFor();
  await page.waitForTimeout(3000);
  await page.locator("#original").click();
  await page.locator("#workspace").waitFor();
  await page.locator("#prove-gates").click();
  await page
    .getByText("PASS · Revised plan does not inherit approval", { exact: true })
    .waitFor();
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);
  const video = page.video();
  await context.close();
  await video.saveAs(output);
  console.log(`Silent demo recording: ${output}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  rmSync(temporary, { recursive: true, force: true });
}
