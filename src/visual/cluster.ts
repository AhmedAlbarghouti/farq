import type { ChangeItem, ChangeSummary } from "../schema.js";

export const MAX_VISUAL_TOPICS = 5;

export type VisualTopic = {
  id: number;
  title: string;
  items: ChangeItem[];
  files: string[];
};

/** Group summary items into ≤5 visual topics (file-overlap union-find). */
export function clusterVisualTopics(summary: ChangeSummary): VisualTopic[] {
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
      // Only merge when both list files and they overlap — empty-file
      // items stay separate so unrelated changes get their own visual.
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

  let clusters: VisualTopic[] = [...groups.values()].map((groupItems, idx) => ({
    id: idx + 1,
    title: topicTitle(groupItems),
    items: groupItems,
    files: uniqueFiles(groupItems),
  }));

  while (clusters.length > MAX_VISUAL_TOPICS) {
    clusters.sort(
      (a, b) =>
        a.items.length - b.items.length || a.files.length - b.files.length,
    );
    const smallest = clusters[0]!;
    const next = clusters[1]!;
    const rest = clusters.slice(2);
    clusters = [
      {
        id: 0,
        title: topicTitle([...smallest.items, ...next.items]),
        items: [...smallest.items, ...next.items],
        files: uniqueFiles([...smallest.items, ...next.items]),
      },
      ...rest,
    ];
  }

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
