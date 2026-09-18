# The seven-minute partnership demo

## Start here

Use Node 22.19+ and a terminal in the repository:

```bash
npm ci --ignore-scripts
npm run demo:web
```

Open **http://127.0.0.1:4310**. The core demonstration is fully offline after dependencies are installed: no model credentials, network data fetches, instrument access, or API spending.

The server reads only the vendored public example and allowlisted UI assets. It does not read your `.bio/` campaigns or transcripts. Refresh or select **Published example** to reset; no files need deleting. Ctrl+C stops the server. If the port is busy, set `BIO_DEMO_PORT` to an unused local port.

For a remote machine, keep the service bound to loopback and forward it from your laptop:

```bash
ssh -L 4310:127.0.0.1:4310 YOUR_REMOTE_HOST
```

Run `npm run demo:web` on that machine and open the same local URL. Do not expose the server publicly or treat it as a multi-user application.

## Know exactly what you are showing

This is a **replay of Ginkgo's published example return**, not a new experimental run, a reconstructed complete historical campaign, or a live integration. The file's provider run ID is null. CFPS is cell-free; it does not demonstrate living-cell biology.

- Original 384-well geometry and source units (g/L).
- 78 experimental sample IDs, four well replicates each.
- 35 source-flagged wells preserved; excluded under our explicit demo policy.
- 71 conditions retain at least three eligible measurements.
- Source-reported concentration and calibration, not recalculated calibration.
- Our descriptive shortlist and local QC policy, **not Ginkgo-qualified scientific acceptance**.
- No source metadata code is executed or interpreted as agent instructions.

The core walkthrough is deterministic software, not a live model conversation. Optional Pi segments can inspect the pinned CFPS evidence or generate a cited review interpretation. Evidence inspection uses the general campaign agent; decision-brief generation uses a separate two-tool session with no campaign or execution access. Neither controls a laboratory.

## Walkthrough

### 0:00–0:45 — Frame the question

> “We are exploring the customer-side layer that connects a scientific question to reviewed experiments and the next decision. Ginkgo already has laboratory orchestration and agent capabilities. We want to find a useful partner-owned boundary, not pretend those are missing.”

Point to the persistent **published example / no live connection** labels. Do not bury this disclosure at the end.

### 0:45–2:00 — Trace evidence rather than narrating a chatbot

Show the plate, source link, and provenance drawer. Click **Sample 9**, then its **J21** replicate.

> “This condition has four wells, but one carries a source lysate flag. Our demo rule excludes it, so the displayed mean uses three—not four—measurements. Every value remains traceable to the source.”

Source flag `lysate` is preserved verbatim; do not invent its operational cause.

### 2:00–3:00 — Make a scientifically modest decision

Compare samples **9** and **5**:

- Sample 9: mean **1.123 g/L**, sample SD **0.270**, 3/4 eligible.
- Sample 5: mean **1.113 g/L**, sample SD **0.559**, 4/4 eligible.
- Difference in descriptive mean: approximately **0.010 g/L**.

> “The ordering alone is not a winner. We would ask for an independently reviewed confirmation, not claim optimization or statistical significance from this plate.”

Select **Confirm top two candidates** and download the review brief. Show its evidence references, unresolved questions, full brief hash, and unapproved status. It is not a quote, provider request schema, or executable protocol.

### 3:00–4:00 — Show the refusal

Click **Inject control failure**.

The interface labels 24 locally injected failures, removes the ranking, and disables the brief action. The API also rejects brief generation with HTTP 409; this is not a button-only safeguard.

> “We did not alter the published measurements. This is an explicitly injected failure. Even a persuasive agent cannot get a follow-up brief from this analysis when the reference-control screen fails.”

Click **Published example** to restore the unmodified replay.

### 4:00–5:00 — Prove authority separation

Scroll to **Prove the approval boundary** and run it.

This executes the existing Harness in a separate in-memory synthetic workspace:

1. Unapproved execution is rejected.
2. Explicit demo-only approval permits one synthetic run.
3. A revised plan is rejected until it receives its own approval.

> “These are actual harness state transitions, not a narrated animation. The proof is synthetic, separate from the CFPS example, and performs no laboratory action.”

Do not call the local `--by` string authenticated authorization or the hash chain a signed regulatory ledger.

### 5:00–7:00 — Ask for a scoped pilot

> “Could we pair with one applications scientist and one integration engineer to choose a supported workflow and test this with one external research team? We would measure time to an accepted request, clarification cycles, and whether the researcher commissions another campaign.”

Ask which boundary should be partner-owned rather than Catalyst-owned. Live feasibility, qualified workflow mapping, pricing, execution contracts, authorization, and reconciliation remain to be agreed and built. No private API access is assumed.

## Optional live-agent evidence inspection

After rehearsing the offline walkthrough, use an authenticated Pi model in a separate terminal:

```bash
npm run bio -- agent "Inspect the original CFPS plate with bio_cfps_plate, sample 9 with bio_cfps_condition, and J21 with bio_cfps_well. Report the eligible replicate count, computed mean and SD, and the source flag. Cite the source URL and JSON pointers. Do not create or modify campaigns."
```

The tool responses are the evidence; verify the model's summary against the actual tool trace and values. Model calls may incur costs; prompts and tool-returned evidence go to the selected model. The source's embedded metadata/code is not exposed to the agent.

The browser's scenario selector is not synchronized with the agent. Evidence tool calls explicitly name `original` or `control-failure`; no tool changes the source or the browser. Retain the offline walkthrough as the fallback.

## Optional live-agent decision brief

```bash
npm run bio -- cfps-brief "Why not simply choose sample 9 over sample 5? Explain exclusions, uncertainty, and what would change this decision." --scenario original --strategy confirm
```

Open the printed Markdown path. Start with **Computed observations**, then **Model interpretation**; inspect the references and full-precision appendix. The JSON artifact records the exact evidence packet, model/session attribution, and hashes. Do not commit either artifact or its transcript.

> “The harness—not the model—owns these numbers and exclusions. Pi reasons over that packet and submits a cited interpretation. We check that references resolve and cover the selected evidence; we do not pretend that this proves the interpretation scientifically correct. A scientist still reviews it.”

`confirm` fixes the shortlist at the top two descriptive means; `explore` uses five. The question cannot alter the shortlist or screening policy. The model must inspect the bound context and successfully submit before the operator runner exports anything. The brief is unapproved and non-executable, with no quote or order. This session has **only two tools** and never opens campaign storage.

For rehearsal, `--scenario control-failure` fails locally before a model call or artifact export. That is enforced preflight rejection, **not yet a visible agent-refusal performance**. Browser and CLI scenarios remain independent. Model errors, absent submissions and interruption produce no exported brief; use the deterministic download if the live segment fails.

## Transparency walkthrough

After generating a decision brief, open **/trace** using “Inspect an agent run.” Select the printed `.trace.json` locally; nothing is uploaded. Show the question, explicit scenario, permission profile, registered tool names, policy checks, actual tool inputs/outputs and timing. Open a failed trace as well. A preflight refusal is not a model-refusal performance; a `running` trace is incomplete, not proof of a live process.

For a successful artifact, click a citation and contrast published observations with harness calculations. Show the QC rule/version/hash and analysis identity, then the model's unreviewed interpretation. Record a human verdict, rationale and unresolved concern; download the separate review attachment. Make clear that a citation resolving does not prove its claim and that review commentary grants no execution authority.

For the evaluation segment, use `npm run eval:cfps` offline or explicitly run one model case with `npm run bio -- evaluate-cfps --live --case close-leaders --model openai-codex/gpt-5.5`. The proposed cases await scientist review; do not present passing software checks as a scientific accuracy score. See [EVALUATION.md](EVALUATION.md).

## Rehearsal checklist

- [ ] Run `npm run check` and `npm run test:browser` before travel.
- [ ] Start the page once, then disconnect the network and repeat the walkthrough.
- [ ] Practice J21 exclusion, the failure toggle, restoration, and approval proof.
- [ ] Download one review brief and one evidence report ahead of time.
- [ ] If using the optional live segment, generate and scientifically review a saved agent brief beforehand; label it as a prior model run when shown.
- [ ] Check browser zoom on the actual presentation display; 1440px is a useful desktop reference.
- [ ] Prepare a backup recording with `npm run demo:record` (see below).
- [ ] Be ready to explain what is computed locally versus supplied by the source.
- [ ] Bring a real research-user problem if you have permission to discuss it; don't invent demand.

## Browser checks and backup recording

One-time browser installation, if Chromium is not already available:

```bash
npx playwright install chromium
npm run test:browser
npm run demo:record
```

The recording command starts its own temporary loopback server, records a short silent walkthrough, and writes `.bio/demo-walkthrough.webm`. It needs a local Chromium installation but no running server or model key. The file is gitignored. Play it locally as a backup; it is not evidence of live laboratory execution.

## If something fails

- **Source integrity error:** restore the tracked fixture from the pinned commit; do not edit the manifest merely to make the error go away.
- **Address already in use:** stop your own previous demo process or choose another `BIO_DEMO_PORT`.
- **Model authentication failure:** skip the separate agent segment. The visual replay never needs a model.
- **Missing Chromium:** the app still works in your ordinary browser. Install Playwright's browser before automated tests or recording.
- **Unanswerable scientific question:** inspect source metadata and acknowledge the gap. This example does not establish independent repeatability, optimized cost, or a qualified assay.
