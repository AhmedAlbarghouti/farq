import type { ProviderName } from "../config.js";
import { linesFor, type LineBank } from "./lines.js";
import { startSpinner, type SpinnerHandle } from "./spinner.js";
import { brand, fail, muted, ok } from "./theme.js";

export type Ui = {
  /** Plain note (no spinner). */
  note: (text: string) => void;
  /** Start a spinning stage with optional rotating witty lines. */
  stage: (bank: LineBank, provider?: ProviderName) => SpinnerHandle;
  error: (text: string) => void;
  success: (text: string) => void;
};

export function createUi(): Ui {
  return {
    note(text) {
      process.stderr.write(`${brand()} ${muted(text)}\n`);
    },
    stage(bank, provider) {
      const lines = linesFor(bank, provider);
      return startSpinner(lines[0] ?? "working…", lines);
    },
    error(text) {
      process.stderr.write(`${brand()} ${fail(text)}\n`);
    },
    success(text) {
      process.stderr.write(`${brand()} ${ok(text)}\n`);
    },
  };
}
