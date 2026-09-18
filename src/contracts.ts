import { createHash } from "node:crypto";
import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
export const conditionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
    label: text,
    role: z.enum(["negative_control", "positive_control", "test"]),
    level: z.number().finite().min(0).max(1),
  })
  .strict();

/** An intent contract, deliberately not an executable wet-lab protocol. */
export const planSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: text,
    question: text,
    hypothesis: text,
    backend: z.enum(["simulator", "ginkgo-handoff"]),
    workflow: z.literal("phenotype-screen-v1"),
    sample: z
      .object({
        model: text,
        source: text,
        biosafetyReview: text,
      })
      .strict(),
    endpoint: z
      .object({
        name: text,
        unit: z.literal("a.u."),
        direction: z.enum(["maximize", "minimize"]),
      })
      .strict(),
    conditions: z.array(conditionSchema).min(3).max(24),
    replicates: z.number().int().min(3).max(12),
    replicateType: z.enum(["technical", "biological"]),
    randomizationSeed: z.number().int().min(0).max(2147483647),
    analysisPlan: text,
    references: z.array(z.string().url()).max(20),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Well = { well: string; conditionId: string; replicate: number };

export const observationSchema = z
  .object({
    well: z.string().regex(/^[A-H](?:[1-9]|1[0-2])$/),
    conditionId: z.string(),
    value: z.number().finite(),
    qc: z.enum(["pass", "fail"]),
  })
  .strict();
export const resultSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().uuid(),
    planHash: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.enum(["simulation", "external"]),
    providerRunId: text,
    measuredAt: z.string().datetime({ offset: true }),
    unit: z.literal("a.u."),
    observations: z.array(observationSchema).min(1).max(96),
    notes: z.string().max(5000),
  })
  .strict();
export type Results = z.infer<typeof resultSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function layout(plan: Plan): Well[] {
  const samples = plan.conditions.flatMap((c) =>
    Array.from({ length: plan.replicates }, (_, i) => ({
      conditionId: c.id,
      replicate: i + 1,
    })),
  );
  if (samples.length > 96) throw new Error("Plan exceeds one 96-well plate");
  const positions = Array.from(
    { length: 96 },
    (_, i) => `${String.fromCharCode(65 + Math.floor(i / 12))}${(i % 12) + 1}`,
  );
  const random = rng(plan.randomizationSeed);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return samples.map((s, i) => ({ ...s, well: positions[i]! }));
}

export function validatePlan(plan: Plan) {
  const errors: string[] = [];
  const ids = plan.conditions.map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    errors.push("Condition IDs must be unique");
  for (const role of ["negative_control", "positive_control"] as const) {
    if (plan.conditions.filter((c) => c.role === role).length !== 1)
      errors.push(`Exactly one ${role} is required`);
  }
  if (!plan.conditions.some((c) => c.role === "test"))
    errors.push("At least one test condition is required");
  const wells = plan.conditions.length * plan.replicates;
  if (wells > 96) errors.push("Plan exceeds one 96-well plate");
  return {
    valid: errors.length === 0,
    errors,
    wells,
    estimatedCostCents: plan.backend === "simulator" ? wells * 200 : null,
    warnings: [
      "Local intent checks are not scientific, biosafety, or provider qualification.",
      plan.replicateType === "technical"
        ? "Technical replicates do not establish biological replication."
        : "Biological independence must be established by the laboratory.",
      plan.backend === "simulator"
        ? "Synthetic response function; costs are fictional. No biological predictions."
        : "Handoff only. No Ginkgo API, quotation, approval, or live execution is configured.",
    ],
  };
}

export const capabilities = [
  {
    id: "simulator",
    mode: "synthetic",
    workflow: "phenotype-screen-v1",
    maxWells: 96,
    note: "Seeded toy response, arbitrary units, fictional $2/well. Not a cell model.",
  },
  {
    id: "ginkgo-handoff",
    mode: "manual-handoff",
    workflow: "phenotype-screen-v1",
    note: "Exports a local request bundle. This is NOT a Ginkgo-certified workflow or API format. Qualification, SOP, quote, and ordering happen outside this application.",
  },
];

export function examplePlan(backend: Plan["backend"] = "simulator"): Plan {
  return {
    schemaVersion: 1,
    title: "Phenotype response pilot",
    question:
      "Which candidate condition has the strongest reproducible readout?",
    hypothesis:
      "An intermediate normalized factor level will maximize the readout.",
    backend,
    workflow: "phenotype-screen-v1",
    sample: {
      model: "Synthetic cell-phenotype fixture",
      source: "Local simulator; no physical samples",
      biosafetyReview:
        "Simulation only. Provider review required before any real work.",
    },
    endpoint: { name: "phenotype_score", unit: "a.u.", direction: "maximize" },
    conditions: [
      {
        id: "vehicle",
        label: "Negative control",
        role: "negative_control",
        level: 0,
      },
      {
        id: "reference",
        label: "Positive control",
        role: "positive_control",
        level: 1,
      },
      { id: "low", label: "Candidate A", role: "test", level: 0.2 },
      { id: "mid", label: "Candidate B", role: "test", level: 0.5 },
      { id: "high", label: "Candidate C", role: "test", level: 0.8 },
    ],
    replicates: 4,
    replicateType: "technical",
    randomizationSeed: 42,
    analysisPlan:
      "Exclude QC-failed wells, require three passing replicates per condition and separated controls. Rank descriptive means; confirm independently. No causal or significance claims.",
    references: [],
  };
}
