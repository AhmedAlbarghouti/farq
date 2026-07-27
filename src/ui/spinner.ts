import { accent, brand, dim, fail, isInteractive, muted, ok } from "./theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;
const ROTATE_MS = 2600;
/** Only surface a timer once a stage is slow enough to feel slow. */
const ELAPSED_AFTER_MS = 3000;

export type SpinnerHandle = {
  /** Replace the stage label (rarely needed). */
  update: (label: string) => void;
  /** Swap the rotating witty lines mid-stage, e.g. summarize → mockup. */
  setLines: (lines: string[]) => void;
  /** Concrete sub-stage status shown after the witty line. */
  detail: (text: string | null) => void;
  succeed: (text: string) => void;
  fail: (text: string) => void;
  stop: () => void;
};

export type SpinnerOptions = {
  lines: string[];
  label?: string;
  step?: { index: number; total: number };
};

export function startSpinner(options: SpinnerOptions): SpinnerHandle {
  const interactive = isInteractive();
  const started = Date.now();

  let label = options.label ?? "working";
  let lines = rotateOrder(options.lines);
  let lineIdx = 0;
  let detailText: string | null = null;
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lineTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastStatic = "";

  const stepTag = options.step
    ? `[${options.step.index}/${options.step.total}] `
    : "";

  const elapsedSeconds = () => (Date.now() - started) / 1000;

  const compose = (): string => {
    const parts = [lines[lineIdx] ?? label];
    if (detailText) parts.push(detailText);
    const elapsed =
      Date.now() - started >= ELAPSED_AFTER_MS
        ? `${Math.round(elapsedSeconds())}s`
        : "";
    const body = parts.join(dim(" · "));
    const tail = elapsed ? `${dim(" · ")}${dim(elapsed)}` : "";
    return `${accent(stepTag)}${label}${dim(" · ")}${muted(body)}${tail}`;
  };

  const render = () => {
    if (!interactive || stopped) return;
    const line = `${brand()} ${accent(FRAMES[frame % FRAMES.length]!)} ${compose()}`;
    process.stderr.write(`\r\x1b[2K${truncate(line)}`);
    frame++;
  };

  const printStatic = () => {
    const next = detailText ? `${label} · ${detailText}` : label;
    if (next === lastStatic) return;
    lastStatic = next;
    process.stderr.write(`${brand()} ${muted(`${stepTag}${next}`)}\n`);
  };

  if (interactive) {
    render();
    timer = setInterval(render, FRAME_MS);
    if (lines.length > 1) {
      lineTimer = setInterval(() => {
        lineIdx = (lineIdx + 1) % lines.length;
      }, ROTATE_MS);
    }
  } else {
    printStatic();
  }

  const handle: SpinnerHandle = {
    update(next) {
      label = next;
      if (!interactive) printStatic();
    },
    setLines(next) {
      if (next.length === 0) return;
      lines = rotateOrder(next);
      lineIdx = 0;
    },
    detail(text) {
      detailText = text && text.trim() ? text.trim() : null;
      if (!interactive) printStatic();
    },
    succeed(text) {
      handle.stop();
      process.stderr.write(
        `${brand()} ${ok(text)}${dim(` ${formatDuration(elapsedSeconds())}`)}\n`,
      );
    },
    fail(text) {
      handle.stop();
      process.stderr.write(`${brand()} ${fail(text)}\n`);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      if (lineTimer) clearInterval(lineTimer);
      if (interactive) process.stderr.write("\r\x1b[2K");
    },
  };

  return handle;
}

function formatDuration(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

/** Keep the first line stable, shuffle the rest so reruns feel different. */
function rotateOrder(lines: string[]): string[] {
  if (lines.length < 3) return [...lines];
  const [head, ...tail] = lines;
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tail[i], tail[j]] = [tail[j]!, tail[i]!];
  }
  return [head!, ...tail];
}

/** Trim to the terminal width, ignoring ANSI escapes when measuring. */
function truncate(line: string): string {
  const columns = process.stderr.columns ?? 0;
  if (!columns || columns < 20) return line;
  const max = columns - 1;
  let visible = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\x1b") {
      const end = line.indexOf("m", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (visible === max) return `${line.slice(0, i)}…\x1b[0m`;
    visible++;
    i++;
  }
  return line;
}
