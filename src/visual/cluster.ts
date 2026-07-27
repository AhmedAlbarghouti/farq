import { extractJson } from "../extract-json.js";
import type { ChangeItem, ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";

export const MAX_VISUAL_TOPICS = 5;

export type VisualTopic = {
  id: number;
  title: string;
  items: ChangeItem[];
  files: string[];
};

/**
 * Topic grouping, cheapest source first:
 *   1. visual_topics returned by the summarize call (free — no extra request)
 *   2. a dedicated cheap-model call
 *   3. file-overlap union-find
 * Same-theme items (one feature across many files) → one topic.
 * Truly unrelated domains → separate topics.
 */
export async function clusterVisualTopics(
  summary: ChangeSummary,
  options?: {
    provider?: Provider;
    model?: string;
    maxTopics?: number;
    log?: (msg: string) => void;
  },
): Promise<VisualTopic[]> {
  const limit = normalizeLimit(options?.maxTopics);
  const items = summary.items;
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [
      {
        id: 1,
        title: items[0]!.title.slice(0, 80),
        items,
        files: uniqueFiles(items),
      },
    ];
  }

  const fromSummary = topicsFromIntentJson(summary, {
    topics: summary.visual_topics,
  });
  if (fromSummary) {
    options?.log?.(
      `visual topics (from summary): ${fromSummary.length} — ${fromSummary
        .map((t) => t.title)
        .join("; ")}`,
    );
    return capTopics(fromSummary, limit);
  }

  if (options?.provider) {
    try {
      const ai = await clusterByIntent(summary, options.provider, options.model);
      if (ai) {
        options.log?.(
          `visual topics (intent): ${ai.length} — ${ai.map((t) => t.title).join("; ")}`,
        );
        return capTopics(ai, limit);
      }
      options.log?.("visual topic intent clustering failed; using file overlap");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      options.log?.(`visual topic intent clustering error: ${msg}`);
    }
  }

  return capTopics(clusterByFileOverlap(summary), limit);
}

function normalizeLimit(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return MAX_VISUAL_TOPICS;
  }
  return Math.min(MAX_VISUAL_TOPICS, Math.floor(value));
}

/** File-overlap union-find (fallback). Exported for tests. */
export function clusterByFileOverlap(summary: ChangeSummary): VisualTopic[] {
  const items = summary.items;
  if (items.length === 0) return [];

  const parent = items.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]!));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (
        a.files.length > 0 &&
        b.files.length > 0 &&
        filesOverlap(a.files, b.files)
      ) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, ChangeItem[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(items[i]!);
    groups.set(root, list);
  }

  const clusters: VisualTopic[] = [...groups.values()].map(
    (groupItems, idx) => ({
      id: idx + 1,
      title: topicTitle(groupItems),
      items: groupItems,
      files: uniqueFiles(groupItems),
    }),
  );

  return capTopics(clusters, MAX_VISUAL_TOPICS);
}

/** Merge the smallest topics until at most `limit` remain. */
export function capTopics(
  topics: VisualTopic[],
  limit = MAX_VISUAL_TOPICS,
): VisualTopic[] {
  let clusters = topics;
  while (clusters.length > limit) {
    clusters = [...clusters].sort(
      (a, b) =>
        a.items.length - b.items.length || a.files.length - b.files.length,
    );
    const smallest = clusters[0]!;
    const next = clusters[1]!;
    const merged = [...smallest.items, ...next.items];
    clusters = [
      {
        id: 0,
        title: topicTitle(merged),
        items: merged,
        files: uniqueFiles(merged),
      },
      ...clusters.slice(2),
    ];
  }
  return finalizeTopics(clusters);
}

/** Build topics from model JSON; null if invalid. Exported for tests. */
export function topicsFromIntentJson(
  summary: ChangeSummary,
  raw: unknown,
): VisualTopic[] | null {
  const items = summary.items;
  if (!raw || typeof raw !== "object") return null;
  const topics = (raw as { topics?: unknown }).topics;
  if (!Array.isArray(topics) || topics.length === 0) return null;
  if (topics.length > MAX_VISUAL_TOPICS) return null;

  const used = new Set<number>();
  const built: VisualTopic[] = [];

  for (const t of topics) {
    if (!t || typeof t !== "object") return null;
    const title = String((t as { title?: unknown }).title ?? "").trim();
    const indices = (t as { item_indices?: unknown }).item_indices;
    if (!title || !Array.isArray(indices) || indices.length === 0) return null;

    const groupItems: ChangeItem[] = [];
    for (const idx of indices) {
      if (typeof idx !== "number" || !Number.isInteger(idx)) return null;
      if (idx < 0 || idx >= items.length || used.has(idx)) return null;
      used.add(idx);
      groupItems.push(items[idx]!);
    }
    built.push({
      id: built.length + 1,
      title: title.slice(0, 80),
      items: groupItems,
      files: uniqueFiles(groupItems),
    });
  }

  // Every item must appear exactly once.
  if (used.size !== items.length) return null;
  return finalizeTopics(built);
}

async function clusterByIntent(
  summary: ChangeSummary,
  provider: Provider,
  model?: string,
): Promise<VisualTopic[] | null> {
  const listed = summary.items
    .map(
      (item, i) =>
        `${i}. [${item.category}] ${item.title} — ${item.description} (files: ${
          item.files.join(", ") || "none"
        })`,
    )
    .join("\n");

  const prompt = `You group change-summary items into visual topics for before/after diagrams.

Rules:
- If items all advance the SAME headline/feature/story, return EXACTLY ONE topic with every item index — even across many files, docs, prompts, tests, and upload plumbing.
- Example: clustering + pipeline + PR render + asset upload + README + prompt polish for "multi-image visuals" → one topic.
- Only create multiple topics when a reviewer would treat them as separate product changes (e.g. a UI redesign AND an unrelated billing API).
- Prompt/style tweaks, tests, and docs for a feature stay in that feature's topic.
- Maximum ${MAX_VISUAL_TOPICS} topics. Prefer fewer; one is best when unsure.
- Every item index must appear in exactly one topic. Use 0-based indices.
- Topic titles: short, human, <=80 chars.

Return JSON only:
{"topics":[{"title":"...","item_indices":[0,1,2]}]}

Headline: ${summary.headline}
Overview: ${summary.overview}

Items:
${listed}
`;

  const raw = await provider.complete(prompt, { model });
  const json = extractJson(raw);
  return topicsFromIntentJson(summary, json);
}

function finalizeTopics(clusters: VisualTopic[]): VisualTopic[] {
  return clusters.map((c, i) => ({
    ...c,
    id: i + 1,
    title: c.title.slice(0, 80),
  }));
}

function topicTitle(items: ChangeItem[]): string {
  if (items.length === 1) return items[0]!.title;
  if (items.length === 2) return `${items[0]!.title}; ${items[1]!.title}`;
  return `${items[0]!.title} (+${items.length - 1} more)`;
}

function uniqueFiles(items: ChangeItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.files))];
}

function filesOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map(normalizePath));
  return b.some((f) => set.has(normalizePath(f)));
}

function normalizePath(p: string): string {
  return p.replaceAll("\\", "/").replace(/^\.\//, "");
}
