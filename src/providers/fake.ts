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
};

export const FAKE_BEFORE_HTML = `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#f6f6f6">
<main style="max-width:420px;margin:auto;background:#fff;padding:16px;border:1px solid #ddd">
  <h1 style="font-size:18px;margin:0 0 8px">Order #1042</h1>
  <p style="margin:0;color:#444">Total: $48.00</p>
</main></body></html>`;

export const FAKE_AFTER_HTML = `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#f6f6f6">
<main style="max-width:420px;margin:auto;background:#fff;padding:16px;border:1px solid #ddd">
  <h1 style="font-size:18px;margin:0 0 8px">Order #1042</h1>
  <p style="margin:0 0 8px;color:#444">Total: $48.00</p>
  <p style="margin:0;color:#0a7">Refund status: pending</p>
</main></body></html>`;

export type CompleteOptions = { model?: string };

export async function complete(
  prompt: string,
  _options: CompleteOptions = {},
): Promise<string> {
  if (prompt.includes("before_html") || prompt.includes("feasible")) {
    return JSON.stringify({
      feasible: true,
      before_html: FAKE_BEFORE_HTML,
      after_html: FAKE_AFTER_HTML,
      viewport: { width: 900, height: 700 },
    });
  }
  return JSON.stringify(FAKE_SUMMARY);
}
