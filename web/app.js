const $ = (id) => document.getElementById(id);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const fmt = (value, places = 3) =>
  value === null ? "Missing" : value.toFixed(places);
const roles = {
  experimental: "Experimental condition",
  standard: "Calibration standard",
  positive_control_mixed: "Mixed positive control",
  empty: "Empty well",
};
let report;
let scenario = "original";
let selected = "P06";
let showAll = false;
let sequence = 0;
const wellButtons = new Map();

async function request(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}
function api(path) {
  return `${path}?scenario=${scenario}`;
}

function renderPlate() {
  const table = $("plate");
  table.querySelectorAll("thead, tbody").forEach((node) => node.remove());
  const head = make("thead");
  const headers = make("tr");
  const corner = make("th", "Row");
  corner.scope = "col";
  headers.append(corner);
  for (let col = 1; col <= 24; col++) {
    const h = make("th", String(col).padStart(2, "0"));
    h.scope = "col";
    headers.append(h);
  }
  head.append(headers);
  table.append(head);
  const body = make("tbody");
  wellButtons.clear();
  const maximum = Math.max(
    ...report.wells.map((w) => w.concentration ?? 0),
    0.001,
  );
  const byCoordinate = new Map(report.wells.map((w) => [w.well, w]));
  for (let row = 0; row < 16; row++) {
    const tr = make("tr");
    const letter = String.fromCharCode(65 + row);
    const h = make("th", letter);
    h.scope = "row";
    tr.append(h);
    for (let col = 1; col <= 24; col++) {
      const well = byCoordinate.get(`${letter}${String(col).padStart(2, "0")}`);
      const td = make("td");
      const button = make(
        "button",
        well.demoFlags.length ? "!" : well.sourceFlags.length ? "×" : "",
      );
      const bucket = Math.min(
        9,
        Math.max(0, Math.floor(((well.concentration ?? 0) / maximum) * 9)),
      );
      button.className = `well q${bucket}`;
      button.classList.toggle("flagged", well.sourceFlags.length > 0);
      button.classList.toggle("injected", well.demoFlags.length > 0);
      button.classList.toggle("missing", well.concentration === null);
      const label = `${well.well}, ${roles[well.role]} ${well.sampleId}, ${fmt(well.concentration)} g/L${well.sourceFlags.length ? `, source flags: ${well.sourceFlags.join(", ")}` : ""}${well.demoFlags.length ? ", injected failure" : ""}`;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.dataset.well = well.well;
      button.addEventListener("click", () => selectWell(well.well));
      button.addEventListener("keydown", (event) => {
        const moves = {
          ArrowRight: [0, 1],
          ArrowLeft: [0, -1],
          ArrowDown: [1, 0],
          ArrowUp: [-1, 0],
        };
        const delta = moves[event.key];
        if (!delta) return;
        event.preventDefault();
        const nextRow = Math.max(0, Math.min(15, row + delta[0]));
        const nextCol = Math.max(1, Math.min(24, col + delta[1]));
        const next = `${String.fromCharCode(65 + nextRow)}${String(nextCol).padStart(2, "0")}`;
        selectWell(next);
        wellButtons.get(next).focus();
      });
      td.append(button);
      tr.append(td);
      wellButtons.set(well.well, button);
    }
    body.append(tr);
  }
  table.append(body);
  $("scale-label").textContent = `0–${fmt(maximum, 2)} g/L`;
}

function selectWell(coordinate) {
  selected = coordinate;
  const well = report.wells.find((w) => w.well === coordinate);
  const condition = report.conditions.find(
    (c) => c.sampleId === well.sampleId && well.role === "experimental",
  );
  const siblings = condition ? condition.wells : [coordinate];
  for (const [name, button] of wellButtons) {
    button.setAttribute("aria-pressed", String(name === coordinate));
    button.tabIndex = name === coordinate ? 0 : -1;
    button.classList.toggle("in-condition", siblings.includes(name));
  }
  const detail = $("well-detail");
  detail.replaceChildren();
  detail.append(
    make(
      "h3",
      `${well.well} / ${well.sampleId ? `sample ${well.sampleId}` : roles[well.role]}`,
    ),
  );
  detail.append(make("p", roles[well.role]));
  const dl = make("dl");
  const fields = [
    ["Concentration", `${fmt(well.concentration)} g/L`],
    [
      "Raw fluorescence",
      well.fluorescence === null
        ? "Missing"
        : well.fluorescence.toLocaleString("en-US"),
    ],
    [
      "Local screen",
      well.eligible ? "Eligible measurement" : "Excluded measurement",
    ],
  ];
  for (const [label, value] of fields)
    dl.append(make("dt", label), make("dd", value));
  detail.append(dl);
  if (well.sourceFlags.length)
    detail.append(
      make(
        "p",
        `Source flag: ${well.sourceFlags.join(", ")}. This measurement is excluded by our demo policy.`,
        "warning",
      ),
    );
  if (well.demoFlags.length)
    detail.append(
      make(
        "p",
        "Injected failure, not a source finding. Original measured values remain unchanged.",
        "warning",
      ),
    );
  detail.append(make("h3", "Why this screening decision?"));
  const reasons = well.screen.reasons;
  if (reasons.length) {
    const list = make("ul");
    for (const reason of reasons) {
      const rule = report.qc.policyManifest.rules.find(
        (r) => r.id === reason.ruleId,
      );
      list.append(
        make(
          "li",
          `${reason.explanation} → ${reason.ruleId}: ${rule?.statement ?? "Unknown rule"}`,
        ),
      );
    }
    detail.append(list);
  } else
    detail.append(
      make(
        "p",
        "No exclusion rule triggered. Eligibility is a local screen, not proof of assay validity.",
      ),
    );
  if (well.screen.unknownCause)
    detail.append(
      make(
        "p",
        "Unknown: the physical cause of this source flag. Do not infer a mechanism from its label.",
        "warning",
      ),
    );
  const pointers = make("details");
  pointers.append(
    make("summary", "Trace to source fields"),
    make("code", `/samples/${well.column * 16 + well.row}`),
    make("code", `/concentration_results/concentration_g_L/${well.well}`),
    make("code", `/fluorescence_results/fluorescence/${well.well}`),
  );
  if (well.sourceFlags.length)
    pointers.append(make("code", `/reagent_flags/flags/${well.well}`));
  detail.append(pointers);
  if (condition) {
    detail.append(make("h3", "Trace every replicate"));
    const replicateButtons = make("div", undefined, "replicates");
    for (const name of siblings) {
      const b = make("button", name);
      b.setAttribute("aria-pressed", String(name === coordinate));
      b.setAttribute("aria-label", `Inspect replicate ${name}`);
      b.addEventListener("click", () => {
        selectWell(name);
        $("well-detail").querySelector(`button[aria-pressed="true"]`).focus();
      });
      replicateButtons.append(b);
    }
    detail.append(
      replicateButtons,
      make(
        "p",
        `${condition.n} of ${condition.total} eligible. Mean ${fmt(condition.mean)} g/L; sample SD ${fmt(condition.sd)}. These are well replicates, not independent biological repeats.`,
      ),
    );
    if (condition.excluded.length)
      detail.append(
        make("p", `Excluded wells: ${condition.excluded.join(", ")}.`),
      );
  }
  for (const row of $("ranking-body").children)
    row.classList.toggle("active", row.dataset.sample === condition?.sampleId);
}

function renderRanking() {
  const body = $("ranking-body");
  body.replaceChildren();
  const blocked = report.qc.status === "blocked";
  $("ranking-count").textContent = blocked
    ? "Ranking withheld"
    : `${report.ranking.length} eligible conditions`;
  $("all-candidates").hidden = blocked;
  $("all-candidates").textContent = showAll
    ? "Show top eight"
    : `Show all ${report.ranking.length} candidates`;
  $("all-candidates").setAttribute("aria-expanded", String(showAll));
  if (blocked) {
    $("ranking-explanation").textContent =
      "The measurements remain inspectable, but a failed reference-control screen blocks ranking and follow-up briefs on the server—not just in this interface.";
    $("ranking").hidden = true;
    return;
  }
  $("ranking").hidden = false;
  const [first, second] = report.ranking;
  $("ranking-explanation").textContent = second
    ? `Samples ${first.sampleId} and ${second.sampleId} differ by only ${fmt(Math.abs(first.mean - second.mean))} g/L in descriptive mean. Compare their variability and excluded wells before proposing confirmation. No significance or superiority claim is made.`
    : "A descriptive candidate is available. Independent confirmation and scientific review are still required.";
  for (const condition of report.ranking.slice(0, showAll ? undefined : 8)) {
    const row = make("tr");
    row.dataset.sample = condition.sampleId;
    const nameCell = make("td");
    const button = make(
      "button",
      `Sample ${condition.sampleId}`,
      "condition-link",
    );
    button.addEventListener("click", () =>
      selectWell(
        condition.wells.find((w) => !condition.excluded.includes(w)) ??
          condition.wells[0],
      ),
    );
    nameCell.append(button);
    row.append(nameCell);
    for (const value of [
      fmt(condition.mean),
      fmt(condition.sd),
      `${condition.n} / ${condition.total}`,
      condition.excluded.join(", ") || "None",
    ])
      row.append(make("td", value));
    body.append(row);
  }
}

function renderDecision() {
  const blocked = report.qc.status === "blocked";
  $("download-brief").disabled = blocked;
  $("strategy").disabled = blocked;
  $("decision-summary").textContent = blocked
    ? "Stop. Resolve the reference-control failure before selecting candidates or preparing a follow-up brief."
    : "Confirm before optimizing. This plate supports a reviewable shortlist, not a reproducible winner.";
  $("strategy-description").textContent = blocked
    ? "Restore the published example to return to a reviewable state. No approval can override this demo's QC gate."
    : $("strategy").value === "confirm"
      ? "Reassess the two descriptive leaders independently, alongside an appropriate reference. A scientist must define controls, replication, and acceptance criteria."
      : "Review five candidates and their formulation identities for meaningful contrasts. We do not automatically infer diverse conditions or generate a wet-lab protocol.";
}

async function load(nextScenario = scenario) {
  const version = ++sequence;
  scenario = nextScenario;
  $("workspace").hidden = true;
  $("loading").hidden = false;
  $("error").hidden = true;
  $("original").disabled = true;
  $("failure").disabled = true;
  $("report-link").hidden = true;
  try {
    const data = await request(api("/api/replay"));
    if (version !== sequence) return;
    report = data;
    showAll = false;
    const blocked = report.qc.status === "blocked";
    document.body.classList.toggle("failure", blocked);
    $("original").setAttribute("aria-pressed", String(scenario === "original"));
    $("failure").setAttribute(
      "aria-pressed",
      String(scenario === "control-failure"),
    );
    $("scenario-caption").textContent = blocked
      ? "Demonstration: 24 control wells marked failed. Source unchanged."
      : "Published example replay. No new experiment performed.";
    $("source-link").href = report.source.url;
    $("source-commit").textContent = `Pinned commit: ${report.source.commit}`;
    $("source-hash").textContent = report.source.sha256;
    $("plate-id").textContent = `Plate: ${report.plateId}`;
    $("screen-state").textContent = blocked
      ? "QC blocked"
      : "Reviewable · local screen";
    $("screen-summary").textContent =
      `${report.qc.sourceFlaggedWells} source-flagged wells · ${report.qc.excludedConditions} conditions below three eligible replicates · source integrity verified`;
    $("trail-qc").textContent = blocked
      ? "Blocked: reference controls failed"
      : "Source flags retained; exclusions explicit";
    $("blocked").hidden = !blocked;
    $("blocked-reason").textContent = report.qc.problems.join(" ");
    $("policy").textContent = report.qc.policy;
    $("policy-version").textContent =
      `${report.qc.policyManifest.id} v${report.qc.policyManifest.version} · analysis ${report.software.analysisContract}`;
    $("policy-details").textContent = JSON.stringify(
      {
        policy: report.qc.policyManifest,
        checks: report.qc.checks,
        software: report.software,
      },
      null,
      2,
    );
    $("calibration").textContent =
      `Source-reported calibration: R² ${fmt(report.calibration.r2, 4)}; MAPE ${(report.calibration.mape * 100).toFixed(2)}%. Not recomputed here.`;
    $("control-summary").textContent =
      `Named target control: ${report.control.n} / ${report.control.total} eligible wells; mean ${fmt(report.control.mean)} g/L. No negative-control group is declared in this file.`;
    $("limitations").replaceChildren(
      ...report.limitations.map((line) => make("li", line)),
    );
    $("download-status").textContent = "";
    $("report-link").href = api("/api/report");
    $("report-link").hidden = false;
    renderPlate();
    renderRanking();
    renderDecision();
    selectWell(
      blocked
        ? "A04"
        : (report.ranking[0]?.wells.find(
            (w) => !report.ranking[0].excluded.includes(w),
          ) ?? "A01"),
    );
    $("workspace").hidden = false;
  } catch (error) {
    if (version !== sequence) return;
    $("error-message").textContent =
      `Could not load the evidence: ${error.message}. Make sure the local server is running, then retry.`;
    $("error").hidden = false;
  } finally {
    if (version === sequence) {
      $("loading").hidden = true;
      $("original").disabled = false;
      $("failure").disabled = false;
    }
  }
}

$("original").addEventListener("click", () => load("original"));
$("failure").addEventListener("click", () => load("control-failure"));
$("retry").addEventListener("click", () => load());
$("strategy").addEventListener("change", renderDecision);
$("all-candidates").addEventListener("click", () => {
  showAll = !showAll;
  renderRanking();
  selectWell(selected);
});
$("download-brief").addEventListener("click", async () => {
  const version = sequence;
  $("download-brief").disabled = true;
  $("download-status").textContent = "Preparing evidence-linked review brief…";
  try {
    const brief = await request(
      `${api("/api/brief")}&strategy=${$("strategy").value}`,
    );
    if (version !== sequence) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(brief, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const link = make("a");
    link.href = url;
    link.download = `cfps-${brief.strategy}-review.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("download-status").textContent =
      "Review brief downloaded. Unapproved; no order sent.";
  } catch (error) {
    if (version === sequence)
      $("download-status").textContent =
        `Brief not downloaded: ${error.message}. Retry when the server is available.`;
  } finally {
    if (version === sequence)
      $("download-brief").disabled = report.qc.status === "blocked";
  }
});
$("prove-gates").addEventListener("click", async () => {
  $("prove-gates").disabled = true;
  $("gate-result").textContent =
    "Exercising the real approval boundary with synthetic data…";
  try {
    const proof = await request("/api/gates");
    const list = make("ol");
    for (const check of proof.checks) {
      const li = make("li");
      li.append(
        make("strong", `${check.passed ? "PASS" : "FAIL"} · ${check.label}`),
        make("p", check.detail),
      );
      list.append(li);
    }
    $("gate-result").replaceChildren(
      list,
      make(
        "p",
        `${proof.completedRuns} synthetic run; ${proof.audit.events} verified events. ${proof.notice}`,
      ),
    );
  } catch (error) {
    $("gate-result").textContent =
      `Proof could not complete: ${error.message}. Retry when the server is available.`;
  } finally {
    $("prove-gates").disabled = false;
  }
});
load();
