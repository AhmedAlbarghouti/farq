import { execa } from "execa";
import type { CompleteOptions } from "./fake.js";

const TIMEOUT_MS = 120_000;

/**
 * farq only ever asks for JSON back, so the user's MCP servers, skills, hooks
 * and project CLAUDE.md are pure startup cost — and a source of drift in the
 * output. Skipping them roughly halves per-call latency.
 */
const FAST_ARGS = ["--strict-mcp-config", "--setting-sources", ""];

/** Tried in order; each falls back to the next when the CLI rejects a flag. */
const ARG_VARIANTS = [
  FAST_ARGS,
  [],
  // Empty allowedTools hangs on some versions, so it stays the last resort.
  ["--allowedTools", ""],
];

export const UNSUPPORTED_FLAG = /unknown option|unknown argument|unrecognized|allowedTools|setting-sources|strict-mcp-config/i;

export async function complete(
  prompt: string,
  options: CompleteOptions = {},
): Promise<string> {
  const baseArgs = ["-p", "--output-format", "json", "--max-turns", "1"];
  if (options.model) baseArgs.push("--model", options.model);

  let lastErr: unknown;

  for (let i = 0; i < ARG_VARIANTS.length; i++) {
    const canRetry = i < ARG_VARIANTS.length - 1;
    const args = [...baseArgs, ...ARG_VARIANTS[i]!];

    let result;
    try {
      result = await execa("claude", args, {
        input: prompt,
        timeout: TIMEOUT_MS,
        reject: false,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      const e = err as { timedOut?: boolean; message?: string };
      if (e.timedOut) throw notResponding();
      if (canRetry && UNSUPPORTED_FLAG.test(e.message ?? "")) {
        lastErr = err;
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (result.timedOut) throw notResponding();

    const text = (result.stdout || result.stderr || "").trim();
    const diagnostics = `${result.stderr ?? ""} ${text}`;

    if (!text && result.exitCode !== 0) {
      const err = new Error(
        `claude failed (exit ${result.exitCode}): ${(result.stderr || "no output").trim()}`,
      );
      if (canRetry && UNSUPPORTED_FLAG.test(diagnostics)) {
        lastErr = err;
        continue;
      }
      throw err;
    }

    try {
      return parseClaudeOutput(text);
    } catch (parseErr) {
      if (canRetry && UNSUPPORTED_FLAG.test(diagnostics)) {
        lastErr = parseErr;
        continue;
      }
      throw parseErr;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("claude failed");
}

function notResponding(): Error {
  return new Error(
    "claude did not respond — check that it's authenticated (`claude` login)",
  );
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
