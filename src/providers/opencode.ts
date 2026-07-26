import { execa } from "execa";
import type { CompleteOptions } from "./fake.js";

const TIMEOUT_MS = 120_000;

export async function complete(
  prompt: string,
  options: CompleteOptions = {},
): Promise<string> {
  const args = ["run"];
  if (options.model) args.push("--model", options.model);
  args.push(prompt);

  try {
    const result = await execa("opencode", args, {
      timeout: TIMEOUT_MS,
      reject: true,
      stdout: "pipe",
      stderr: "pipe",
    });
    return result.stdout;
  } catch (err) {
    const e = err as { timedOut?: boolean; stderr?: string; message?: string };
    if (e.timedOut) {
      throw new Error(
        "opencode did not respond — check that it's authenticated",
      );
    }
    throw new Error(
      `opencode failed: ${(e.stderr || e.message || "unknown error").trim()}`,
    );
  }
}

export async function isInstalled(): Promise<boolean> {
  try {
    await execa("opencode", ["--version"], { timeout: 10_000, reject: true });
    return true;
  } catch {
    return false;
  }
}
