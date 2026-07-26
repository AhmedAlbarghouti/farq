import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson } from "../extract-json.js";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import {
  DEFAULT_VIEWPORT,
  VIEWPORT_MAX_HEIGHT,
  VIEWPORT_MAX_WIDTH,
  clampViewport,
} from "./viewport.js";

export type MockupResult =
  | {
      feasible: true;
      beforePath: string;
      afterPath: string;
      viewport?: { width: number; height: number };
    }
  | { feasible: false; reason: string };

export async function generateMockup(options: {
  provider: Provider;
  summary: ChangeSummary;
  files: Array<{ path: string; before: string; after: string }>;
  outDir: string;
  model?: string;
  log?: (msg: string) => void;
  /** Prefix for written HTML files (e.g. visual-1-). */
  filePrefix?: string;
}): Promise<MockupResult> {
  const prompt = `You create faithful before/after HTML mockups from a git diff.

Rules:
- The diff contains exact before/after markup/styles. Emit two fully self-contained HTML documents (inline CSS, no external requests) that render this exact markup with these exact styles.
- Stub only the minimum: container width, placeholder text where dynamic props appear (realistic neutral placeholders).
- Do not invent UI that is not present in the code.
- Never show raw code listings.
- FRAME LIMIT (hard): design for exactly ${VIEWPORT_MAX_WIDTH}x${VIEWPORT_MAX_HEIGHT}px. html/body must be width/height 100% with overflow:hidden. All content must fit in that single screen — no scrolling, no content cut off at the bottom. Prefer denser layout over tall pages.
- Visual craft: one clear composition, strong typographic hierarchy, purposeful (non-default) web fonts via @import from fonts.googleapis.com or fonts.bunny.net if helpful, atmospheric background (subtle gradient or pattern — not flat single-color), high contrast for text. No purple-on-white clichés, no glow spam, no floating badge stickers on the mockup itself.
- If you cannot render faithfully, return {"feasible": false, "reason": "..."}.

Return JSON only:
{"feasible": true, "before_html": "...", "after_html": "...", "viewport": {"width":${DEFAULT_VIEWPORT.width},"height":${DEFAULT_VIEWPORT.height}}}
or {"feasible": false, "reason": "..."}

Change summary context:
${JSON.stringify(options.summary, null, 2)}

File contents:
${options.files
  .map(
    (f) =>
      `### ${f.path}\n--- BEFORE ---\n${f.before}\n--- AFTER ---\n${f.after}`,
  )
  .join("\n\n")}
`;

  const raw = await options.provider.complete(prompt, { model: options.model });
  const json = extractJson(raw) as {
    feasible?: boolean;
    reason?: string;
    before_html?: string;
    after_html?: string;
    viewport?: { width: number; height: number };
  };

  if (!json.feasible) {
    options.log?.(json.reason ?? "mockup not feasible");
    return { feasible: false, reason: json.reason ?? "not feasible" };
  }

  if (!json.before_html || !json.after_html) {
    return { feasible: false, reason: "missing before_html/after_html" };
  }

  mkdirSync(options.outDir, { recursive: true });
  const prefix = options.filePrefix ?? "";
  const beforePath = join(options.outDir, `${prefix}before.html`);
  const afterPath = join(options.outDir, `${prefix}after.html`);
  writeFileSync(beforePath, json.before_html, "utf8");
  writeFileSync(afterPath, json.after_html, "utf8");
  return {
    feasible: true,
    beforePath,
    afterPath,
    viewport: clampViewport(json.viewport),
  };
}
