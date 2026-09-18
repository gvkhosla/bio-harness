import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { authorityProfile } from "./authority.js";

type Event = {
  sequence: number;
  at: string;
  phase: string;
  state: "started" | "ok" | "rejected";
  span: number;
  elapsedMs: number | null;
  payload: unknown;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function capture(value: unknown): unknown {
  const text = JSON.stringify(value ?? null);
  // Only tool I/O and runner metadata; no thinking stream or credential-store reads.
  // Questions and tool payloads can still contain sensitive user-supplied text.
  if (text.length > 100000)
    return {
      truncated: true,
      characters: text.length,
      sha256: digest(value),
      preview: text.slice(0, 100000),
    };
  return JSON.parse(text);
}
export function traceError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(
      /\b(?:sk-[\w-]{16,}|(?:ghp|gho|github_pat)_[\w-]{16,})/g,
      "[redacted credential]",
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 2000);
}

/** Atomic local checkpoints, not signed or provider-authenticated audit records. */
export class DecisionTrace {
  readonly path: string;
  private readonly started = performance.now();
  private data = {
    format: "bio-harness.decision-trace.v1",
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running" as "running" | "completed" | "failed",
    request: null as unknown,
    model: null as unknown,
    authority: {
      declared: authorityProfile("cfps-decision"),
      registered: null as ReturnType<typeof authorityProfile> | null,
    },
    events: [] as Event[],
    artifact: null as unknown,
    elapsedMs: null as number | null,
    cost: "Not collected; no zero-cost claim. Model calls may incur costs.",
    boundary:
      "Local unsigned run record. No model thinking recorded. A running record may be interrupted or incomplete. Source integrity is not provider authentication. Inspect private questions/tool inputs before sharing.",
  };
  constructor(stateDir: string, request: unknown) {
    const dir = join(stateDir, "traces");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.path = join(dir, `${this.data.runId}.trace.json`);
    this.data.request = capture(request);
    this.persist();
  }
  private persist() {
    const record = { ...this.data, traceHash: digest(this.data) };
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(record) + "\n", {
      mode: 0o600,
    });
    renameSync(temporary, this.path);
  }
  private event(
    phase: string,
    state: Event["state"],
    span: number,
    elapsedMs: number | null,
    payload: unknown,
  ) {
    if (this.data.status !== "running")
      throw new Error("Trace already finalized");
    if (this.data.events.length >= 200)
      throw new Error("Trace event limit exceeded; stopping this run");
    this.data.events.push({
      sequence: this.data.events.length + 1,
      at: new Date().toISOString(),
      phase,
      state,
      span,
      elapsedMs,
      payload: capture(payload),
    });
    this.persist();
  }
  start(phase: string, input: unknown = null) {
    const span = this.data.events.length + 1;
    const start = performance.now();
    this.event(phase, "started", span, null, input);
    let finished = false;
    return (output: unknown, rejected = false) => {
      if (finished) throw new Error("Trace span already finished");
      this.event(
        phase,
        rejected ? "rejected" : "ok",
        span,
        Math.round(performance.now() - start),
        output,
      );
      finished = true;
    };
  }
  registeredAuthority(profile: ReturnType<typeof authorityProfile>) {
    this.data.authority.registered = structuredClone(profile);
    this.persist();
  }
  model(identity: unknown) {
    this.data.model = capture(identity);
    this.persist();
  }
  finish(status: "completed" | "failed", artifact: unknown = null) {
    if (this.data.status !== "running")
      throw new Error("Trace already finalized");
    this.data.status = status;
    this.data.artifact = capture(artifact);
    this.data.elapsedMs = Math.round(performance.now() - this.started);
    this.persist();
  }
}
