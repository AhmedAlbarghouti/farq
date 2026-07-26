import type { ChangeSummary } from "../schema.js";

export function renderJson(
  summary: ChangeSummary,
  images: string[] = [],
): string {
  return `${JSON.stringify({ ...summary, images }, null, 2)}\n`;
}
