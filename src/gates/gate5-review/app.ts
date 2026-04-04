import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ReviewStorage } from "./storage.js";
import type { PipelineReport } from "../../core/types.js";

export function createReviewApp(dbDir?: string) {
  const app = new Hono();
  const storage = new ReviewStorage(dbDir);

  // ── Dashboard ────────────────────────────────────────────
  app.get("/", (c) => {
    const status = c.req.query("status");
    const reviews = storage.listReviews(status);
    return c.html(renderDashboard(reviews as unknown as Array<Record<string, unknown>>, status));
  });

  // ── Review Detail ────────────────────────────────────────
  app.get("/review/:id", (c) => {
    const review = storage.getReview(c.req.param("id"));
    if (!review) return c.text("Review not found", 404);
    const report: PipelineReport = JSON.parse(review.reportJson);
    const audit = storage.getAuditLog(review.pipelineId);
    return c.html(renderDetail(review as unknown as Record<string, unknown>, report, audit as unknown as Array<Record<string, unknown>>));
  });

  // ── Actions ──────────────────────────────────────────────
  app.post("/review/:id/approve", async (c) => {
    const body = await c.req.parseBody();
    storage.approve(c.req.param("id"), (body.reviewer as string) || "anonymous", body.comments as string);
    return c.redirect("/");
  });

  app.post("/review/:id/reject", async (c) => {
    const body = await c.req.parseBody();
    storage.reject(c.req.param("id"), (body.reviewer as string) || "anonymous", (body.reason as string) || "No reason given");
    return c.redirect("/");
  });

  app.post("/review/:id/escalate", async (c) => {
    const body = await c.req.parseBody();
    storage.escalate(c.req.param("id"), (body.reviewer as string) || "anonymous", body.reason as string);
    return c.redirect("/");
  });

  // ── Audit Log ────────────────────────────────────────────
  app.get("/audit", (c) => {
    const log = storage.getAuditLog();
    return c.html(renderAuditLog(log as unknown as Array<Record<string, unknown>>));
  });

  // ── API: Submit review (used by pipeline) ────────────────
  app.post("/api/reviews", async (c) => {
    const report = await c.req.json<PipelineReport>();
    storage.createReview(report);
    return c.json({ success: true, pipelineId: report.pipelineId });
  });

  return { app, storage };
}

export function startDashboard(port: number = 8080, dbDir?: string): void {
  const { app } = createReviewApp(dbDir);
  console.log(`MCPQA Review Dashboard running at http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

// ── HTML Renderers (htmx-powered) ──────────────────────────

const STYLES = `<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:1200px;margin:0 auto}
h1{color:#38bdf8;margin-bottom:1rem}a{color:#38bdf8;text-decoration:none}a:hover{text-decoration:underline}
.card{background:#1e293b;border-radius:8px;padding:1.5rem;margin-bottom:1rem}.badge{padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700;color:#fff}
.pass{background:#22c55e}.warn{background:#eab308}.fail{background:#ef4444}.pending{background:#6366f1}.approved{background:#22c55e}.rejected{background:#ef4444}.escalated{background:#f97316}
table{width:100%;border-collapse:collapse}th{text-align:left;color:#94a3b8;padding:.5rem;border-bottom:1px solid #334155}td{padding:.5rem;border-bottom:1px solid #1e293b}
form{display:inline-block;margin-right:.5rem}input,textarea{background:#334155;border:1px solid #475569;color:#e2e8f0;padding:.5rem;border-radius:4px}
button{padding:.5rem 1rem;border:none;border-radius:4px;font-weight:600;cursor:pointer;color:#fff}
.btn-approve{background:#22c55e}.btn-reject{background:#ef4444}.btn-escalate{background:#f97316}.btn-filter{background:#6366f1}
nav{margin-bottom:2rem}nav a{margin-right:1rem;padding:.5rem 1rem;background:#1e293b;border-radius:4px;display:inline-block}
.evidence{color:#94a3b8;font-size:.85rem;margin-top:.5rem}
</style>
<script src="https://unpkg.com/htmx.org@2.0.4"></script>`;

function renderDashboard(reviews: Array<Record<string, unknown>>, currentStatus?: string): string {
  const filters = ["all", "pending", "approved", "rejected", "escalated"];
  const filterLinks = filters.map((f) => {
    const active = (f === "all" && !currentStatus) || f === currentStatus;
    return `<a href="/?status=${f === "all" ? "" : f}" style="${active ? "background:#334155" : ""}">${f}</a>`;
  }).join("");

  const rows = reviews.map((r) => `
    <tr>
      <td><span class="badge ${r.status}">${(r.status as string).toUpperCase()}</span></td>
      <td><a href="/review/${r.pipeline_id}">${(r.pipeline_id as string).substring(0, 8)}...</a></td>
      <td>${r.server_target}</td>
      <td><span class="badge ${r.overall_severity}">${(r.overall_severity as string).toUpperCase()}</span></td>
      <td>${r.created_at}</td>
      <td>${r.reviewer ?? "—"}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html><html><head><title>MCPQA Reviews</title>${STYLES}</head><body>
    <h1>MCPQA Review Dashboard</h1>
    <nav>${filterLinks} | <a href="/audit">Audit Log</a></nav>
    <table><thead><tr><th>Status</th><th>Pipeline</th><th>Server</th><th>Severity</th><th>Created</th><th>Reviewer</th></tr></thead>
    <tbody>${rows || "<tr><td colspan='6'>No reviews found</td></tr>"}</tbody></table>
  </body></html>`;
}

function renderDetail(review: Record<string, unknown>, report: PipelineReport, audit: Array<Record<string, unknown>>): string {
  const gateRows = report.gateResults.map((g) => {
    const validators = g.validatorResults.map((v) => {
      const evidenceHtml = v.evidence.length > 0
        ? `<div class="evidence">${v.evidence.slice(0, 5).map((e) => `<div>→ ${escapeHtml(e)}</div>`).join("")}</div>`
        : "";
      return `<tr><td><span class="badge ${v.severity}">${v.severity.toUpperCase()}</span></td><td>${escapeHtml(v.validatorName)}</td><td>${escapeHtml(v.message)}${evidenceHtml}</td></tr>`;
    }).join("");
    return `<div class="card"><h3><span class="badge ${g.severity}">${g.severity.toUpperCase()}</span> Gate ${g.gateNumber}: ${escapeHtml(g.gateName)}</h3>
      <table><thead><tr><th>Status</th><th>Validator</th><th>Message</th></tr></thead><tbody>${validators}</tbody></table></div>`;
  }).join("");

  const auditRows = audit.map((a) =>
    `<tr><td>${a.timestamp}</td><td>${a.action}</td><td>${a.actor}</td><td>${a.details ?? "—"}</td></tr>`
  ).join("");

  const actions = review.status === "pending" ? `
    <div class="card">
      <h3>Actions</h3>
      <form method="POST" action="/review/${review.pipeline_id}/approve">
        <input name="reviewer" placeholder="Your name" required>
        <input name="comments" placeholder="Comments (optional)">
        <button type="submit" class="btn-approve">Approve</button>
      </form>
      <form method="POST" action="/review/${review.pipeline_id}/reject">
        <input name="reviewer" placeholder="Your name" required>
        <input name="reason" placeholder="Reason (required)" required>
        <button type="submit" class="btn-reject">Reject</button>
      </form>
      <form method="POST" action="/review/${review.pipeline_id}/escalate">
        <input name="reviewer" placeholder="Your name" required>
        <input name="reason" placeholder="Reason">
        <button type="submit" class="btn-escalate">Escalate</button>
      </form>
    </div>` : `<div class="card"><p>Status: <span class="badge ${review.status}">${(review.status as string).toUpperCase()}</span> by ${review.reviewer ?? "system"}</p></div>`;

  return `<!DOCTYPE html><html><head><title>Review ${(review.pipeline_id as string).substring(0, 8)}</title>${STYLES}</head><body>
    <h1><a href="/">← Back</a> Review: ${(review.pipeline_id as string).substring(0, 8)}...</h1>
    <div class="card"><strong>Server:</strong> ${escapeHtml(report.serverTarget)} | <strong>Overall:</strong> <span class="badge ${report.overallSeverity}">${report.overallSeverity.toUpperCase()}</span> | <strong>Duration:</strong> ${report.completedAt && report.startedAt ? Math.round((new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()) / 1000) : 0}s</div>
    ${actions}${gateRows}
    <h2 style="margin-top:2rem">Audit Trail</h2>
    <table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead><tbody>${auditRows}</tbody></table>
  </body></html>`;
}

function renderAuditLog(log: Array<Record<string, unknown>>): string {
  const rows = log.map((a) =>
    `<tr><td>${a.timestamp}</td><td><a href="/review/${a.pipeline_id}">${(a.pipeline_id as string).substring(0, 8)}...</a></td><td>${a.action}</td><td>${a.actor}</td><td>${a.details ?? "—"}</td></tr>`
  ).join("");

  return `<!DOCTYPE html><html><head><title>Audit Log</title>${STYLES}</head><body>
    <h1><a href="/">← Dashboard</a> Audit Log</h1>
    <table><thead><tr><th>Time</th><th>Pipeline</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
