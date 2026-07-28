import { describe, expect, it, vi } from "vitest";
import {
  getProvider,
  resolveProvider,
  FAKE_SUMMARY,
} from "../src/providers/index.js";
import { ChangeSummarySchema } from "../src/schema.js";

describe("fake provider", () => {
  it("returns a valid ChangeSummary JSON", async () => {
    const provider = getProvider("fake");
    const raw = await provider.complete("summarize this diff");
    const parsed = ChangeSummarySchema.parse(JSON.parse(raw));
    expect(parsed.headline).toBe(FAKE_SUMMARY.headline);
  });

  it("returns a mockup payload when asked for panel bodies", async () => {
    const provider = getProvider("fake");
    const raw = await provider.complete(
      'return {"feasible":true,"before_body":"...","after_body":"..."}',
    );
    const parsed = JSON.parse(raw) as {
      feasible: boolean;
      before_body: string;
      after_body: string;
      css: string;
    };
    expect(parsed.feasible).toBe(true);
    expect(parsed.before_body).toContain("<div");
    expect(parsed.after_body).toContain("Refund status");
    expect(parsed.css).toContain("var(--fq-");
  });

  it("returns a diagram payload when asked for a flowchart", async () => {
    const provider = getProvider("fake");
    const raw = await provider.complete("draw a before/after flowchart");
    const parsed = JSON.parse(raw) as { feasible: boolean; body: string };
    expect(parsed.feasible).toBe(true);
    expect(parsed.body).toContain("<div");
  });
});

describe("resolveProvider", () => {
  it("uses --provider flag first", async () => {
    const p = await resolveProvider({
      flag: "fake",
      config: { provider: "claude" },
      detect: async () => ({ claude: true, opencode: true }),
    });
    expect(p.name).toBe("fake");
  });

  it("uses config when flag missing", async () => {
    const p = await resolveProvider({
      config: { provider: "opencode" },
      detect: async () => ({ claude: true, opencode: true }),
    });
    expect(p.name).toBe("opencode");
  });

  it("prompts when both installed and interactive", async () => {
    const choose = vi.fn(async () => "opencode" as const);
    const p = await resolveProvider({
      detect: async () => ({ claude: true, opencode: true }),
      interactive: true,
      choose,
    });
    expect(p.name).toBe("opencode");
    expect(choose).toHaveBeenCalledOnce();
  });

  it("falls back to claude when both installed and non-interactive", async () => {
    const logs: string[] = [];
    const choose = vi.fn(async () => "opencode" as const);
    const p = await resolveProvider({
      detect: async () => ({ claude: true, opencode: true }),
      interactive: false,
      choose,
      log: (m) => logs.push(m),
    });
    expect(p.name).toBe("claude");
    expect(choose).not.toHaveBeenCalled();
    expect(logs[0]).toMatch(/non-interactive/);
  });

  it("skips the picker when config sets a default", async () => {
    const choose = vi.fn(async () => "claude" as const);
    const p = await resolveProvider({
      config: { provider: "opencode" },
      detect: async () => ({ claude: true, opencode: true }),
      interactive: true,
      choose,
    });
    expect(p.name).toBe("opencode");
    expect(choose).not.toHaveBeenCalled();
  });

  it("errors with install hint when none installed", async () => {
    await expect(
      resolveProvider({
        detect: async () => ({ claude: false, opencode: false }),
      }),
    ).rejects.toThrow(/--provider fake/);
  });
});
