import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { promptProviderChoice } from "../src/providers/choose.js";

async function chooseWithAnswers(answers: string[]): Promise<{
  choice: "claude" | "opencode";
  out: string;
}> {
  const input = new PassThrough();
  const output = new PassThrough();
  let out = "";
  output.on("data", (chunk) => {
    out += String(chunk);
  });

  const pending = promptProviderChoice(input, output);
  for (const answer of answers) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    input.write(`${answer}\n`);
  }
  const choice = await pending;
  input.end();
  return { choice, out };
}

describe("promptProviderChoice", () => {
  it("accepts numeric and name answers", async () => {
    const a = await chooseWithAnswers(["2"]);
    expect(a.choice).toBe("opencode");
    expect(a.out).toMatch(/Both claude and opencode/);

    const b = await chooseWithAnswers(["claude"]);
    expect(b.choice).toBe("claude");
  });

  it("re-prompts on invalid input", async () => {
    const { choice, out } = await chooseWithAnswers(["nope", "1"]);
    expect(choice).toBe("claude");
    expect(out).toMatch(/Please enter 1/);
  });
});
