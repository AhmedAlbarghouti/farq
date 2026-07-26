import { describe, expect, it } from "vitest";
import { decideGate } from "../src/visual/gate.js";
import type { DiffFile } from "../src/git.js";

function file(path: string, patch: string): DiffFile {
  return { path, status: "M", patch };
}

describe("decideGate", () => {
  it("routes CSS/markup diffs to mockup", () => {
    const decision = decideGate([
      file(
        "src/components/OrderCard.tsx",
        `@@\n- <div className="card">Order</div>\n+ <div className="card">Order<span className="badge">pending</span></div>\n`,
      ),
      file(
        "src/components/OrderCard.module.css",
        `@@\n+.badge { color: green; }\n`,
      ),
    ]);
    expect(decision).toBe("mockup");
  });

  it("routes route/serializer diffs to diagram", () => {
    const decision = decideGate([
      file(
        "src/api/orders/serializer.ts",
        `@@\n+ refund_status: order.refundStatus,\n`,
      ),
      file(
        "src/api/orders/routes.ts",
        `@@\n+ router.get('/orders/:id', handler)\n`,
      ),
    ]);
    expect(decision).toBe("diagram");
  });

  it("routes pure logic diffs to none", () => {
    const decision = decideGate([
      file(
        "src/lib/math.ts",
        `@@\n- export function add(a,b){return a+b}\n+ export function add(a,b){return a+b+0}\n`,
      ),
    ]);
    expect(decision).toBe("none");
  });
});
