import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson } from "../extract-json.js";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import type { DiffFile } from "../git.js";

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
}): Promise<MockupResult> {
  const prompt = `You create faithful before/after HTML mockups from a git diff.

Rules:
- The diff contains exact before/after markup/styles. Emit two fully self-contained HTML documents (inline CSS, no external requests, system fonts) that render this exact markup with these exact styles.
- Stub only the minimum: container width, placeholder text where dynamic props appear (realistic neutral placeholders).
- Do not invent UI that is not present in the code.
- Never show raw code listings.
- If you cannot render faithfully, return {"feasible": false, "reason": "..."}.

Return JSON only:
{"feasible": true, "before_html": "...", "after_html": "...", "viewport": {"width":1280,"height":900}}
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
  const beforePath = join(options.outDir, "before.html");
  const afterPath = join(options.outDir, "after.html");
  writeFileSync(beforePath, json.before_html, "utf8");
  writeFileSync(afterPath, json.after_html, "utf8");
  return {
    feasible: true,
    beforePath,
    afterPath,
    viewport: json.viewport,
  };
}
