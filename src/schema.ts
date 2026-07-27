import { z } from "zod";

export const CATEGORIES = [
  "feature",
  "fix",
  "improvement",
  "refactor",
  "chore",
  "docs",
  "perf",
  "security",
] as const;

export const ChangeItemSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(120),
  description: z.string().min(1),
  why_it_matters: z.string().min(1).optional(),
  files: z.array(z.string()).default([]),
});

/**
 * Grouping of items into visual topics, returned by the same call that writes
 * the summary so the visual pipeline does not need its own round-trip.
 */
export const VisualTopicSchema = z.object({
  title: z.string().min(1).max(80),
  item_indices: z.array(z.number().int().nonnegative()).min(1),
});

export const ChangeSummarySchema = z.object({
  headline: z.string().min(1).max(140),
  overview: z.string().min(1),
  items: z.array(ChangeItemSchema).min(1),
  breaking_changes: z.array(z.string()).default([]),
  visual_notes: z.string().min(1).optional(),
  visual_topics: z.array(VisualTopicSchema).optional(),
});

export type ChangeSummary = z.infer<typeof ChangeSummarySchema>;
export type ChangeItem = z.infer<typeof ChangeItemSchema>;
export type VisualTopicHint = z.infer<typeof VisualTopicSchema>;

/** Compact schema description embedded in AI prompts. */
export const CHANGE_SUMMARY_SCHEMA_PROMPT = `{
  "headline": "string <=140 — one-line summary (PR title)",
  "overview": "string — 1-3 sentences in requested tone",
  "items": [{
    "category": "feature|fix|improvement|refactor|chore|docs|perf|security",
    "title": "string <=120",
    "description": "string",
    "why_it_matters": "string (optional; required for client tone)",
    "files": ["string"]
  }],
  "breaking_changes": ["string"],
  "visual_notes": "string (optional)",
  "visual_topics": [{
    "title": "string <=80 — human topic name",
    "item_indices": [0]
  }]
}`;
