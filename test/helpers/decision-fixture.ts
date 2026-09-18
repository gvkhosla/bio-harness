import {
  prepareDecisionPacket,
  assembleDecisionBrief,
  decisionArtifact,
} from "../../src/cfps-decision.js";
/** Authored offline test prose, NOT captured model output or a scientist review. */
export function decisionFixture() {
  const request = {
    question: "Offline test: why not pick sample 9?",
    scenario: "original",
    strategy: "confirm",
  };
  const packet = prepareDecisionPacket(request);
  const brief = assembleDecisionBrief(request, {
    packetHash: packet.packetHash,
    interpretation: {
      assessment: [
        {
          text: "Ranking alone does not establish superiority; the flagged well is excluded under local policy.",
          evidenceRefs: packet.requiredRefs,
        },
      ],
      recommendation: {
        text: "Seek an independently reviewed confirmation rather than declaring a winner.",
        evidenceRefs: ["condition:9", "condition:5"],
      },
      uncertainties: [
        {
          text: "A source flag does not establish its physical cause; independence and assay qualification remain unresolved.",
          evidenceRefs: ["well:J21", "plate:qc"],
        },
      ],
      wouldChangeDecision: [
        "Independent evidence showing a different ordering would change this judgment.",
      ],
    },
  });
  return decisionArtifact(brief, {
    provider: "offline-test",
    model: "not-a-model",
    sessionId: "authored-test-fixture",
  });
}
