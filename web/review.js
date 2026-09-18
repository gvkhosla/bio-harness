import { $, make, inspectJson, jsonDigest, textDigest } from "/trace.js";
const authority =
  "Self-attested review commentary, not authenticated identity, execution approval, or scientific certification.";
let artifact;
let version = 0;
let statements = [];
const fields = new Map();
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
async function checkArtifact(value) {
  if (
    !value?.brief?.packet ||
    value.brief.status !== "unapproved-review-only" ||
    value.brief.format !== "bio-harness.cfps-agent-decision.v1"
  )
    throw new Error("No supported decision artifact in this record.");
  const { artifactHash, ...body } = value;
  const { briefHash, ...brief } = body.brief;
  const { packetHash, ...packet } = brief.packet;
  if (
    (await textDigest(canonical(body))) !== artifactHash ||
    (await textDigest(canonical(brief))) !== briefHash ||
    (await textDigest(canonical(packet))) !== packetHash
  )
    throw new Error("Decision artifact hash mismatch.");
  const i = brief.interpretation;
  if (
    !Array.isArray(i?.assessment) ||
    !Array.isArray(i?.uncertainties) ||
    !Array.isArray(i?.wouldChangeDecision) ||
    !i.recommendation ||
    typeof packet.evidence !== "object" ||
    packet.evidence === null
  )
    throw new Error("Invalid decision structure.");
  const s = [
    ...i.assessment.map((v, n) => ({ id: `assessment:${n}`, ...v })),
    { id: "recommendation", ...i.recommendation },
    ...i.uncertainties.map((v, n) => ({ id: `uncertainties:${n}`, ...v })),
  ];
  if (
    s.length < 3 ||
    s.length > 13 ||
    Object.keys(packet.evidence).length > 50 ||
    i.wouldChangeDecision.length > 4 ||
    i.wouldChangeDecision.some((t) => typeof t !== "string" || t.length > 1500)
  )
    throw new Error("Decision exceeds supported bounds.");
  for (const v of s)
    if (
      typeof v.text !== "string" ||
      v.text.length > 1500 ||
      !Array.isArray(v.evidenceRefs) ||
      v.evidenceRefs.length > 12 ||
      v.evidenceRefs.some(
        (ref) =>
          typeof ref !== "string" || !Object.hasOwn(packet.evidence, ref),
      )
    )
      throw new Error("Invalid statement or unresolved citation.");
  return s;
}
function inspect(ref, focus = false) {
  const fact = artifact.brief.packet.evidence[ref];
  const nodes = [make("h3", ref)];
  if (ref.startsWith("well:")) {
    nodes.push(
      make("h3", "Published observation · recorded, not authenticated"),
      inspectJson("Source measurements, flags and pointers", {
        well: fact.well,
        concentration: fact.concentration,
        unit: fact.unit,
        fluorescence: fact.fluorescence,
        fluorescenceUnit: fact.fluorescenceUnit,
        sourceFlags: fact.sourceFlags,
        sourcePointers: fact.sourcePointers,
      }),
    );
    nodes.push(
      make("h3", "Harness calculation / policy decision"),
      inspectJson("Eligibility and derived fields", {
        eligible: fact.eligible,
        exclusionReasons: fact.exclusionReasons,
        demoFlags: fact.demoFlags,
        formulationHash: fact.formulationHash,
        ruleDecisions: fact.screen ?? "Not recorded by this historical version",
      }),
    );
  } else
    nodes.push(
      make(
        "p",
        ref === "plate:calibration"
          ? "Published calibration · source-reported, not recomputed"
          : "Harness calculation / local policy · not provider qualification",
      ),
      inspectJson("Recorded evidence", fact),
    );
  nodes.push(
    inspectJson(
      "Local QC policy identity",
      artifact.brief.packet.policy ?? "Not recorded by this historical version",
    ),
    inspectJson(
      "Analysis module identity",
      artifact.brief.packet.software ??
        "Not recorded by this historical version",
    ),
    inspectJson(
      "Pinned source attribution and integrity limits",
      artifact.brief.packet.source,
    ),
  );
  $("cited-evidence").replaceChildren(...nodes);
  $("evidence-select").value = ref;
  if (focus) $("cited-evidence").focus();
}
function render() {
  $("statements").replaceChildren();
  fields.clear();
  for (const [index, s] of statements.entries()) {
    const section = make("section");
    section.className = "statement";
    section.append(make("h3", s.id), make("p", s.text));
    const refs = make("div");
    refs.className = "citation-links";
    for (const ref of s.evidenceRefs) {
      const b = make("button", `Inspect ${ref}`);
      b.type = "button";
      b.addEventListener("click", () => inspect(ref, true));
      refs.append(b);
    }
    const label = make("label", `Review verdict for ${s.id}`);
    label.htmlFor = `verdict-${index}`;
    const select = make("select");
    select.id = label.htmlFor;
    select.setAttribute("form", "review-form");
    for (const [value, text] of [
      ["not-reviewed", "Not reviewed"],
      ["supported", "Supported by cited evidence"],
      ["unsupported", "Not supported by cited evidence"],
      ["unclear", "Unclear / needs clarification"],
    ]) {
      const o = make("option", text);
      o.value = value;
      select.append(o);
    }
    const why = make("label", `Review rationale for ${s.id}`);
    why.htmlFor = `rationale-${index}`;
    const textarea = make("textarea");
    textarea.id = why.htmlFor;
    textarea.maxLength = 1500;
    textarea.rows = 2;
    textarea.setAttribute("form", "review-form");
    select.addEventListener("change", () => {
      textarea.required = select.value !== "not-reviewed";
      $("human-status").textContent =
        "Unsaved local review edits. No approval granted.";
    });
    section.append(refs, label, select, why, textarea);
    fields.set(s.id, { select, textarea });
    $("statements").append(section);
  }
  $("future-evidence").replaceChildren(
    ...artifact.brief.interpretation.wouldChangeDecision.map((s) =>
      make("li", s),
    ),
  );
  $("evidence-select").replaceChildren(
    ...Object.keys(artifact.brief.packet.evidence).map((ref) => {
      const o = make("option", ref);
      o.value = ref;
      return o;
    }),
  );
  inspect(Object.keys(artifact.brief.packet.evidence)[0]);
  $("review-form").reset();
  $("review-file").value = "";
  $("human-status").textContent =
    "No human review loaded. Commentary is not execution approval.";
  $("artifact-review").hidden = false;
}
$("evidence-select").addEventListener("change", (event) =>
  inspect(event.target.value),
);
document.addEventListener("decision-trace-cleared", () => {
  version++;
  artifact = undefined;
  $("artifact-review").hidden = true;
});
document.addEventListener("decision-trace-loaded", async (event) => {
  const current = ++version;
  $("artifact-review").hidden = true;
  $("artifact-status").textContent = "Checking decision artifact…";
  try {
    const value = event.detail.artifact;
    const list = await checkArtifact(value);
    if (
      canonical(value.brief.packet.request) !== canonical(event.detail.request)
    )
      throw new Error(
        "Artifact question/scenario does not match this run record.",
      );
    if (current !== version) return;
    artifact = value;
    statements = list;
    render();
    $("artifact-status").textContent =
      "Artifact hashes match; citation references resolve. Interpretation is NOT semantically validated. Human review remains separate.";
  } catch (error) {
    if (current === version) $("artifact-status").textContent = error.message;
  }
});
$("review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!artifact) return;
  const current = version;
  const body = {
    format: "bio-harness.scientific-review.v1",
    artifactHash: artifact.artifactHash,
    reviewer: $("reviewer").value.trim(),
    reviewedAt: new Date().toISOString(),
    statements: statements.map((s) => ({
      id: s.id,
      verdict: fields.get(s.id).select.value,
      rationale: fields.get(s.id).textarea.value.trim(),
    })),
    unresolvedConcerns: $("concerns").value.trim(),
    authority,
  };
  if (
    !body.reviewer ||
    !body.unresolvedConcerns ||
    body.statements.some((s) => s.verdict !== "not-reviewed" && !s.rationale)
  ) {
    $("human-status").textContent =
      "Enter reviewer, concerns and a rationale for every reviewed statement.";
    return;
  }
  const result = { ...body, reviewHash: await jsonDigest(body) };
  if (current !== version) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = make("a");
  link.href = url;
  link.download = `scientific-review-${result.reviewHash}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("human-status").textContent =
    `Review notes downloaded; ${body.statements.filter((s) => s.verdict !== "not-reviewed").length}/${body.statements.length} statements reviewed. Self-attested, not approval.`;
});
document.addEventListener("input", (event) => {
  if (event.target.form?.id === "review-form")
    $("human-status").textContent =
      "Unsaved local review edits. No approval granted.";
});
let reviewSequence = 0;
$("review-file").addEventListener("change", async (event) => {
  const sequence = ++reviewSequence,
    current = version;
  const file = event.target.files?.[0];
  if (!file || !artifact) return;
  $("review-file").removeAttribute("aria-invalid");
  try {
    if (file.size > 100000) throw new Error("Review exceeds 100 KB.");
    const review = JSON.parse(await file.text());
    const { reviewHash, ...body } = review;
    if ((await jsonDigest(body)) !== reviewHash)
      throw new Error("Review hash mismatch.");
    if (current !== version || sequence !== reviewSequence) return;
    if (
      Object.keys(body).some(
        (key) =>
          ![
            "format",
            "artifactHash",
            "reviewer",
            "reviewedAt",
            "statements",
            "unresolvedConcerns",
            "authority",
          ].includes(key),
      )
    )
      throw new Error("Unexpected review field.");
    if (
      body.format !== "bio-harness.scientific-review.v1" ||
      body.authority !== authority ||
      body.artifactHash !== artifact.artifactHash
    )
      throw new Error("Review belongs to another artifact or is unsupported.");
    if (
      typeof body.reviewer !== "string" ||
      !body.reviewer.trim() ||
      body.reviewer.length > 120 ||
      typeof body.unresolvedConcerns !== "string" ||
      !body.unresolvedConcerns.trim() ||
      body.unresolvedConcerns.length > 3000 ||
      !Number.isFinite(Date.parse(body.reviewedAt)) ||
      !Array.isArray(body.statements) ||
      body.statements.length !== statements.length ||
      new Set(body.statements.map((s) => s.id)).size !== statements.length
    )
      throw new Error("Invalid review fields.");
    for (const s of body.statements)
      if (
        !fields.has(s.id) ||
        !["not-reviewed", "supported", "unsupported", "unclear"].includes(
          s.verdict,
        ) ||
        typeof s.rationale !== "string" ||
        s.rationale.length > 1500 ||
        (s.verdict !== "not-reviewed" && !s.rationale.trim())
      )
        throw new Error("Invalid statement review.");
    $("reviewer").value = body.reviewer;
    $("concerns").value = body.unresolvedConcerns;
    for (const s of body.statements) {
      const { select, textarea } = fields.get(s.id);
      select.value = s.verdict;
      textarea.value = s.rationale;
      textarea.required = s.verdict !== "not-reviewed";
    }
    $("human-status").textContent =
      `Self-attested review by ${body.reviewer}, ${body.reviewedAt}; ${body.statements.filter((s) => s.verdict !== "not-reviewed").length}/${statements.length} statements reviewed. Qualifications not verified. No approval granted.`;
  } catch (error) {
    if (current === version && sequence === reviewSequence) {
      $("review-file").setAttribute("aria-invalid", "true");
      $("human-status").textContent =
        `Review not opened: ${error.message}. Current form entries are unchanged.`;
    }
  }
});
