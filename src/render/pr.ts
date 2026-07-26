import type { ChangeSummary } from "../schema.js";
import { truncateTitle, GITHUB_TITLE_MAX } from "../title.js";
import { isHostedImageUrl, LOCAL_IMAGE_NOTE } from "../tools.js";

const EMOJI: Record<string, string> = {
  feature: "\u2728",
  fix: "\uD83D\uDC1B",
  improvement: "\uD83D\uDC8E",
  refactor: "\u267B\uFE0F",
  chore: "\uD83D\uDD27",
  docs: "\uD83D\uDCDD",
  perf: "\u26A1",
  security: "\uD83D\uDD12",
};

export type RenderPrOptions = {
  summary: ChangeSummary;
  imagePath?: string | null;
  imageAlt?: string;
};

export function renderPr(options: RenderPrOptions): string {
  const { title, overflow } = truncateTitle(
    options.summary.headline,
    GITHUB_TITLE_MAX,
  );

  const out: string[] = [];
  out.push(options.summary.overview);
  if (overflow) {
    out.push("");
    out.push(overflow);
  }

  if (options.imagePath) {
    out.push("");
    out.push("### Before / After");
    out.push("");
    const alt = options.imageAlt ?? "before / after";
    out.push(`![${alt}](${options.imagePath})`);
    if (!isHostedImageUrl(options.imagePath)) {
      out.push("");
      out.push(LOCAL_IMAGE_NOTE);
    }
  }

  out.push("");
  out.push("### Changes");
  out.push("");
  for (const item of options.summary.items) {
    const emoji = EMOJI[item.category] ?? "\u2022";
    const files =
      item.files.length > 0
        ? ` <sub>${item.files.join(", ")}</sub>`
        : "";
    out.push(`- ${emoji} **${item.title}** \u2014 ${item.description}${files}`);
  }

  if (options.summary.breaking_changes.length > 0) {
    out.push("");
    out.push("### \u26A0\uFE0F Breaking changes");
    out.push("");
    for (const b of options.summary.breaking_changes) {
      out.push(`- ${b}`);
    }
  }

  return `${title}\n\n${out.join("\n").trim()}\n`;
}
