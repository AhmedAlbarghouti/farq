import type { ChangeSummary } from "../schema.js";

export const FAKE_SUMMARY: ChangeSummary = {
  headline: "Add refund status to order responses",
  overview:
    "Orders now include a refund_status field so clients can track refund progress without extra lookups.",
  items: [
    {
      category: "feature",
      title: "Refund status on orders",
      description: "Adds refund_status to the order API response shape.",
      why_it_matters: "Support and customers can see whether a refund is pending or complete.",
      files: ["src/orders/serializer.ts", "src/orders/types.ts"],
    },
    {
      category: "docs",
      title: "Document refund_status",
      description: "Updates OpenAPI notes for the new field.",
      files: ["docs/api.md"],
    },
  ],
  breaking_changes: [],
  visual_notes: "Show a simple status badge on the order card.",
  visual_topics: [{ title: "Refund status on orders", item_indices: [0, 1] }],
};

export const FAKE_MOCKUP_CSS = `.page{padding:32px;background:var(--fq-surface)}
.card{max-width:340px;padding:24px;background:var(--fq-surface-alt);border:1px solid var(--fq-border);border-radius:var(--fq-radius)}
.card h1{margin:0 0 8px;font-family:var(--fq-font-display);font-size:20px}
.card p{margin:0 0 8px;color:var(--fq-text-muted)}
.card p.status{margin:0;color:var(--fq-positive)}`;

export const FAKE_BEFORE_BODY = `<div class="page"><div class="card"><h1>Order #1042</h1><p>Total: $48.00</p></div></div>`;

export const FAKE_AFTER_BODY = `<div class="page"><div class="card"><h1>Order #1042</h1><p>Total: $48.00</p><p class="status">Refund status: pending</p></div></div>`;

export const FAKE_DIAGRAM_CSS = `.cols{display:flex;gap:24px}
.col{flex:1;padding:16px;border:1px solid var(--fq-border);border-radius:var(--fq-radius)}
.step{padding:8px 12px;margin-bottom:8px;background:var(--fq-surface-alt);border-radius:var(--fq-radius-sm)}
.step--new{background:var(--fq-accent-soft);color:var(--fq-accent)}`;

export const FAKE_DIAGRAM_BODY = `<div class="cols"><div class="col"><div class="step">Fetch order</div><div class="step">Return payload</div></div><div class="col"><div class="step">Fetch order</div><div class="step step--new">Attach refund status</div><div class="step">Return payload</div></div></div>`;

export type CompleteOptions = { model?: string };

export async function complete(
  prompt: string,
  _options: CompleteOptions = {},
): Promise<string> {
  if (prompt.includes("before_body")) {
    return JSON.stringify({
      feasible: true,
      css: FAKE_MOCKUP_CSS,
      before_body: FAKE_BEFORE_BODY,
      after_body: FAKE_AFTER_BODY,
      stage_width: 620,
    });
  }
  if (prompt.includes("flowchart")) {
    return JSON.stringify({
      feasible: true,
      css: FAKE_DIAGRAM_CSS,
      body: FAKE_DIAGRAM_BODY,
      stage_width: 900,
    });
  }
  return JSON.stringify(FAKE_SUMMARY);
}
