import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  capabilities,
  hash,
  layout,
  planSchema,
  resultSchema,
  validatePlan,
  type Plan,
} from "./contracts.js";
import { Store, type Campaign, type Draft, type Run } from "./store.js";
import { simulate, handoff } from "./adapters.js";
import { analyze } from "./analysis.js";

const now = () => new Date().toISOString();
const actorSchema = z.string().trim().min(1).max(200);
function draftFor(c: Campaign, id: string) {
  const draft = c.drafts.find((d) => d.id === id);
  if (!draft) throw new Error(`Draft not found: ${id}`);
  return draft;
}
function runFor(c: Campaign, id: string) {
  const run = c.runs.find((r) => r.id === id);
  if (!run) throw new Error(`Run not found: ${id}`);
  return run;
}

export class Harness {
  constructor(readonly store: Store) {}
  capabilities() {
    return capabilities;
  }
  create(
    input: { title: string; objective: string; simulationBudgetCents: number },
    actor = "operator",
  ) {
    const data = z
      .object({
        title: z.string().trim().min(1).max(200),
        objective: z.string().trim().min(1).max(2000),
        simulationBudgetCents: z.number().int().min(0).max(100000000),
      })
      .strict()
      .parse(input);
    return this.store.create(
      {
        ...data,
        id: randomUUID(),
        createdAt: now(),
        simulationSpentCents: 0,
        drafts: [],
        runs: [],
      },
      actorSchema.parse(actor),
    );
  }
  inspect(id: string) {
    this.store.verify(id);
    return this.store.get(id);
  }
  list() {
    return this.store.list().map((c) => ({
      id: c.id,
      title: c.title,
      drafts: c.drafts.length,
      runs: c.runs.length,
      simulationBudgetCents: c.simulationBudgetCents,
      simulationSpentCents: c.simulationSpentCents,
    }));
  }
  propose(id: string, input: unknown, actor = "operator") {
    const plan = planSchema.parse(input);
    return this.store.mutate(
      id,
      "plan.proposed",
      actorSchema.parse(actor),
      (c) => {
        const draft: Draft = {
          id: randomUUID(),
          plan,
          hash: hash(plan),
          createdAt: now(),
          status: "draft",
        };
        c.drafts.push(draft);
        return {
          result: draft,
          detail: { draftId: draft.id, planHash: draft.hash },
        };
      },
    );
  }
  validate(id: string, draftId: string, actor = "operator") {
    return this.store.mutate(
      id,
      "plan.validated",
      actorSchema.parse(actor),
      (c) => {
        const draft = draftFor(c, draftId);
        if (!["draft", "validated"].includes(draft.status))
          throw new Error("Only draft or validated plans can be validated");
        const validation = validatePlan(draft.plan);
        if (
          validation.estimatedCostCents !== null &&
          validation.estimatedCostCents >
            c.simulationBudgetCents - c.simulationSpentCents
        ) {
          validation.errors.push("Insufficient remaining simulation budget");
          validation.valid = false;
        }
        draft.validation = validation;
        draft.status = validation.valid ? "validated" : "draft";
        return { result: validation, detail: { draftId, ...validation } };
      },
    );
  }
  /** Deliberately absent from all agent tools. Local operator approval, not enterprise authentication. */
  approve(id: string, draftId: string, expectedHash: string, by: string) {
    return this.store.mutate(
      id,
      "plan.approved",
      actorSchema.parse(by),
      (c) => {
        const draft = draftFor(c, draftId);
        if (draft.status !== "validated")
          throw new Error("Validate the plan before approval");
        if (draft.hash !== expectedHash || hash(draft.plan) !== expectedHash)
          throw new Error(
            "Approval hash mismatch; review the exact current plan",
          );
        const report = validatePlan(draft.plan);
        if (!report.valid) throw new Error(report.errors.join("; "));
        if (
          report.estimatedCostCents !== null &&
          report.estimatedCostCents >
            c.simulationBudgetCents - c.simulationSpentCents
        )
          throw new Error("Insufficient remaining simulation budget");
        draft.approval = {
          by,
          at: now(),
          hash: expectedHash,
          scope:
            draft.plan.backend === "simulator" ? "simulation" : "handoff-only",
        };
        draft.status = "approved";
        return { result: draft, detail: { draftId, ...draft.approval } };
      },
    );
  }
  execute(id: string, draftId: string, actor = "operator"): Run {
    return this.store.mutate(
      id,
      "run.requested",
      actorSchema.parse(actor),
      (c) => {
        const draft = draftFor(c, draftId);
        const existing = c.runs.find((r) => r.draftId === draftId);
        if (existing)
          return {
            result: existing,
            detail: { runId: existing.id, idempotentReplay: true },
          };
        if (
          draft.status !== "approved" ||
          !draft.approval ||
          draft.approval.hash !== hash(draft.plan)
        )
          throw new Error(
            "Exact plan requires operator approval before execution/export",
          );
        const validation = validatePlan(draft.plan);
        if (!validation.valid) throw new Error(validation.errors.join("; "));
        const cost = validation.estimatedCostCents;
        if (
          cost !== null &&
          c.simulationSpentCents + cost > c.simulationBudgetCents
        )
          throw new Error("Simulation budget exceeded");
        const run: Run = {
          id: randomUUID(),
          draftId,
          planHash: draft.hash,
          backend: draft.plan.backend,
          status:
            draft.plan.backend === "simulator"
              ? "completed"
              : "awaiting_external_results",
          createdAt: now(),
          costCents: cost,
          wells: layout(draft.plan),
        };
        if (draft.plan.backend === "simulator") {
          run.results = simulate(draft.plan, run);
          run.resultsHash = hash(run.results);
          c.simulationSpentCents += cost!;
        }
        draft.status = "executed";
        c.runs.push(run);
        return {
          result: run,
          detail: {
            runId: run.id,
            draftId,
            planHash: run.planHash,
            status: run.status,
            costCents: cost,
            liveSubmission: false,
          },
        };
      },
    );
  }
  exportHandoff(id: string, runId: string) {
    const c = this.inspect(id);
    const run = runFor(c, runId);
    if (run.backend !== "ginkgo-handoff" || run.status === "cancelled")
      throw new Error("An active Ginkgo handoff run is required");
    return handoff(c, draftFor(c, run.draftId), run);
  }
  importResults(id: string, input: unknown, by: string) {
    const results = resultSchema.parse(input);
    return this.store.mutate(
      id,
      "results.imported",
      actorSchema.parse(by),
      (c) => {
        const run = runFor(c, results.runId);
        const draft = draftFor(c, run.draftId);
        if (run.backend !== "ginkgo-handoff" || results.source !== "external")
          throw new Error(
            "Only external results for handoff runs can be imported",
          );
        if (
          run.planHash !== results.planHash ||
          draft.plan.endpoint.unit !== results.unit
        )
          throw new Error("Result plan hash or endpoint unit mismatch");
        if (run.results) {
          if (run.resultsHash !== hash(results))
            throw new Error(
              "Results are immutable; conflicting reimport rejected",
            );
          return {
            result: run,
            detail: { runId: run.id, idempotentReplay: true },
          };
        }
        if (run.status !== "awaiting_external_results")
          throw new Error("Run is not awaiting results");
        const seen = new Set<string>();
        for (const observation of results.observations) {
          const expected = run.wells.find((w) => w.well === observation.well);
          if (
            !expected ||
            expected.conditionId !== observation.conditionId ||
            seen.has(observation.well)
          )
            throw new Error(
              "Unknown, duplicate, or mismatched well in results",
            );
          seen.add(observation.well);
        }
        if (seen.size !== run.wells.length)
          throw new Error(
            "Incomplete results: every planned well must be represented (use qc=fail for failed measurements)",
          );
        run.results = results;
        run.resultsHash = hash(results);
        run.importedBy = by;
        run.status = "completed";
        return {
          result: run,
          detail: {
            runId: run.id,
            resultsHash: run.resultsHash,
            providerRunId: results.providerRunId,
            authenticity: "operator-attested, not provider-verified",
          },
        };
      },
    );
  }
  cancel(id: string, draftId: string, by: string) {
    return this.store.mutate(
      id,
      "plan.cancelled",
      actorSchema.parse(by),
      (c) => {
        const draft = draftFor(c, draftId);
        const run = c.runs.find((r) => r.draftId === draftId);
        if (run?.status === "completed")
          throw new Error("Completed work cannot be cancelled or undone");
        draft.status = "cancelled";
        delete draft.approval;
        if (run) run.status = "cancelled";
        return {
          result: draft,
          detail: {
            draftId,
            notice:
              "Local cancellation only; no provider order was submitted or cancelled.",
          },
        };
      },
    );
  }
  analyze(id: string, runId: string) {
    const c = this.inspect(id);
    const run = runFor(c, runId);
    if (!run.results || run.status !== "completed")
      throw new Error("Completed results are required for analysis");
    return analyze(draftFor(c, run.draftId).plan, run.results);
  }
  next(id: string, runId: string, actor = "operator") {
    const c = this.inspect(id);
    const run = runFor(c, runId);
    const previous = draftFor(c, run.draftId).plan;
    const analysis = this.analyze(id, runId);
    if (analysis.qc !== "pass")
      throw new Error("QC failed; no follow-up ranking is permitted");
    if (run.backend !== "simulator")
      throw new Error(
        "Automatic next-plan generation is simulation-only; propose an expert-reviewed external follow-up",
      );
    const leader = previous.conditions.find(
      (condition) => condition.id === analysis.ranking[0]!.conditionId,
    )!;
    const plan: Plan = {
      ...previous,
      title: `Follow-up: ${previous.title}`.slice(0, 2000),
      hypothesis: `Confirm the descriptive leader ${leader.id} and explore nearby normalized levels. Synthetic heuristic, not a validated optimizer.`,
      conditions: [
        ...previous.conditions.filter((c) => c.role !== "test"),
        ...[-0.1, 0, 0.1].map((offset, i) => ({
          id: `followup_${i}`,
          label: `Refinement ${i + 1}`,
          role: "test" as const,
          level: Math.max(0, Math.min(1, leader.level + offset)),
        })),
      ],
      randomizationSeed: (previous.randomizationSeed + 1) % 2147483648,
    };
    return this.propose(id, plan, actor);
  }
}
