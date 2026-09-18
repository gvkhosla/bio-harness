#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Store } from "./store.js";
import { Harness } from "./harness.js";
import { capabilities, examplePlan } from "./contracts.js";
import { campaignReport } from "./report.js";

const help = `BIO HARNESS · v0.2
Pi-powered scientific campaigns. No live instrument control or paid lab ordering.

  bio demo                                  Run two synthetic batches + follow-up
  bio capabilities                          Show supported adapters and limits
  bio new "Title" "Research question"        Create a campaign (--budget cents)
  bio list                                  List campaigns
  bio show CAMPAIGN                          Inspect complete campaign state
  bio example                               Print a plan (--backend simulator|ginkgo-handoff)
  bio propose CAMPAIGN --file plan.json      Create an immutable draft
  bio validate CAMPAIGN DRAFT                Validate controls, plate, budget
  bio approve CAMPAIGN DRAFT --hash HASH --by NAME
  bio run CAMPAIGN DRAFT                     Execute simulation or prepare local handoff
  bio export CAMPAIGN RUN                    Write an approved Ginkgo request bundle
  bio import CAMPAIGN --file results.json --by NAME
  bio analyze CAMPAIGN RUN                   QC and descriptive analysis
  bio next CAMPAIGN RUN                      Propose unapproved simulator follow-up
  bio cancel CAMPAIGN DRAFT --by NAME        Cancel locally (no provider cancellation)
  bio report CAMPAIGN                        Write a Markdown campaign report
  bio audit CAMPAIGN                         Verify hash-linked event history
  bio agent "Research request"               Pi agent, or interactive when no request
  bio cfps-brief "Decision question"          Restricted Pi decision brief (--scenario original --strategy confirm|explore)
  bio evaluate-cfps                          Offline boundary checks (no model)
  bio evaluate-cfps --file ARTIFACT --review REVIEW  Grade references + self-attested review
  bio evaluate-cfps --live --case CASE_ID     Run one proposed evaluation case (model costs)

Options: --dir PATH (default .bio or BIO_HOME), --model provider/id, --json
Agent uses Pi auth or provider API-key environment variables. API calls may cost money.
The offline demo requires no model key, lab credentials, or network.
`;

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Missing ${label}. Run bio --help.`);
  return value;
}
function loadJson(path: string) {
  const raw = readFileSync(resolve(path), "utf8");
  if (raw.length > 2_000_000) throw new Error("Input JSON exceeds 2MB limit");
  return JSON.parse(raw) as unknown;
}
function saveArtifact(stateDir: string, name: string, content: string) {
  const dir = join(stateDir, "exports");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, name);
  writeFileSync(path, content, { mode: 0o600 });
  return path;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: "string" },
      model: { type: "string" },
      file: { type: "string" },
      hash: { type: "string" },
      by: { type: "string" },
      budget: { type: "string", default: "10000" },
      backend: { type: "string", default: "simulator" },
      scenario: { type: "string", default: "original" },
      strategy: { type: "string", default: "confirm" },
      review: { type: "string" },
      case: { type: "string" },
      live: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, first, second] = positionals;
  if (values.help || !command) {
    console.log(help);
    return;
  }
  if (values.live && command !== "evaluate-cfps")
    throw new Error("--live is only supported by evaluate-cfps");
  if (command === "capabilities") {
    console.log(JSON.stringify(capabilities, null, 2));
    return;
  }
  if (command === "example") {
    if (!["simulator", "ginkgo-handoff"].includes(values.backend!))
      throw new Error("Unknown backend");
    console.log(
      JSON.stringify(
        examplePlan(values.backend as "simulator" | "ginkgo-handoff"),
        null,
        2,
      ),
    );
    return;
  }
  const stateDir = resolve(values.dir ?? process.env.BIO_HOME ?? ".bio");
  let evaluation:
    | ReturnType<(typeof import("./cfps-evaluation.js"))["evaluationCase"]>
    | undefined;
  if (command === "evaluate-cfps") {
    const { evaluateCaseBoundaries, evaluateDecisionArtifact, evaluationCase } =
      await import("./cfps-evaluation.js");
    if (positionals.length !== 1)
      throw new Error(
        "Evaluation takes named options, not positional questions",
      );
    if (values.live) {
      if (values.file || values.review)
        throw new Error(
          "--live cannot be combined with artifact/review inputs",
        );
      evaluation = evaluationCase(required(values.case, "--case"));
    } else {
      if (values.review && !values.file)
        throw new Error("--review requires --file ARTIFACT");
      const result = values.file
        ? evaluateDecisionArtifact(
            loadJson(values.file),
            values.review ? loadJson(values.review) : undefined,
            values.case,
          )
        : values.case
          ? evaluationCase(values.case)
          : evaluateCaseBoundaries();
      console.log(JSON.stringify(result, null, 2));
      if ("allBoundariesPassed" in result && !result.allBoundariesPassed)
        process.exitCode = 1;
      return;
    }
  }
  if (command === "cfps-brief" || evaluation) {
    const question =
      evaluation?.request.question ?? required(first, "decision question");
    if (!evaluation && positionals.length !== 2)
      throw new Error("Quote the decision question as a single argument");
    const { generateDecisionBrief } = await import("./cfps-decision-agent.js");
    const { decisionMarkdown } = await import("./cfps-decision.js");
    console.error(
      "CFPS brief: model calls may incur costs; your question and public evidence go to the selected model. No campaign or execution tools.",
    );
    const { DecisionTrace, traceError } = await import("./decision-trace.js");
    const request = evaluation?.request ?? {
      question,
      scenario: values.scenario,
      strategy: values.strategy,
    };
    const trace = new DecisionTrace(stateDir, request);
    console.error(`Run trace: ${trace.path}`);
    try {
      const artifact = await generateDecisionBrief(
        request,
        stateDir,
        values.model,
        trace,
      );
      const exported = trace.start("artifact-export", {
        artifactHash: artifact.artifactHash,
      });
      const name = `cfps-decision-${artifact.artifactHash}`;
      const jsonPath = saveArtifact(
        stateDir,
        `${name}.json`,
        JSON.stringify(artifact, null, 2) + "\n",
      );
      const markdownPath = saveArtifact(
        stateDir,
        `${name}.md`,
        decisionMarkdown(artifact),
      );
      let evaluationPath: string | null = null;
      if (evaluation) {
        const { evaluateDecisionArtifact } = await import(
          "./cfps-evaluation.js"
        );
        evaluationPath = saveArtifact(
          stateDir,
          `${name}.evaluation.json`,
          JSON.stringify(
            evaluateDecisionArtifact(artifact, undefined, evaluation.id),
            null,
            2,
          ) + "\n",
        );
        console.error(
          `Evaluation: ${evaluationPath} · semantic judgment still requires human review`,
        );
      }
      const result = {
        evaluation: evaluationPath,
        trace: trace.path,
        status: artifact.brief.status,
        artifactHash: artifact.artifactHash,
        json: jsonPath,
        markdown: markdownPath,
        generation: artifact.generation,
        validation: artifact.brief.validation,
      };
      exported({
        json: jsonPath,
        markdown: markdownPath,
        evaluation: evaluationPath,
      });
      trace.finish("completed", artifact);
      if (values.json) console.log(JSON.stringify(result, null, 2));
      else
        console.log(
          `\nCFPS decision brief · UNAPPROVED\n${markdownPath}\n${jsonPath}\n\nEvidence references resolved. Model interpretation requires human review. No order sent.\n`,
        );
    } catch (error) {
      const failed = trace.start("run-failure");
      failed({ error: traceError(error) }, true);
      trace.finish("failed");
      if (
        evaluation?.expectedBoundary === "blocked-before-model" &&
        error instanceof Error &&
        error.message.startsWith("QC blocked:")
      ) {
        console.log(
          JSON.stringify(
            {
              caseId: evaluation.id,
              observed: "blocked-before-model",
              trace: trace.path,
              modelCalls: 0,
              scientificJudgmentScore: null,
              notice:
                "Expected harness preflight refusal, not an evaluation of model judgment. No brief exported.",
            },
            null,
            2,
          ),
        );
        return;
      }
      throw error;
    }
    return;
  }
  const store = new Store(join(stateDir, "campaigns.sqlite"));
  const harness = new Harness(store);
  const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
  try {
    switch (command) {
      case "new":
        print(
          harness.create({
            title: required(first, "title"),
            objective: required(second, "objective"),
            simulationBudgetCents: Number(values.budget),
          }),
        );
        break;
      case "list":
        print(harness.list());
        break;
      case "show":
        print(harness.inspect(required(first, "campaign ID")));
        break;
      case "propose":
        print(
          harness.propose(
            required(first, "campaign ID"),
            loadJson(required(values.file, "--file")),
          ),
        );
        break;
      case "validate":
        print(
          harness.validate(
            required(first, "campaign ID"),
            required(second, "draft ID"),
          ),
        );
        break;
      case "approve":
        print(
          harness.approve(
            required(first, "campaign ID"),
            required(second, "draft ID"),
            required(values.hash, "--hash"),
            required(values.by, "--by"),
          ),
        );
        break;
      case "run":
        print(
          harness.execute(
            required(first, "campaign ID"),
            required(second, "draft ID"),
          ),
        );
        break;
      case "export": {
        const cid = required(first, "campaign ID");
        const rid = required(second, "run ID");
        const request = harness.exportHandoff(cid, rid);
        print({
          path: saveArtifact(
            stateDir,
            `${request.runId}.request.json`,
            JSON.stringify(request, null, 2),
          ),
          notice: request.notice,
        });
        break;
      }
      case "import":
        print(
          harness.importResults(
            required(first, "campaign ID"),
            loadJson(required(values.file, "--file")),
            required(values.by, "--by"),
          ),
        );
        break;
      case "analyze":
        print(
          harness.analyze(
            required(first, "campaign ID"),
            required(second, "run ID"),
          ),
        );
        break;
      case "next":
        print(
          harness.next(
            required(first, "campaign ID"),
            required(second, "run ID"),
          ),
        );
        break;
      case "cancel":
        print(
          harness.cancel(
            required(first, "campaign ID"),
            required(second, "draft ID"),
            required(values.by, "--by"),
          ),
        );
        break;
      case "audit": {
        const cid = required(first, "campaign ID");
        print({ integrity: store.verify(cid), events: store.events(cid) });
        break;
      }
      case "report": {
        const campaign = harness.inspect(required(first, "campaign ID"));
        print({
          path: saveArtifact(
            stateDir,
            `${campaign.id}.report.md`,
            campaignReport(harness, campaign.id),
          ),
        });
        break;
      }
      case "demo": {
        const log = (line: string) => {
          if (!values.json) console.log(line);
        };
        log(
          "\nBIO HARNESS / OFFLINE DEMO\nSynthetic data. Fictional costs. No live lab or model calls.\n",
        );
        const campaign = harness.create(
          {
            title: "Cell phenotype · synthetic pilot",
            objective:
              "Exercise a complete two-batch experiment loop with an approval gate and durable evidence.",
            simulationBudgetCents: 10000,
          },
          "demo",
        );
        let draft = harness.propose(campaign.id, examplePlan(), "demo");
        for (let round = 1; round <= 2; round++) {
          const validation = harness.validate(campaign.id, draft.id, "demo");
          log(
            `ROUND ${round}  ${validation.wells} randomized wells · ${(validation.estimatedCostCents! / 100).toFixed(2)} fictional USD`,
          );
          try {
            harness.execute(campaign.id, draft.id, "demo");
            throw new Error("Approval gate did not block execution");
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !error.message.includes("operator approval")
            )
              throw error;
          }
          log("  approval gate: blocked unapproved execution ✓");
          harness.approve(
            campaign.id,
            draft.id,
            draft.hash,
            "demo-simulation-only",
          );
          const run = harness.execute(campaign.id, draft.id, "demo");
          const analysis = harness.analyze(campaign.id, run.id);
          log(
            `  run ${run.id}\n  QC ${analysis.qc.toUpperCase()} · ${analysis.conclusion}`,
          );
          if (round === 1) draft = harness.next(campaign.id, run.id, "demo");
        }
        const state = harness.inspect(campaign.id);
        const pending = harness.next(
          campaign.id,
          state.runs.at(-1)!.id,
          "demo",
        );
        const report = saveArtifact(
          stateDir,
          `${campaign.id}.report.md`,
          campaignReport(harness, campaign.id),
        );
        const result = {
          campaignId: campaign.id,
          runs: state.runs.map((r) => r.id),
          nextDraftId: pending.id,
          nextDraftStatus: pending.status,
          simulationSpentCents: state.simulationSpentCents,
          audit: store.verify(campaign.id),
          report,
          database: join(stateDir, "campaigns.sqlite"),
        };
        if (values.json) print(result);
        else
          log(
            `\nTwo completed batches. Next draft needs NEW approval.\nCampaign: ${campaign.id}\nReport:   ${report}\nDatabase: ${result.database}\nAudit:    ${result.audit.events} verified events\n`,
          );
        break;
      }
      case "agent": {
        // Loaded only for agent mode; all deterministic commands remain offline.
        const { createBiologySession, promptWithLimits } = await import(
          "./agent.js"
        );
        const session = await createBiologySession(
          harness,
          stateDir,
          values.model,
        );
        const rl = createInterface({ input: stdin, output: stdout });
        try {
          console.log(
            `BIO HARNESS · ${session.model?.provider}/${session.model?.id}\nModel calls may incur costs. Campaign data used by tools is sent to this model.\nGeneral campaign agent: can mutate campaigns and run already-approved simulations/unsent handoffs. Existing approvals must be inspected; this message grants none.\nNo shell, approval, import, or live laboratory tools. /quit to leave.\n`,
          );
          const ask = async (message: string) => {
            await promptWithLimits(session, message, (text) =>
              stdout.write(text),
            );
            stdout.write("\n\n");
          };
          if (first) await ask(positionals.slice(1).join(" "));
          else {
            while (true) {
              const message = await rl.question("bio › ");
              if (message.trim() === "/quit") break;
              if (message.trim()) {
                try {
                  await ask(message);
                } catch (error) {
                  console.error(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              }
            }
          }
        } finally {
          rl.close();
          session.dispose();
        }
        break;
      }
      default:
        throw new Error(`Unknown command: ${command}. Run bio --help.`);
    }
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(
    `bio: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
