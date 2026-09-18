# Bio Harness

**An open-source experiment harness for biology. Built on Pi. Created by [Geet Khosla](https://github.com/gvkhosla).**

[![CI](https://github.com/gvkhosla/bio-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/gvkhosla/bio-harness/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js: 22.19+](https://img.shields.io/badge/Node.js-22.19%2B-43853d.svg)](https://nodejs.org/)

Turn a research question into a reviewable experiment campaign, keep the human in charge of approval, and carry the evidence into the next decision.

```text
Question → Plan → Validate → Approve → Execute / Hand off → Observe → Analyze → Repeat
```

**v0.2 ships a local visual evidence workbench, CLI, and TypeScript SDK.** Run a complete synthetic campaign without API keys, or use a Pi-powered agent to plan and analyze through narrowly scoped tools. Campaign state lives outside the conversation, so approvals, observations, and history survive a new agent session.

> **Early-stage research software—not a production laboratory controller.** The simulator produces synthetic data, not predictions about cells. Ginkgo mode prepares a local manual-handoff request; it does not call Ginkgo APIs or place orders. This is an independent project, not an official Ginkgo product or endorsed integration.

[Visual demo](#visual-demo) · [Meeting walkthrough](docs/DEMO.md) · [CLI quick start](#run-it) · [Agent mode](#use-the-pi-agent) · [Ginkgo handoff](#ginkgo-mode) · [Architecture](#architecture) · [Contribute](#help-build-this) · [Roadmap](docs/ROADMAP.md)

## Visual demo

```bash
git clone https://github.com/gvkhosla/bio-harness.git
npm --prefix bio-harness ci --ignore-scripts
npm --prefix bio-harness run demo:web
```

Open **http://127.0.0.1:4310**. Requires Node 22.19+. After installation, the walkthrough is fully offline—no model key or laboratory access needed.

- Explore **384 wells and 78 experimental conditions** from Ginkgo's pinned public CFPS example.
- Trace every shortlisted condition to its individual observations, units, source flags, and original artifact.
- Compare descriptive means and variability; download an **unapproved scientific review brief**, not an executable protocol.
- Inject a clearly labeled control failure: ranking is withheld and the server rejects follow-up briefs.
- Exercise the real approval boundary in a separate synthetic, in-memory campaign.
- Export an evidence report; refresh or select **Published example** to reset without deleting anything.

The replay preserves **35 source-flagged wells** and retains 71 conditions with at least three eligible measurements under an explicitly local demo rule. It does not claim Ginkgo-qualified QC, statistical significance, live execution, or optimization gains. CFPS is cell-free, not living-cell biology. The published example has no provider run ID; it is not an independently authenticated campaign.

See the [seven-minute demo script, rehearsal checklist, remote access, and backup recording instructions](docs/DEMO.md). The [fixture notes](fixtures/ginkgo-cfps/README.md) document the mapping and scientific limitations. The original source bytes and MIT notice are preserved separately from our code.

The visual replay does not read private `.bio/` workspaces or call a model. Separately, the Pi agent now has three read-only tools for the same pinned CFPS evidence. The browser remains a deterministic offline demo; agent mode requires model authentication and may incur costs.

## Why this exists

An agent conversation is not an experiment record. A plausible protocol is not a qualified workflow. And restarting an agent must not silently repeat an experiment or inherit an old approval.

Bio Harness explores the layer between scientific reasoning and laboratory execution: explicit experiment contracts, human-reviewed changes, reproducible analysis, and traceable evidence. The ambition is to connect scientific agents to qualified execution providers and, eventually, existing laboratory infrastructure—without giving a language model unrestricted hardware control.

## What works now

| Capability                                                  | V1 status                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pi agent with twelve domain-specific tools                  | Working; no shell, generic file, approval, or result-import tool                               |
| Durable campaigns and versioned plan drafts                 | SQLite with transactional mutations and hash-linked audit events                               |
| Validation and approvals                                    | Explicit controls, sample identities, capacity, simulation budget, exact-plan approval         |
| Offline execution                                           | Seeded toy simulator, randomized 96-well layout, two-batch demo                                |
| Analysis                                                    | QC checks, descriptive statistics, simulation-only follow-up drafts                            |
| External execution handoff                                  | Local Ginkgo request bundle and operator-attested result import                                |
| Visual evidence workbench                                   | Working; public CFPS replay, inspectable wells, review briefs, failure demonstration           |
| Agent decision brief                                        | Separate restricted Pi session; canonical evidence, cited interpretation, JSON/Markdown export |
| Live provider ordering / instrument control                 | **Not implemented**                                                                            |
| Qualified biological models, protocols, or biosafety review | **Not supplied by this software**                                                              |

## Run it

Requirements: **Git, npm, and Node 22.19+**. The project uses `node:sqlite`; Node 22 may print an experimental warning. CI is configured for Linux on Node 22/24 and macOS on Node 22.

```bash
git clone https://github.com/gvkhosla/bio-harness.git
npm --prefix bio-harness ci --ignore-scripts
npm --prefix bio-harness run demo
```

For the commands below, open a terminal in the cloned `bio-harness` directory. No npm package is published yet; use the source checkout.

The demo is offline and needs no keys. It creates a new campaign, proves the approval gate blocks an unapproved run, executes two synthetic batches, analyzes QC, proposes an **unapproved** next batch, and writes a Markdown report. Repeating the demo creates a new campaign; existing evidence is preserved.

Expect two batches of 20 randomized wells, a passing local QC check, a new draft awaiting approval, and printed paths to your report and SQLite database. The displayed $80 total is a **fictional simulation ledger**, not a charge.

You can run this on a remote development machine over SSH: no browser, laboratory hardware, or GPU is required for the demo. Keep `.bio/` local to that machine; do not use Git to sync experimental records or agent transcripts.

```bash
npm run bio -- list
npm run bio -- show CAMPAIGN_ID
npm run bio -- report CAMPAIGN_ID
npm run bio -- audit CAMPAIGN_ID
```

Everything lives under `.bio/` by default. Use `--dir /absolute/path` or `BIO_HOME` to select a different workspace. IDs and full plan hashes are printed by each command. `--json` makes the demo machine-readable; the other deterministic commands already emit JSON.

## Use the Pi agent

Reuse your existing Pi authentication, or export a provider key:

```bash
export OPENAI_API_KEY='...'
npm run bio -- agent --model openai/gpt-5.5
```

If you're logged in through Pi's ChatGPT subscription, use `--model openai-codex/gpt-5.5`. With no `--model`, the harness prefers authenticated OpenAI / Codex GPT-5.5 and otherwise another available non-Spark model. Override the default with `BIO_MODEL`.

One-shot example:

```bash
npm run bio -- agent "Create a simulator campaign for a phenotype response pilot, propose the example design, validate it, and stop for my approval."
```

The agent can inspect capabilities, create campaigns, propose/validate plans, execute **already approved** plans, analyze results, and propose simulation follow-ups. Approval happens in a **separate terminal command**, never through an agent tool:

```bash
npm run bio -- approve CAMPAIGN_ID DRAFT_ID --hash FULL_PLAN_HASH --by "Your name"
```

Then ask the agent to inspect the campaign and execute the approved draft. A follow-up draft requires its own validation and approval. `/quit` exits interactive mode; Ctrl+C interrupts an active model request. Requests have a 12-turn / 120-second bound. Provider API calls may incur costs; the simulation budget does **not** cap model API spending.

Agent transcripts are stored in `.bio/sessions/`. A new invocation starts a new conversation, but campaigns and evidence persist and are discoverable through tools. This is not automatic conversation resumption.

**Privacy:** prompts and campaign information returned by tools are sent to your selected model. Do not use confidential or regulated sample data without appropriate agreements. Agent mode loads no global/project extensions, skills, prompt templates, context files, shell, or generic file tools. It does reuse Pi's credential/model resolution.

### Inspect CFPS evidence with the agent

```bash
npm run bio -- agent "Inspect the original published CFPS plate, sample 9 and well J21. Report the eligible replicate count, mean, SD and source flag, citing the pinned source and exact JSON pointers. Do not create a campaign or propose an experiment."
```

New read-only tools:

| Tool                 | Returns                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bio_cfps_plate`     | Provenance, plate geometry, calibration, QC policy, experimental sample IDs, and a bounded shortlist (default 10, maximum 20) |
| `bio_cfps_condition` | An exact experimental sample ID, all four replicates including exclusions, mean/SD, and source pointers                       |
| `bio_cfps_well`      | One exact coordinate (`A01`–`P24`), measured values, source flags, separately labeled injected flags, and source pointers     |

Each call requires `scenario: "original"` or `"control-failure"`; the agent should use the original unless you request the demonstration failure. Scenario selection is per call, **not synchronized with the browser**. A blocked scenario has no shortlist or descriptive rank, but observations remain inspectable.

The tools read only the fixed vendored source, verify its bytes against the pinned manifest, and reuse the workbench's analysis. They do not expose embedded metadata/code, accept arbitrary files/URLs, mutate campaign state, approve anything, generate CFPS briefs, or execute experiments. Source-reported concentrations/calibration are distinguished from locally computed statistics. Inspection-only CFPS tools do not make the entire agent read-only: the existing phenotype campaign tools remain available.

The local fixture check is not provider authentication; neither descriptive rank nor well replication establishes statistical significance or biological independence.

### Generate a reviewable agent decision brief

```bash
npm run bio -- cfps-brief "Why not simply choose sample 9 over sample 5? Explain exclusions, uncertainty, and what would change this decision." --scenario original --strategy confirm
```

This starts a **separate restricted Pi session**, not the general campaign agent. It exposes only `bio_cfps_decision_context` and `bio_cfps_submit_decision`: no campaign, approval, import, shell, file, or execution tools. The operator fixes the question, scenario and strategy before the session starts. `confirm` considers the top two descriptive means; `explore` considers the top five. This is a fixed shortlist for review, not an agent-designed experiment or arbitrary condition search.

- The harness supplies measurements, statistics, exclusions, source pointers, attribution, and a hash-bound evidence packet.
- The model supplies an assessment, recommendation, uncertainties, and evidence that would change its judgment.
- Submission requires first inspecting the context, the matching packet hash, valid citation IDs, and citation coverage of every selected condition and excluded selected well. Facts cannot be supplied or overwritten through submission arguments.
- **Citation checks validate references and coverage, not whether the prose is true or supported.** Interpretation remains visibly unreviewed; a scientist must assess it. Prompt instructions against unsupported claims are not semantic enforcement.
- After a successful session, the CLI—not an agent tool—exports hash-named JSON and Markdown under `.bio/exports/`. The report separates computed observations from interpretation and records local model/session attribution. Hashes and attribution are not signatures or provider authentication.
- Missing/invalid submission, interruption, or model failure produces no exported brief. Failed QC is rejected before model initialization. The dedicated brief path never opens the campaign database.

Use `--model provider/id`, `--dir PATH`, or `--json` as needed. Authentication, privacy, potential model costs, and the 12-turn / 120-second bound are the same as agent mode. A browser toggle does not change this command's explicit scenario. Transcripts and generated artifacts stay local and gitignored. A dedicated visible agent-refusal walkthrough remains a later slice; the deterministic offline demo is still the meeting fallback.

### Inspect the run timeline

`cfps-brief` now checkpoints `.bio/traces/RUN_ID.trace.json` before QC, during Pi tool calls, and after export. Failed QC, unavailable models, rejected submissions and interrupted work remain visible; they do not become successful briefs. A record left `running` means incomplete/unknown, not that a process is still active. The trace records model/session identity, submitted interpretation, tool inputs/outputs, local durations and errors—not model thinking. Costs are explicitly uncollected. Large payloads are labeled as truncated.

Start `npm run demo:web`, open **http://127.0.0.1:4310/trace**, and choose the printed trace file. The viewer checks its content hash and renders it as text, entirely in the browser; no file upload, private workspace endpoint, model call or execution is added. Records are unsigned and may contain private questions or tool arguments; inspect before sharing. Refresh clears the viewer.

## Deterministic workflow without an LLM

```bash
npm run bio -- new "Phenotype pilot" "Compare candidate conditions" --budget 10000
npm run bio -- propose CAMPAIGN_ID --file examples/phenotype-plan.json
npm run bio -- validate CAMPAIGN_ID DRAFT_ID
npm run bio -- approve CAMPAIGN_ID DRAFT_ID --hash FULL_PLAN_HASH --by "Scientist"
npm run bio -- run CAMPAIGN_ID DRAFT_ID
npm run bio -- analyze CAMPAIGN_ID RUN_ID
npm run bio -- next CAMPAIGN_ID RUN_ID
```

`--budget` is integer cents in the **fictional simulation ledger**. The simulator assigns $2/well. Nothing is billed. Duplicate execution of the same draft returns the same run without charging the ledger again. Budget is checked again inside the execution transaction so competing approvals cannot overspend it.

Plans are immutable. To revise one, edit an input JSON file and propose a new draft. Approval includes the exact full SHA-256 hash and backend-specific scope. Cancelling a plan revokes its local approval; completed observations cannot be undone.

## Ginkgo mode

```bash
npm run bio -- propose CAMPAIGN_ID --file examples/ginkgo-intent.json
npm run bio -- validate CAMPAIGN_ID DRAFT_ID
npm run bio -- approve CAMPAIGN_ID DRAFT_ID --hash FULL_PLAN_HASH --by "Scientist"
npm run bio -- run CAMPAIGN_ID DRAFT_ID
npm run bio -- export CAMPAIGN_ID RUN_ID
```

This creates an `awaiting_external_results` run and writes `.bio/exports/RUN_ID.request.json`. **It does not contact Ginkgo, place an order, reserve instruments, authorize purchases, or imply provider acceptance.** Approval is explicitly `handoff-only`; real prices remain unknown (`null`), not zero.

The bundle contains:

- Scientific intent, controls, endpoint, analysis plan, and sample context.
- Exact approved plan hash and proposed randomized well map.
- Unresolved qualification, biosafety, physical-parameter, logistics, and quotation requirements.
- A local result-contract template for mapping externally acquired observations.

`phenotype-screen-v1` is our local intent template, **not a Ginkgo-certified assay or schema**. The example uses synthetic sample metadata and normalized factor levels. These are placeholders, not wet-lab instructions. Before real work, an expert must supply an appropriate sample description and Ginkgo must qualify its actual SOP and parameter mapping. Changing a plan requires a new draft and approval.

Import results only after obtaining them independently and mapping identities to the contract:

```bash
npm run bio -- import CAMPAIGN_ID --file results.json --by "Scientist"
npm run bio -- analyze CAMPAIGN_ID RUN_ID
npm run bio -- report CAMPAIGN_ID
```

The file must contain `schemaVersion`, `runId`, `planHash`, `source: "external"`, `providerRunId`, an ISO `measuredAt`, `unit: "a.u."`, `notes`, and an `observations` array of `{well, conditionId, value, qc}`. Every planned well must appear exactly once. Use `qc: "fail"` for failed measurements and explain placeholders/deviations in notes; failed values are excluded from analysis. Raw instrument parsing and missing-value representations are not implemented in v1.

Mismatched hashes, identities, units, incomplete rows, duplicates, and conflicting reimports are rejected. Accepted results are immutable and hashed. External evidence is **operator-attested**, not authenticated by a provider. No automatic external follow-up protocol generation is enabled. Preserve original instrument files separately and reference them in notes.

## What the simulator and analysis actually do

- Deterministic, seeded toy response over a normalized scalar factor.
- Randomized positions on one 96-well plate, with explicit condition/replicate identities.
- One negative control, one positive control, and at least one test condition.
- At least three replicates per condition, explicitly tagged technical or biological.
- Descriptive means, sample SDs, standard errors, and deltas against the negative control.
- A local heuristic for positive/negative control separation; fewer than three passing replicates or failed controls makes the analysis inconclusive.
- Simulation-only follow-up heuristic: test near the observed leader. This is **not** Bayesian optimization or a virtual-cell model.

Synthetic results are always labeled. There are no p-values, clinical decisions, causal claims, or assurances of biological validity. Actual independence, biological replication, appropriate controls, and assay QC require expert review.

## SDK

```typescript
// From the repository root, after npm run build:
import { Harness, Store, examplePlan } from "./dist/index.js";

const store = new Store("./campaigns.sqlite");
try {
  const lab = new Harness(store);
  const campaign = lab.create({
    title: "Pilot",
    objective: "Compare conditions",
    simulationBudgetCents: 10000,
  });
  const draft = lab.propose(campaign.id, examplePlan());
  const checks = lab.validate(campaign.id, draft.id);
  // Your operator-facing application must collect approval; do not auto-approve an agent's request.
  console.log({
    campaignId: campaign.id,
    draftId: draft.id,
    hash: draft.hash,
    checks,
  });
} finally {
  store.close();
}
```

The package is currently source-only. If you embed it in another project, build it first and configure the local package dependency explicitly; do not assume an unrelated npm package named `bio-harness` is this project.

## Architecture

```text
src/contracts.ts  Typed intent/results, validation, hashing, randomized layout
src/store.ts      SQLite snapshots + append-only hash-linked audit events
src/harness.ts    Campaign lifecycle, approval, budget, imports, follow-ups
src/adapters.ts   Synthetic executor and local Ginkgo handoff builder
src/analysis.ts   QC and descriptive statistics
src/agent.ts      Pi SDK session and twelve narrowly scoped tools
src/cfps-evidence.ts Bounded read-only CFPS projections with source pointers
src/cfps-decision.ts Canonical evidence packets, reference validation, review artifacts
src/cfps-decision-agent.ts Restricted Pi interpretation session (two tools)
src/report.ts     Evidence report
src/cli.ts        Operator commands, interactive agent, offline demo
src/replay.ts     Pinned public CFPS result projection and review briefs
src/demo-server.ts Loopback-only read-only demo server and isolated gate proof
web/             Dependency-free evidence workbench
```

A mutation updates the campaign snapshot and appends its audit event in a single `BEGIN IMMEDIATE` SQLite transaction. The simulator is pure local computation inside that transaction; there are **no physical operations** to retry. Handoff files can be regenerated from durable state. A future live adapter needs a durable dispatch/outbox, provider-side idempotency, reconciliation of unknown outcomes, and a real authorization model—do not simply put network requests inside the existing transaction.

## Trust model / limits

This is a **single-user local developer harness**, not a production laboratory controller:

- The agent lacks approval/import/shell tools, but any process with your OS identity can edit the database or call the SDK. `--by` records attribution; it does not authenticate a human.
- Hash chains detect ordinary record inconsistency, not a privileged actor who rewrites the entire history. They are not signed regulatory audit trails.
- Text such as `biosafetyReview` records context; it does not certify biosafety. No live biological work is authorized by this application.
- No scheduler, LIMS integration, literature search, provider quotation, sample custody, device control, or arbitrary hardware support is claimed.
- No public HTTP service or multi-tenant authentication is included. The demo server binds only to `127.0.0.1`, checks Host/Origin, and serves allowlisted demo assets and public evidence. Do not expose it through a public reverse proxy.
- State schema version 1; no migration framework yet. Back up the workspace before future upgrades.
- Plan-level assay/units are intentionally narrow. Add and qualify another workflow contract rather than silently broadening this one.

## Help build this

This project needs **scientific judgment as much as software engineering**. You do not need lab hardware or a model API key to make a useful contribution.

| Your background             | A useful contribution                                                                                             | Start here                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Biology / assay development | Critique controls, replication, missing metadata, and interpretation limits using synthetic or shareable examples | `src/contracts.ts`, `src/analysis.ts`                                              |
| Lab automation              | Specify a provider capability contract or a failure/reconciliation scenario before adding live execution          | `src/adapters.ts`, [roadmap](docs/ROADMAP.md)                                      |
| TypeScript / infrastructure | Improve result ingestion, state migrations, concurrency tests, or CLI errors                                      | `src/store.ts`, `src/harness.ts`, `test/`                                          |
| Agents / evaluation         | Add offline evaluations of tool behavior, unsupported claims, and approval enforcement                            | `src/agent.ts`, `test/agent.test.ts`                                               |
| Documentation / UX          | Try the fresh-clone demo and improve unclear instructions or terminology                                          | This README, `examples/`, [issues](https://github.com/gvkhosla/bio-harness/issues) |
| Research teams              | Describe a recurring experimental workflow and its actual constraints, without sharing confidential data          | [Start a discussion](https://github.com/gvkhosla/bio-harness/discussions)          |

Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a small issue or pull request. For new workflows, live adapters, or architecture changes, discuss the design first. Please **do not upload patient information, donor identifiers, proprietary experiments, credentials, or `.bio/` contents**.

See the [roadmap](docs/ROADMAP.md) for priorities and acceptance criteria. Found a security issue? Use the private process in [SECURITY.md](SECURITY.md), not a public issue.

## Development

```bash
npm ci --ignore-scripts
npm run fmt
npm run check  # formatting + strict TypeScript + offline tests + build
```

Browser checks run separately with `npm run test:browser`; install Chromium once with `npx playwright install chromium`. CI runs both the core suite and Chromium end-to-end checks, including automated accessibility checks at desktop/mobile sizes and the blocked-QC state. `npm run demo:record` creates a local silent backup walkthrough.

Tests are offline, use temporary databases, and never call model or laboratory APIs. They cover lifecycle gating, invalid designs, budget races, concurrent process startup/execution, persistence, audit integrity, result provenance, QC failure, cancellation, CLI behavior, and the actual Pi tool surface.

Decision-brief tests additionally cover immutable facts, citation identity/coverage, missing submissions, successful-submission immutability, export integrity, and QC rejection before model calls. They deliberately demonstrate that resolving references does not certify prose semantics.

Manual live-model smoke test (may incur provider charges):

```bash
npm run bio -- agent "Use bio_capabilities only and summarize the two adapter modes."
```

### Troubleshooting

- **`node:sqlite` unavailable:** check `node --version`; use Node 22.19+.
- **No authenticated model:** the demo still works. For agent mode, provide a supported provider API key or authenticate with Pi, and choose an explicit `--model provider/id` if needed.
- **Campaign not found:** use the same `--dir` / `BIO_HOME` as the command that created it. `npm run bio -- list` shows that workspace's campaigns.
- **Approval rejected:** validate the draft first, then supply its exact full hash. A new draft never inherits approval.
- **Ginkgo run awaiting results:** expected. No order was sent; the handoff must be reviewed and processed outside this application.

## License and ownership

**Copyright 2026 Geet Khosla.** Licensed under the [Apache License, Version 2.0](LICENSE); see [NOTICE](NOTICE).

You may use, modify, and redistribute this project, including commercially, under that license. Preserve applicable license and attribution notices, and identify modifications as required by the license. Apache 2.0 also provides an express contributor patent grant; it does not grant permission to use contributors' trademarks to imply endorsement.

Contributors retain copyright in their own contributions; contributing does not assign that copyright to the maintainer. Contributions are accepted under Apache 2.0. Dependencies and the vendored Ginkgo example retain their respective licenses. The full license text governs.

## Acknowledgments

Built with [Pi](https://github.com/earendil-works/pi), [TypeBox](https://github.com/sinclairzx81/typebox), and [Zod](https://github.com/colinhacks/zod). Ginkgo's published [CFPS automation interface](https://github.com/ginkgobioworks/ginkgo-automation-cfps) is a useful reference for the separation between experimental intent and provider-owned execution. Bio Harness vendors one unmodified public example return with its original license for read-only replay. It does not implement Ginkgo's private execution infrastructure or claim full compatibility with its experimental-design validator.

Maintained by [Geet Khosla](https://github.com/gvkhosla). Contributions and careful scientific criticism are welcome.
