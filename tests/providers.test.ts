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

  it("returns a mockup payload when asked for HTML", async () => {
    const provider = getProvider("fake");
    const raw = await provider.complete('return {"feasible":true,"before_html":"..."}');
    const parsed = JSON.parse(raw) as { feasible: boolean; before_html: string };
    expect(parsed.feasible).toBe(true);
    expect(parsed.before_html).toContain("<html>");
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

  it("prefers claude when both installed and nothing configured", async () => {
    const logs: string[] = [];
    const p = await resolveProvider({
      detect: async () => ({ claude: true, opencode: true }),
      log: (m) => logs.push(m),
    });
    expect(p.name).toBe("claude");
    expect(logs[0]).toMatch(/Both claude and opencode/);
  });

  it("errors with install hint when none installed", async () => {
    await expect(
      resolveProvider({
        detect: async () => ({ claude: false, opencode: false }),
      }),
    ).rejects.toThrow(/--provider fake/);
  });
});
