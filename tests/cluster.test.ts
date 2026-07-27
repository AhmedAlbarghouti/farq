import { describe, expect, it, vi } from "vitest";
import {
  clusterByFileOverlap,
  clusterVisualTopics,
  MAX_VISUAL_TOPICS,
  topicsFromIntentJson,
} from "../src/visual/cluster.js";
import type { ChangeSummary } from "../src/schema.js";
import type { Provider } from "../src/providers/index.js";

function summary(items: ChangeSummary["items"]): ChangeSummary {
  return {
    headline: "h",
    overview: "o",
    items,
    breaking_changes: [],
  };
}

const multiFeatureItems: ChangeSummary["items"] = [
  {
    category: "feature",
    title: "Cluster topics",
    description: "group items",
    files: ["src/visual/cluster.ts"],
  },
  {
    category: "feature",
    title: "Pipeline loop",
    description: "render per topic",
    files: ["src/visual/pipeline.ts"],
  },
  {
    category: "feature",
    title: "PR render multi",
    description: "embed many images",
    files: ["src/render/pr.ts"],
  },
  {
    category: "docs",
    title: "README",
    description: "document multi-visual",
    files: ["README.md"],
  },
];

describe("clusterByFileOverlap", () => {
  it("keeps a single item as one topic", () => {
    const topics = clusterByFileOverlap(
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
    const topics = clusterByFileOverlap(
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

  it("keeps file-disjoint items separate (fallback)", () => {
    const topics = clusterByFileOverlap(summary(multiFeatureItems));
    expect(topics.length).toBeGreaterThan(1);
  });

  it("caps at MAX_VISUAL_TOPICS by merging smallest", () => {
    const items = Array.from({ length: MAX_VISUAL_TOPICS + 2 }, (_, i) => ({
      category: "chore" as const,
      title: `Change ${i}`,
      description: "d",
      files: [`file-${i}.ts`],
    }));
    const topics = clusterByFileOverlap(summary(items));
    expect(topics.length).toBeLessThanOrEqual(MAX_VISUAL_TOPICS);
    expect(topics.flatMap((t) => t.items)).toHaveLength(items.length);
  });
});

describe("topicsFromIntentJson", () => {
  it("builds one topic for a same-feature PR", () => {
    const s = summary(multiFeatureItems);
    const topics = topicsFromIntentJson(s, {
      topics: [{ title: "Multi-visual pipeline", item_indices: [0, 1, 2, 3] }],
    });
    expect(topics).toHaveLength(1);
    expect(topics![0]!.items).toHaveLength(4);
    expect(topics![0]!.title).toBe("Multi-visual pipeline");
  });

  it("rejects incomplete coverage", () => {
    const s = summary(multiFeatureItems);
    expect(
      topicsFromIntentJson(s, {
        topics: [{ title: "Partial", item_indices: [0, 1] }],
      }),
    ).toBeNull();
  });

  it("splits truly unrelated indices", () => {
    const s = summary(multiFeatureItems);
    const topics = topicsFromIntentJson(s, {
      topics: [
        { title: "Visuals", item_indices: [0, 1, 2] },
        { title: "Docs", item_indices: [3] },
      ],
    });
    expect(topics).toHaveLength(2);
  });
});

describe("clusterVisualTopics", () => {
  it("uses visual_topics from the summary without calling the model", async () => {
    const complete = vi.fn();
    const topics = await clusterVisualTopics(
      {
        ...summary(multiFeatureItems),
        visual_topics: [
          { title: "Multi-visual pipeline", item_indices: [0, 1, 2, 3] },
        ],
      },
      { provider: { name: "fake", complete } },
    );
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe("Multi-visual pipeline");
    expect(complete).not.toHaveBeenCalled();
  });

  it("falls back to the model when summary topics do not cover every item", async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({ topics: [{ title: "All of it", item_indices: [0, 1, 2, 3] }] }),
    );
    const topics = await clusterVisualTopics(
      {
        ...summary(multiFeatureItems),
        visual_topics: [{ title: "Partial", item_indices: [0] }],
      },
      { provider: { name: "fake", complete } },
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(topics[0]!.title).toBe("All of it");
  });

  it("merges down to maxTopics", async () => {
    const topics = await clusterVisualTopics(summary(multiFeatureItems), {
      maxTopics: 2,
    });
    expect(topics).toHaveLength(2);
    expect(topics.flatMap((t) => t.items)).toHaveLength(4);
  });

  it("uses intent clustering when provider returns one topic", async () => {
    const provider: Provider = {
      name: "fake",
      complete: async () =>
        JSON.stringify({
          topics: [
            { title: "Multi-visual support", item_indices: [0, 1, 2, 3] },
          ],
        }),
    };
    const topics = await clusterVisualTopics(summary(multiFeatureItems), {
      provider,
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe("Multi-visual support");
  });

  it("falls back to file overlap when intent JSON is invalid", async () => {
    const provider: Provider = {
      name: "fake",
      complete: async () => JSON.stringify({ topics: [] }),
    };
    const topics = await clusterVisualTopics(summary(multiFeatureItems), {
      provider,
      log: vi.fn(),
    });
    expect(topics.length).toBeGreaterThan(1);
  });
});
