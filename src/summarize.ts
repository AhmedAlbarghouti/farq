import { extractJson } from "./extract-json.js";
import {
  CHANGE_SUMMARY_SCHEMA_PROMPT,
  ChangeSummarySchema,
  type ChangeSummary,
} from "./schema.js";
import type { Provider } from "./providers/index.js";
import type { ToneName } from "./config.js";
import type { GatherDiffResult } from "./git.js";

export class SummarizeError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "SummarizeError";
  }
}

export type SummarizeOptions = {
  provider: Provider;
  diff: GatherDiffResult;
  tone: ToneName;
  titleConventionBlurb?: string;
  model?: string;
};

export async function summarize(
  options: SummarizeOptions,
): Promise<ChangeSummary> {
  const prompt = buildPrompt(options);
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const fullPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous output failed validation:\n${lastError}\nReturn corrected JSON only.`;

    let raw: string;
    try {
      raw = await options.provider.complete(fullPrompt, {
        model: options.model,
      });
    } catch (err) {
      throw new SummarizeError(
        err instanceof Error ? err.message : String(err),
      );
    }

    try {
      const json = extractJson(raw);
      const parsed = ChangeSummarySchema.parse(json);
      if (options.tone === "client") {
        for (const item of parsed.items) {
          if (!item.why_it_matters) {
            throw new Error(
              `Item "${item.title}" missing why_it_matters (required for client tone)`,
            );
          }
        }
      }
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        throw new SummarizeError(
          `AI output invalid after retry: ${lastError}`,
        );
      }
    }
  }

  throw new SummarizeError("AI output invalid after retry");
}

export function buildPrompt(options: SummarizeOptions): string {
  const toneRules =
    options.tone === "client"
      ? "Tone: plain English for a non-technical client. Avoid jargon. Every item MUST include why_it_matters."
      : "Tone: technical, concise, accurate for engineers.";

  const convention = options.titleConventionBlurb
    ? `\nTitle conventions for this repo:\n${options.titleConventionBlurb}\n`
    : "";

  return `You summarize a git diff into a structured change summary.

Rules:
- Return JSON only. No markdown fences. No prose before or after.
- Group related edits (never one item per file).
- Report only what the diff shows. Do not invent work.
- ${toneRules}
${convention}
Schema:
${CHANGE_SUMMARY_SCHEMA_PROMPT}

Diff range: ${options.diff.range}
Commits:
${options.diff.commits.map((c) => `- ${c}`).join("\n") || "(none)"}

Diff:
${options.diff.diffText}
`;
}
