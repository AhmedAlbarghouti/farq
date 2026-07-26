import { execa } from "execa";
import type { CompleteOptions } from "./fake.js";

const TIMEOUT_MS = 120_000;

export async function complete(
  prompt: string,
  options: CompleteOptions = {},
): Promise<string> {
  const baseArgs = ["-p", "--output-format", "json", "--max-turns", "1"];
  if (options.model) baseArgs.push("--model", options.model);

  // Prefer without allowedTools first — empty allowedTools hangs/fails on some versions.
  const attempts = [[...baseArgs], [...baseArgs, "--allowedTools", ""]];

  let lastErr: unknown;
  for (const args of attempts) {
    try {
      const result = await execa("claude", args, {
        input: prompt,
        timeout: TIMEOUT_MS,
        reject: false,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.timedOut) {
        throw new Error(
          "claude did not respond — check that it's authenticated (`claude` login)",
        );
      }

      const text = (result.stdout || result.stderr || "").trim();
      if (!text && result.exitCode !== 0) {
        throw new Error(
          `claude failed (exit ${result.exitCode}): ${(result.stderr || "no output").trim()}`,
        );
      }

      try {
        return parseClaudeOutput(text);
      } catch (parseErr) {
        // Retry next arg set only when allowedTools looks unsupported
        if (
          args.includes("--allowedTools") &&
          /allowedTools|unknown option|unexpected/i.test(
            `${result.stderr ?? ""} ${text}`,
          )
        ) {
          lastErr = parseErr;
          continue;
        }
        throw parseErr;
      }
    } catch (err) {
      const e = err as { timedOut?: boolean; message?: string };
      if (e.timedOut || /did not respond/i.test(e.message ?? "")) {
        throw new Error(
          "claude did not respond — check that it's authenticated (`claude` login)",
        );
      }
      lastErr = err;
      if (!args.includes("--allowedTools")) {
        // try with allowedTools only if first attempt was a flag-related failure
        const msg = e.message ?? "";
        if (/unknown option|allowedTools/i.test(msg)) continue;
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("claude failed");
}

function parseClaudeOutput(stdout: string): string {
  try {
    const envelope = JSON.parse(stdout) as {
      result?: string;
      is_error?: boolean;
      error?: string;
    };
    if (envelope.is_error) {
      const detail = envelope.result || envelope.error || "claude returned is_error: true";
      if (/authenticat|401|OAuth/i.test(detail)) {
        throw new Error(
          `claude authentication failed — run \`claude\` and sign in again. (${detail})`,
        );
      }
      throw new Error(detail);
    }
    if (typeof envelope.result === "string") return envelope.result;
  } catch (err) {
    if (err instanceof Error && /claude |authenticat|is_error/i.test(err.message)) {
      throw err;
    }
    // fall through — maybe raw text / not JSON
  }
  if (!stdout.trim()) {
    throw new Error("claude returned empty output");
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
