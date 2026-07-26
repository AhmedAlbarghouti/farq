import { describe, expect, it } from "vitest";
import { clusterVisualTopics, MAX_VISUAL_TOPICS } from "../src/visual/cluster.js";
import type { ChangeSummary } from "../src/schema.js";

function summary(items: ChangeSummary["items"]): ChangeSummary {
  return {
    headline: "h",
    overview: "o",
    items,
    breaking_changes: [],
  };
}

describe("clusterVisualTopics", () => {
  it("keeps a single item as one topic", () => {
    const topics = clusterVisualTopics(
      summary([
        {
          category: "feature",
          title: "Add button",
          description: "d",
          files: ["ui/Button.tsx"],
        },
      ]),
    );
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe("Add button");
  });

  it("merges items that share files", () => {
    const topics = clusterVisualTopics(
      summary([
        {
          category: "feature",
          title: "Button",
          description: "d",
          files: ["ui/Button.tsx"],
        },
        {
          category: "fix",
          title: "Button style",
          description: "d",
          files: ["ui/Button.tsx", "ui/theme.css"],
        },
      ]),
    );
    expect(topics).toHaveLength(1);
    expect(topics[0]!.items).toHaveLength(2);
  });

  it("keeps unrelated items as separate topics", () => {
    const topics = clusterVisualTopics(
      summary([
        {
          category: "feature",
          title: "UI",
          description: "d",
          files: ["ui/Button.tsx"],
        },
        {
          category: "fix",
          title: "API",
          description: "d",
          files: ["api/route.ts"],
        },
        {
          category: "docs",
          title: "README",
          description: "d",
          files: ["README.md"],
        },
      ]),
    );
    expect(topics).toHaveLength(3);
  });

  it("caps at MAX_VISUAL_TOPICS by merging smallest", () => {
    const items = Array.from({ length: MAX_VISUAL_TOPICS + 2 }, (_, i) => ({
      category: "chore" as const,
      title: `Change ${i}`,
      description: "d",
      files: [`file-${i}.ts`],
    }));
    const topics = clusterVisualTopics(summary(items));
    expect(topics.length).toBeLessThanOrEqual(MAX_VISUAL_TOPICS);
    expect(topics.flatMap((t) => t.items)).toHaveLength(items.length);
  });

  it("does not merge empty-file items together", () => {
    const topics = clusterVisualTopics(
      summary([
        { category: "feature", title: "A", description: "d", files: [] },
        { category: "fix", title: "B", description: "d", files: [] },
      ]),
    );
    expect(topics).toHaveLength(2);
  });
});
