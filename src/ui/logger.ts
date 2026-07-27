import type { ProviderName } from "../config.js";
import { labelFor, linesFor, type LineBank } from "./lines.js";
import { startSpinner, type SpinnerHandle } from "./spinner.js";
import { brand, fail, muted, ok } from "./theme.js";

export type StageOptions = {
  provider?: ProviderName;
  /** Override the stage label shown before the witty line. */
  label?: string;
};

export type Ui = {
  /** Declare how many stages this run will have, so steps read as [2/4]. */
  plan: (totalSteps: number) => void;
  /** Plain note (no spinner). */
  note: (text: string) => void;
  /** Start a numbered stage with rotating witty lines. */
  stage: (bank: LineBank, options?: StageOptions | ProviderName) => SpinnerHandle;
  error: (text: string) => void;
  success: (text: string) => void;
};

export function createUi(): Ui {
  let total = 0;
  let step = 0;

  return {
    plan(totalSteps) {
      total = Math.max(0, Math.floor(totalSteps));
      step = 0;
    },
    note(text) {
      process.stderr.write(`${brand()} ${muted(text)}\n`);
    },
    stage(bank, options) {
      const opts: StageOptions =
        typeof options === "string" ? { provider: options } : (options ?? {});
      step++;
      return startSpinner({
        lines: linesFor(bank, opts.provider),
        label: opts.label ?? labelFor(bank),
        step: total > 0 ? { index: Math.min(step, total), total } : undefined,
      });
    },
    error(text) {
      process.stderr.write(`${brand()} ${fail(text)}\n`);
    },
    success(text) {
      process.stderr.write(`${brand()} ${ok(text)}\n`);
    },
  };
}
