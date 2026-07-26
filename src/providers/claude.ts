import { execa } from "execa";
import type { CompleteOptions } from "./fake.js";

const TIMEOUT_MS = 120_000;

export async function complete(
  prompt: string,
  options: CompleteOptions = {},
): Promise<string> {
  const baseArgs = ["-p", "--output-format", "json", "--max-turns", "1"];
  if (options.model) baseArgs.push("--model", options.model);

  const attempts = [
    [...baseArgs, "--allowedTools", ""],
    [...baseArgs],
  ];

  let lastErr: unknown;
  for (const args of attempts) {
    try {
      const result = await execa("claude", args, {
        input: prompt,
        timeout: TIMEOUT_MS,
        reject: true,
        stdout: "pipe",
        stderr: "pipe",
      });
      return parseClaudeOutput(result.stdout);
    } catch (err) {
      const e = err as {
        timedOut?: boolean;
        stderr?: string;
        message?: string;
        exitCode?: number;
      };
      if (e.timedOut) {
        throw new Error(
          "claude did not respond — check that it's authenticated",
        );
      }
      // Retry without allowedTools if that flag was rejected
      if (
        args.includes("--allowedTools") &&
        /allowedTools|unknown option|unexpected/i.test(
          `${e.stderr ?? ""} ${e.message ?? ""}`,
        )
      ) {
        lastErr = err;
        continue;
      }
      throw new Error(
        `claude failed: ${(e.stderr || e.message || "unknown error").trim()}`,
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("claude failed");
}

function parseClaudeOutput(stdout: string): string {
  try {
    const envelope = JSON.parse(stdout) as {
      result?: string;
      is_error?: boolean;
      error?: string;
    };
    if (envelope.is_error) {
      throw new Error(envelope.error || "claude returned is_error: true");
    }
    if (typeof envelope.result === "string") return envelope.result;
  } catch (err) {
    if (err instanceof Error && err.message.includes("is_error")) throw err;
    // fall through — maybe raw text
  }
  return stdout;
}

export async function isInstalled(): Promise<boolean> {
  try {
    await execa("claude", ["--version"], { timeout: 10_000, reject: true });
    return true;
  } catch {
    return false;
  }
}
