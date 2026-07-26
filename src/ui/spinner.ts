import { brand, accent, isInteractive, muted, ok, fail } from "./theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type SpinnerHandle = {
  update: (text: string) => void;
  succeed: (text: string) => void;
  fail: (text: string) => void;
  stop: () => void;
};

export function startSpinner(
  initial: string,
  rotateLines?: string[],
): SpinnerHandle {
  const interactive = isInteractive();
  let text = initial;
  let i = 0;
  let lineIdx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lineTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const render = () => {
    if (!interactive || stopped) return;
    const frame = accent(FRAMES[i % FRAMES.length]!);
    process.stderr.write(`\r\x1b[2K${brand()} ${frame} ${text}`);
    i++;
  };

  if (interactive) {
    render();
    timer = setInterval(render, 80);
    if (rotateLines && rotateLines.length > 1) {
      lineTimer = setInterval(() => {
        lineIdx = (lineIdx + 1) % rotateLines.length;
        text = rotateLines[lineIdx]!;
      }, 2000);
    }
  } else {
    process.stderr.write(`${brand()} ${muted(text)}\n`);
  }

  return {
    update(next: string) {
      text = next;
      if (!interactive) process.stderr.write(`${brand()} ${muted(text)}\n`);
    },
    succeed(next: string) {
      this.stop();
      process.stderr.write(`${brand()} ${ok(next)}\n`);
    },
    fail(next: string) {
      this.stop();
      process.stderr.write(`${brand()} ${fail(next)}\n`);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      if (lineTimer) clearInterval(lineTimer);
      if (interactive) process.stderr.write("\r\x1b[2K");
    },
  };
}
