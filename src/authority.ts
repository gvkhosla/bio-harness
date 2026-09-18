import { hash } from "./contracts.js";
const definitions = {
  "cfps-decision": {
    title: "Restricted CFPS decision session",
    tools: ["bio_cfps_decision_context", "bio_cfps_submit_decision"],
    can: [
      "Inspect the bound public evidence packet",
      "Submit an unapproved review interpretation",
    ],
    cannot: [
      "Read or mutate campaign storage",
      "Approve plans or import results",
      "Execute experiments or send orders",
      "Use arbitrary files, shell, network or instruments",
    ],
    approval: "Unavailable; a review attachment never grants approval.",
    execution: "Unavailable; no plan or order is created.",
    runnerWrites:
      "Operator runner saves local traces, Pi sessions and review artifacts; tools do not choose output paths.",
  },
  campaign: {
    title: "General campaign agent",
    tools: [
      "bio_capabilities",
      "bio_cfps_plate",
      "bio_cfps_condition",
      "bio_cfps_well",
      "bio_campaigns",
      "bio_create",
      "bio_inspect",
      "bio_propose",
      "bio_validate",
      "bio_execute_approved",
      "bio_analyze",
      "bio_next",
    ],
    can: [
      "Inspect campaigns and pinned CFPS evidence",
      "Create campaigns and propose/validate plans",
      "Execute already-approved simulation or unsent manual handoff",
      "Analyze results and draft simulation follow-ups",
    ],
    cannot: [
      "Approve plans or import results",
      "Place provider orders or control instruments",
      "Use arbitrary files, shell or network",
      "Turn CFPS evidence into an executable CFPS plan",
    ],
    approval:
      "Exact-plan approval must already exist, supplied outside the agent. Actual approval state requires campaign inspection; this profile is not an approval.",
    execution:
      "Synthetic simulation or local unsent handoff only; never live laboratory execution.",
    runnerWrites:
      "Local campaign state, audit events and Pi sessions may change. This agent is NOT read-only.",
  },
} as const;
export type AuthorityScope = keyof typeof definitions;
export function authorityProfile(
  scope: AuthorityScope,
  actualTools: readonly string[] = definitions[scope].tools,
) {
  const definition = definitions[scope];
  if (
    actualTools.length !== definition.tools.length ||
    new Set(actualTools).size !== actualTools.length ||
    actualTools.some(
      (name) => !(definition.tools as readonly string[]).includes(name),
    )
  )
    throw new Error(
      `Tool registration does not match ${scope} authority profile`,
    );
  const body = {
    scope,
    version: 1,
    ...structuredClone(definition),
    tools: [...actualTools],
    boundary:
      "Tool-surface declaration, not OS sandboxing, authenticated authorization or provider acceptance.",
  };
  return { ...body, profileHash: hash(body) };
}
