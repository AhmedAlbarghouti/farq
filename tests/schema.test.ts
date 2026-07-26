import { describe, expect, it } from "vitest";
import { ChangeSummarySchema } from "../src/schema.js";

const valid = {
  headline: "Add refund status",
  overview: "Expose refund status on orders.",
  items: [
    {
      category: "feature",
      title: "Refund status field",
      description: "Adds refund_status to the order response.",
      files: ["src/orders.ts"],
    },
  ],
  breaking_changes: [],
};

describe("ChangeSummarySchema", () => {
  it("accepts a valid summary without schema_version", () => {
    const parsed = ChangeSummarySchema.parse(valid);
    expect(parsed.headline).toBe("Add refund status");
    expect(parsed).not.toHaveProperty("schema_version");
  });

  it("rejects an unknown category", () => {
    expect(() =>
      ChangeSummarySchema.parse({
        ...valid,
        items: [{ ...valid.items[0], category: "misc" }],
      }),
    ).toThrow();
  });

  it("rejects a missing headline", () => {
    const { headline: _, ...rest } = valid;
    expect(() => ChangeSummarySchema.parse(rest)).toThrow();
  });

  it("accepts optional why_it_matters and visual_notes", () => {
    const parsed = ChangeSummarySchema.parse({
      ...valid,
      visual_notes: "Show status badge",
      items: [
        {
          ...valid.items[0],
          why_it_matters: "Clients can see refund progress.",
        },
      ],
    });
    expect(parsed.visual_notes).toBe("Show status badge");
    expect(parsed.items[0].why_it_matters).toBe(
      "Clients can see refund progress.",
    );
  });
});
