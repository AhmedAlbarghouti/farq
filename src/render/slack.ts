import type { ChangeSummary } from "../schema.js";

const EMOJI: Record<string, string> = {
  feature: ":sparkles:",
  fix: ":bug:",
  improvement: ":gem:",
  refactor: ":recycle:",
  chore: ":wrench:",
  docs: ":memo:",
  perf: ":zap:",
  security: ":lock:",
};

export function renderSlack(summary: ChangeSummary): string {
  const lines: string[] = [];
  lines.push(`*${summary.headline}*`);
  lines.push(summary.overview);
  lines.push("");
  for (const item of summary.items) {
    const emoji = EMOJI[item.category] ?? ":small_blue_diamond:";
    lines.push(`${emoji} *${item.title}* — ${item.description}`);
  }
  if (summary.breaking_changes.length > 0) {
    lines.push("");
    lines.push(
      `:warning: Breaking: ${summary.breaking_changes.join("; ")}`,
    );
  }
  return `${lines.join("\n").trim()}\n`;
}
