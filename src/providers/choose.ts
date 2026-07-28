import * as readline from "node:readline/promises";
import type { ProviderName } from "../config.js";
import { brand, muted } from "../ui/theme.js";

/**
 * Ask which provider to use when both are installed.
 * Writes the prompt to stderr so stdout stays clean for the artifact.
 */
export async function promptProviderChoice(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Promise<ProviderName> {
  const write = (text: string) => {
    output.write(text);
  };

  write(`${brand()} ${muted("Both claude and opencode are installed.")}\n`);
  write(`${brand()} ${muted("  1) claude")}\n`);
  write(`${brand()} ${muted("  2) opencode")}\n`);
  write(
    `${brand()} ${muted("Choose 1 or 2 (set \"provider\" in config to skip):")}\n`,
  );

  const rl = readline.createInterface({ input, output });
  try {
    for (;;) {
      const answer = (await rl.question(`${brand()} > `)).trim().toLowerCase();
      if (answer === "1" || answer === "claude" || answer === "c") {
        return "claude";
      }
      if (answer === "2" || answer === "opencode" || answer === "o") {
        return "opencode";
      }
      write(`${brand()} ${muted("Please enter 1 (claude) or 2 (opencode).")}\n`);
    }
  } finally {
    rl.close();
  }
}
