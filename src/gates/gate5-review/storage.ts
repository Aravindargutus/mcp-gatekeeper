import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import type { PipelineReport } from "../../core/types.js";

export interface ReviewRecord {
  id: number;
  pipelineId: string;
  status: "pending" | "approved" | "rejected" | "escalated";
  reportJson: string;
  serverTarget: string;
  overallSeverity: string;
  createdAt: string;
  reviewer: string | null;
  decisionAt: string | null;
  comments: string | null;
}

export interface AuditEntry {
  id: number;
  pipelineId: string;
  action: string;
  actor: string;
  timestamp: string;
  details: string | null;
}

export class ReviewStorage {
  private db: Database.Database;

  constructor(dbDir: string = "./data") {
    mkdirSync(dbDir, { recursive: true });
    this.db = new Database(join(dbDir, "mcpqa-reviews.db"));
    this.initialize();
  }

  private initialize(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        report_json TEXT NOT NULL,
        server_target TEXT NOT NULL,
        overall_severity TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewer TEXT,
        decision_at TEXT,
        comments TEXT
      )
    `).run();

    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'system',
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        details TEXT
      )
    `).run();

    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_pipeline ON audit_log(pipeline_id)").run();
  }

  createReview(report: PipelineReport): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO reviews (pipeline_id, report_json, server_target, overall_severity) VALUES (?, ?, ?, ?)"
    ).run(report.pipelineId, JSON.stringify(report), report.serverTarget, report.overallSeverity);

    this.addAuditEntry(report.pipelineId, "created", "system", "Review created");
  }

  getReview(pipelineId: string): ReviewRecord | undefined {
    return this.db.prepare("SELECT * FROM reviews WHERE pipeline_id = ?").get(pipelineId) as ReviewRecord | undefined;
  }

  listReviews(status?: string): ReviewRecord[] {
    if (status) {
      return this.db.prepare("SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC").all(status) as ReviewRecord[];
    }
    return this.db.prepare("SELECT * FROM reviews ORDER BY created_at DESC").all() as ReviewRecord[];
  }

  approve(pipelineId: string, reviewer: string, comments?: string): void {
    this.db.prepare(
      "UPDATE reviews SET status = 'approved', reviewer = ?, decision_at = datetime('now'), comments = ? WHERE pipeline_id = ?"
    ).run(reviewer, comments ?? null, pipelineId);
    this.addAuditEntry(pipelineId, "approved", reviewer, comments);
  }

  reject(pipelineId: string, reviewer: string, reason: string): void {
    this.db.prepare(
      "UPDATE reviews SET status = 'rejected', reviewer = ?, decision_at = datetime('now'), comments = ? WHERE pipeline_id = ?"
    ).run(reviewer, reason, pipelineId);
    this.addAuditEntry(pipelineId, "rejected", reviewer, reason);
  }

  escalate(pipelineId: string, reviewer: string, reason?: string): void {
    this.db.prepare(
      "UPDATE reviews SET status = 'escalated', reviewer = ?, comments = ? WHERE pipeline_id = ?"
    ).run(reviewer, reason ?? null, pipelineId);
    this.addAuditEntry(pipelineId, "escalated", reviewer, reason);
  }

  getAuditLog(pipelineId?: string): AuditEntry[] {
    if (pipelineId) {
      return this.db.prepare("SELECT * FROM audit_log WHERE pipeline_id = ? ORDER BY timestamp DESC").all(pipelineId) as AuditEntry[];
    }
    return this.db.prepare("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100").all() as AuditEntry[];
  }

  private addAuditEntry(pipelineId: string, action: string, actor: string, details?: string | null): void {
    this.db.prepare(
      "INSERT INTO audit_log (pipeline_id, action, actor, details) VALUES (?, ?, ?, ?)"
    ).run(pipelineId, action, actor, details ?? null);
  }

  close(): void {
    this.db.close();
  }
}
