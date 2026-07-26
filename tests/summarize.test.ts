import { describe, expect, it, vi } from "vitest";
import { buildPrompt, summarize, SummarizeError } from "../src/summarize.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";
import type { GatherDiffResult } from "../src/git.js";
import type { Provider } from "../src/providers/index.js";

const diff: GatherDiffResult = {
  mode: "range",
  range: "main..HEAD",
  baseRef: "main",
  headRef: "HEAD",
  files: [{ path: "a.ts", status: "M", patch: "+x" }],
  diffText: "diff --git a/a.ts b/a.ts\n+x\n",
  truncated: false,
  commits: ["feat: x"],
};

describe("summarize", () => {
  it("returns validated summary on first valid response", async () => {
    const provider: Provider = {
      name: "fake",
      complete: vi.fn(async () => JSON.stringify(FAKE_SUMMARY)),
    };
    const result = await summarize({
      provider,
      diff,
      tone: "technical",
    });
    expect(result.headline).toBe(FAKE_SUMMARY.headline);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("retries once after invalid JSON then succeeds", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify(FAKE_SUMMARY));
    const provider: Provider = { name: "fake", complete };
    const result = await summarize({ provider, diff, tone: "technical" });
    expect(result.headline).toBe(FAKE_SUMMARY.headline);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("throws SummarizeError after two invalid responses", async () => {
    const provider: Provider = {
      name: "fake",
      complete: vi.fn(async () => "still not json"),
    };
    await expect(
      summarize({ provider, diff, tone: "technical" }),
    ).rejects.toBeInstanceOf(SummarizeError);
  });

  it("includes title convention blurb in the prompt", () => {
    const prompt = buildPrompt({
      provider: { name: "fake", complete: async () => "" },
      diff,
      tone: "technical",
      titleConventionBlurb: "Use feat: prefixes",
    });
    expect(prompt).toContain("Use feat: prefixes");
    expect(prompt).toContain("main..HEAD");
  });
});
