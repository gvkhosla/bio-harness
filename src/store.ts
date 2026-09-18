import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hash, type Plan, type Results, type Well } from "./contracts.js";

export type Draft = {
  id: string;
  plan: Plan;
  hash: string;
  createdAt: string;
  status: "draft" | "validated" | "approved" | "executed" | "cancelled";
  validation?: ReturnType<typeof import("./contracts.js").validatePlan>;
  approval?: {
    by: string;
    hash: string;
    at: string;
    scope: "simulation" | "handoff-only";
  };
};
export type Run = {
  id: string;
  draftId: string;
  planHash: string;
  backend: Plan["backend"];
  status: "completed" | "awaiting_external_results" | "cancelled";
  createdAt: string;
  costCents: number | null;
  wells: Well[];
  results?: Results;
  resultsHash?: string;
  importedBy?: string;
};
export type Campaign = {
  id: string;
  title: string;
  objective: string;
  createdAt: string;
  simulationBudgetCents: number;
  simulationSpentCents: number;
  drafts: Draft[];
  runs: Run[];
};
export type AuditEvent = {
  id: string;
  campaignId: string;
  at: string;
  action: string;
  actor: string;
  detail: unknown;
  stateHash: string;
  previousHash: string;
  hash: string;
};

/** Snapshot and audit append share one SQLite transaction. No external I/O in mutations. */
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_campaign ON events(campaign_id, sequence);
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;`);
  }
  close() {
    this.db.close();
  }
  list(): Campaign[] {
    return this.db
      .prepare("SELECT body FROM campaigns ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(String(row.body)) as Campaign);
  }
  get(id: string): Campaign {
    const row = this.db
      .prepare("SELECT body FROM campaigns WHERE id = ?")
      .get(id);
    if (!row) throw new Error(`Campaign not found: ${id}`);
    return JSON.parse(String(row.body)) as Campaign;
  }
  events(id: string): AuditEvent[] {
    return this.db
      .prepare(
        "SELECT body FROM events WHERE campaign_id = ? ORDER BY sequence",
      )
      .all(id)
      .map((row) => JSON.parse(String(row.body)) as AuditEvent);
  }
  verify(id: string): { valid: true; events: number; head: string } {
    const events = this.events(id);
    let previousHash = "";
    for (const event of events) {
      const { hash: stored, ...body } = event;
      if (body.previousHash !== previousHash || hash(body) !== stored)
        throw new Error("Audit chain integrity failure");
      previousHash = stored;
    }
    if (!events.length || events.at(-1)!.stateHash !== hash(this.get(id)))
      throw new Error("Campaign snapshot integrity failure");
    return { valid: true, events: events.length, head: previousHash };
  }
  create(campaign: Campaign, actor: string) {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO campaigns (id, body) VALUES (?, ?)")
        .run(campaign.id, JSON.stringify(campaign));
      this.append(campaign, "campaign.created", actor, {
        title: campaign.title,
      });
    });
    return campaign;
  }
  mutate<T>(
    id: string,
    action: string,
    actor: string,
    change: (campaign: Campaign) => { result: T; detail: unknown },
  ): T {
    return this.transaction(() => {
      this.verify(id);
      const campaign = this.get(id);
      const { result, detail } = change(campaign);
      this.db
        .prepare("UPDATE campaigns SET body = ? WHERE id = ?")
        .run(JSON.stringify(campaign), id);
      this.append(campaign, action, actor, detail);
      return result;
    });
  }
  private append(
    campaign: Campaign,
    action: string,
    actor: string,
    detail: unknown,
  ) {
    const last = this.db
      .prepare(
        "SELECT body FROM events WHERE campaign_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(campaign.id);
    const previousHash = last
      ? (JSON.parse(String(last.body)) as AuditEvent).hash
      : "";
    const body = {
      id: randomUUID(),
      campaignId: campaign.id,
      at: new Date().toISOString(),
      action,
      actor,
      detail,
      stateHash: hash(campaign),
      previousHash,
    };
    this.db
      .prepare("INSERT INTO events (campaign_id, body) VALUES (?, ?)")
      .run(campaign.id, JSON.stringify({ ...body, hash: hash(body) }));
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
