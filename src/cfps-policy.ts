import { hash } from "./contracts.js";

/** A versioned local screening rulebook, not a provider acceptance specification. */
export function cfpsPolicy() {
  const body = {
    id: "bio-harness.cfps-local-screen",
    version: 1,
    minimumEligibleWells: 3,
    minimumCalibrationR2: 0.98,
    rules: [
      {
        id: "exclude-source-flag",
        statement:
          "Exclude a well carrying any source flag; do not infer the flag's physical cause.",
      },
      {
        id: "exclude-missing-reading",
        statement:
          "Exclude a well with missing concentration or fluorescence; never replace a missing value with zero.",
      },
      {
        id: "exclude-demo-flag",
        statement:
          "Exclude a well carrying an explicitly injected demonstration flag; keep source measurements unchanged.",
      },
      {
        id: "minimum-replication",
        statement:
          "Require at least three eligible wells per candidate and named target control. These are not independent biological repeats.",
      },
      {
        id: "calibration-r2",
        statement:
          "Require source-reported calibration R² of at least 0.98. Do not claim independently recomputed calibration.",
      },
    ],
    summary:
      "Demo screening policy, not Ginkgo acceptance: exclude every source-flagged or missing measurement; require ≥3 remaining wells per candidate and named target control, plus source-reported calibration R² ≥0.98. No negative-control separation or assay qualification is inferred.",
    unknowns: [
      "Physical causes of source flags",
      "Independent biological repeatability",
      "Assay-qualified acceptance criteria",
      "Negative-control separation",
    ],
  };
  return { ...body, policyHash: hash(body) };
}
export function screenMeasurement(well: {
  concentration: number | null;
  fluorescence: number | null;
  sourceFlags: string[];
  demoFlags: string[];
}) {
  const reasons = [
    ...well.sourceFlags.map((flag) => ({
      ruleId: "exclude-source-flag",
      origin: "source-flag",
      explanation: `Source flag: ${flag}`,
    })),
    ...well.demoFlags.map((flag) => ({
      ruleId: "exclude-demo-flag",
      origin: "local-demonstration",
      explanation: flag,
    })),
    ...(well.concentration === null
      ? [
          {
            ruleId: "exclude-missing-reading",
            origin: "missing-source-value",
            explanation: "Missing concentration",
          },
        ]
      : []),
    ...(well.fluorescence === null
      ? [
          {
            ruleId: "exclude-missing-reading",
            origin: "missing-source-value",
            explanation: "Missing fluorescence",
          },
        ]
      : []),
  ];
  return {
    eligible: reasons.length === 0,
    reasons,
    unknownCause: well.sourceFlags.length > 0,
  };
}
