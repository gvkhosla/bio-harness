const $ = (id) => document.getElementById(id);
const make = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
let profiles = [];
let recorded;
function renderRecord() {
  if (!recorded) return;
  const registered = recorded.authority?.registered;
  const known = profiles.find((p) => p.scope === registered?.scope);
  const matches =
    known &&
    Array.isArray(registered.tools) &&
    JSON.stringify([...registered.tools].sort()) ===
      JSON.stringify([...known.tools].sort());
  $("authority-scenario").textContent =
    `Loaded record scenario: ${recorded.request?.scenario ?? "not recorded"}. Independent of the workbench selector.`;
  $("authority-record").textContent = registered
    ? matches
      ? `Recorded session: ${known.title}. Registered tools: ${registered.tools.join(", ")}. Registration is recorded locally, not authenticated by this viewer.`
      : "Unrecognized recorded toolset. Do not infer permissions from this record."
    : "No session tool registration recorded. This may be a preflight failure or an older record; do not infer an active agent.";
}
document.addEventListener("replay-scenario-loaded", (event) => {
  $("authority-scenario").textContent =
    `Browser scenario: ${event.detail}. Does not change an agent session or loaded record.`;
});
document.addEventListener("decision-trace-cleared", () => {
  recorded = undefined;
  $("authority-scenario").textContent =
    "No run selected. The workbench selector is independent.";
  $("authority-record").textContent = "No session registration inspected.";
});
document.addEventListener("decision-trace-loaded", (event) => {
  recorded = event.detail;
  renderRecord();
});
if (document.body.dataset.scenario)
  $("authority-scenario").textContent =
    `Browser scenario: ${document.body.dataset.scenario}. Agent sessions are independent.`;
try {
  const response = await fetch("/api/authority", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Permission profiles unavailable");
  profiles = (await response.json()).profiles;
  const nodes = [];
  for (const profile of profiles) {
    const section = document.createElement("section");
    section.append(
      make("h3", profile.title),
      make("p", `Can: ${profile.can.join("; ")}.`),
      make("p", `Cannot: ${profile.cannot.join("; ")}.`),
      make("p", profile.approval),
      make("p", profile.execution),
      make("p", profile.runnerWrites),
    );
    const tools = document.createElement("details");
    tools.append(
      make("summary", `Inspect ${profile.tools.length} allowed tool names`),
      make("p", profile.tools.join(", ")),
    );
    section.append(tools);
    nodes.push(section);
  }
  $("authority-profiles").replaceChildren(...nodes);
  renderRecord();
} catch {
  $("authority-profiles").textContent =
    "Could not load permission metadata. This browser still has no approval or laboratory execution controls. Reload the local page to retry.";
}
