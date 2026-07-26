import { existsSync } from "node:fs";
import { execa } from "execa";
import { platform } from "node:os";

const TIMEOUT_MS = 30_000;

export class ChromeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChromeError";
  }
}

export function resolveChrome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHROME_PATH) {
    if (existsSync(env.CHROME_PATH)) return env.CHROME_PATH;
    throw new ChromeError(
      `CHROME_PATH not found: ${env.CHROME_PATH}`,
    );
  }

  const candidates =
    platform() === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          "C:\\Program Files\\Chromium\\Application\\chrome.exe",
        ]
      : platform() === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];

  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }

  throw new ChromeError(
    "Chrome/Chromium not found — install Google Chrome or set CHROME_PATH",
  );
}

export type ScreenshotOptions = {
  chromePath?: string;
  url: string;
  outPath: string;
  width?: number;
  height?: number;
};

export async function screenshotHtml(
  options: ScreenshotOptions,
): Promise<void> {
  const chrome = options.chromePath ?? resolveChrome();
  const width = options.width ?? 1280;
  const height = options.height ?? 900;

  try {
    await execa(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--window-size=${width},${height}`,
        `--screenshot=${options.outPath}`,
        options.url,
      ],
      { timeout: TIMEOUT_MS, reject: true },
    );
  } catch (err) {
    const e = err as { timedOut?: boolean; message?: string };
    if (e.timedOut) {
      throw new ChromeError("Chrome screenshot timed out after 30s");
    }
    throw new ChromeError(
      `Chrome screenshot failed: ${e.message ?? "unknown error"}`,
    );
  }
}
