export const make = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
export const $ = (id) => document.getElementById(id);
export async function jsonDigest(value) {
  return textDigest(JSON.stringify(value));
}
export async function textDigest(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function inspectJson(label, value) {
  const details = make("details");
  details.append(
    make("summary", label),
    make("pre", JSON.stringify(value, null, 2)),
  );
  return details;
}
async function validate(record) {
  if (
    !record ||
    record.format !== "bio-harness.decision-trace.v1" ||
    !["running", "completed", "failed"].includes(record.status) ||
    typeof record.runId !== "string" ||
    !Array.isArray(record.events) ||
    record.events.length > 200
  )
    throw new Error(
      "Unsupported run record. Select a .trace.json exported by this harness.",
    );
  for (const [i, event] of record.events.entries()) {
    if (
      !event ||
      event.sequence !== i + 1 ||
      typeof event.phase !== "string" ||
      !["started", "ok", "rejected"].includes(event.state) ||
      typeof event.at !== "string" ||
      (event.elapsedMs !== null &&
        (!Number.isFinite(event.elapsedMs) || event.elapsedMs < 0))
    )
      throw new Error("Invalid timeline event.");
  }
  const { traceHash, ...body } = record;
  if ((await jsonDigest(body)) !== traceHash)
    throw new Error(
      "Run record hash mismatch. Do not trust an edited or damaged file; reopen the original export.",
    );
}
function render(record) {
  const facts = {
    Question: record.request?.question ?? "Not recorded",
    Scenario: record.request?.scenario ?? "Not recorded",
    Direction: record.request?.strategy ?? "Not recorded",
    Status: record.status,
    "Run ID": record.runId,
    Model: record.model
      ? `${record.model.provider}/${record.model.model}`
      : "Not initialized",
    "Pi session": record.model?.sessionId ?? "None recorded",
    "Elapsed time":
      record.elapsedMs === null ? "Incomplete" : `${record.elapsedMs} ms`,
    Cost: record.cost,
  };
  $("run-facts").replaceChildren(
    ...Object.entries(facts).flatMap(([label, value]) => [
      make("dt", label),
      make("dd", String(value)),
    ]),
  );
  $("timeline").replaceChildren(
    ...record.events.map((event) => {
      const item = make("li");
      item.className = event.state === "rejected" ? "rejected" : "";
      item.append(
        make("h3", `${event.phase} · ${event.state}`),
        make(
          "p",
          `${event.at}${event.elapsedMs === null ? "" : ` · ${event.elapsedMs} ms`} · step ${event.span}`,
        ),
        inspectJson(
          event.state === "started"
            ? "Inspect input"
            : "Inspect output / error",
          event.payload,
        ),
      );
      return item;
    }),
  );
  $("trace-content").hidden = false;
  document.dispatchEvent(
    new CustomEvent("decision-trace-loaded", { detail: record }),
  );
}
let loadSequence = 0;
$("trace-file").addEventListener("change", async (event) => {
  const sequence = ++loadSequence;
  $("trace-content").hidden = true;
  document.dispatchEvent(new Event("decision-trace-cleared"));
  $("trace-file").removeAttribute("aria-invalid");
  const file = event.target.files?.[0];
  if (!file) {
    $("trace-status").textContent = "No run selected.";
    return;
  }
  $("trace-status").textContent = "Checking the local record…";
  try {
    if (file.size > 5_000_000)
      throw new Error(
        "File exceeds 5 MB. Choose a bounded decision trace, not a session transcript.",
      );
    const record = JSON.parse(await file.text());
    await validate(record);
    if (sequence !== loadSequence) return;
    render(record);
    $("trace-status").textContent =
      `${file.name} · local record hash matches. Not an authenticity or scientific correctness check.`;
  } catch (error) {
    if (sequence !== loadSequence) return;
    $("trace-file").setAttribute("aria-invalid", "true");
    $("trace-status").textContent = `Record not opened: ${error.message}`;
  }
});
