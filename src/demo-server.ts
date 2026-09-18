import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  decisionBrief,
  loadReplay,
  replayMarkdown,
  type Scenario,
  type Strategy,
} from "./replay.js";
import { Store } from "./store.js";
import { Harness } from "./harness.js";
import { examplePlan } from "./contracts.js";
import { authorityProfile } from "./authority.js";

export function approvalGateProof() {
  const store = new Store(":memory:");
  try {
    const h = new Harness(store);
    const campaign = h.create(
      {
        title: "Isolated approval demonstration",
        objective: "Verify exact-plan approval with synthetic data only",
        simulationBudgetCents: 10000,
      },
      "demo",
    );
    const original = h.propose(campaign.id, examplePlan());
    h.validate(campaign.id, original.id);
    const blocked = (draftId: string) => {
      try {
        h.execute(campaign.id, draftId);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("operator approval")
        )
          return error.message;
        throw error;
      }
      throw new Error("Approval gate unexpectedly permitted execution");
    };
    const unapproved = blocked(original.id);
    h.approve(campaign.id, original.id, original.hash, "demo-simulation-only");
    const run = h.execute(campaign.id, original.id);
    const revised = h.propose(campaign.id, {
      ...original.plan,
      title: "Revised simulation plan",
    });
    h.validate(campaign.id, revised.id);
    const revisionBlocked = blocked(revised.id);
    const after = h.inspect(campaign.id);
    return {
      mode: "isolated synthetic self-test; not an approval of the CFPS replay",
      originalHash: original.hash,
      revisedHash: revised.hash,
      checks: [
        {
          label: "Unapproved execution rejected",
          passed: true,
          detail: unapproved,
        },
        {
          label: "Explicit demo approval permits one synthetic run",
          passed: run.status === "completed",
          detail:
            "Approved by demo-simulation-only in an isolated in-memory workspace.",
        },
        {
          label: "Revised plan does not inherit approval",
          passed: true,
          detail: revisionBlocked,
        },
      ],
      completedRuns: after.runs.length,
      audit: store.verify(campaign.id),
      notice:
        "No persistent workspace was touched; no physical operation occurred. The local --by field is attribution, not authentication.",
    };
  } finally {
    store.close();
  }
}

export async function startDemoServer(
  port = 4310,
): Promise<{ server: Server; url: string }> {
  // Verify and parse the vendored bytes before listening. No network or model calls.
  const reports = {
    original: loadReplay(),
    "control-failure": loadReplay("control-failure"),
  };
  const staticFiles: Record<string, { file: string; mime: string }> = {
    "/": { file: "index.html", mime: "text/html; charset=utf-8" },
    "/app.js": { file: "app.js", mime: "text/javascript; charset=utf-8" },
    "/trace": { file: "trace.html", mime: "text/html; charset=utf-8" },
    "/trace.js": { file: "trace.js", mime: "text/javascript; charset=utf-8" },
    "/trace.css": { file: "trace.css", mime: "text/css; charset=utf-8" },
    "/review.js": { file: "review.js", mime: "text/javascript; charset=utf-8" },
    "/authority.js": {
      file: "authority.js",
      mime: "text/javascript; charset=utf-8",
    },
    "/icon.svg": { file: "icon.svg", mime: "image/svg+xml" },
    "/styles.css": { file: "styles.css", mime: "text/css; charset=utf-8" },
  };
  let origin = "";
  const server = createServer((request, response) => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(value));
    };
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      json(403, { error: "Loopback, same-origin access only" });
      return;
    }
    if (request.method !== "GET") {
      json(405, { error: "Read-only demo; only GET is supported" });
      return;
    }
    try {
      const url = new URL(request.url ?? "/", origin);
      const file = Object.hasOwn(staticFiles, url.pathname)
        ? staticFiles[url.pathname]
        : undefined;
      if (file) {
        const bytes = readFileSync(
          new URL(`../web/${file.file}`, import.meta.url),
        );
        response.writeHead(200, { "Content-Type": file.mime });
        response.end(bytes);
        return;
      }
      const scenario = url.searchParams.get("scenario") ?? "original";
      if (!["original", "control-failure"].includes(scenario)) {
        json(400, { error: "Unknown scenario" });
        return;
      }
      const replay = reports[scenario as Scenario];
      if (url.pathname === "/api/replay") {
        json(200, replay);
        return;
      }
      if (url.pathname === "/api/authority") {
        json(200, {
          kind: "static permission profiles, not active sessions or approvals",
          profiles: [
            authorityProfile("cfps-decision"),
            authorityProfile("campaign"),
          ],
        });
        return;
      }
      if (url.pathname === "/api/gates") {
        json(200, approvalGateProof());
        return;
      }
      if (url.pathname === "/api/brief") {
        const strategy = url.searchParams.get("strategy") ?? "confirm";
        if (!["confirm", "explore"].includes(strategy)) {
          json(400, { error: "Unknown strategy" });
          return;
        }
        if (replay.qc.status === "blocked") {
          json(409, {
            error: "QC blocked: no follow-up brief may be generated",
          });
          return;
        }
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="cfps-${strategy}-review.json"`,
        );
        json(200, decisionBrief(replay, strategy as Strategy));
        return;
      }
      if (url.pathname === "/api/report") {
        response.writeHead(200, {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="cfps-${scenario}-evidence.md"`,
        });
        response.end(replayMarkdown(replay));
        return;
      }
      json(404, { error: "Not found" });
    } catch {
      json(500, {
        error:
          "Demo request failed. Check the pinned fixture and restart the local server.",
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("No loopback address"));
        return;
      }
      origin = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
  return { server, url: origin };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.BIO_DEMO_PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("BIO_DEMO_PORT must be an integer from 0 to 65535");
  startDemoServer(port)
    .then(({ server, url }) => {
      console.log(
        `\nBio Harness · evidence workbench\n${url}\n\nOffline public-data replay. No model calls, orders, or private workspace access.\nCtrl+C to stop.\n`,
      );
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
          server.close();
          server.closeAllConnections();
        });
    })
    .catch((error) => {
      console.error(`Demo server: ${error.message}`);
      process.exitCode = 1;
    });
}
