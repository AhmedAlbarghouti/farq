import { execa } from "execa";
import { platform } from "node:os";
import { join } from "node:path";
import {
  resolveExecutable,
  ToolNotFoundError,
} from "../tools.js";
import { clampViewport } from "./viewport.js";

const TIMEOUT_MS = 30_000;

export class ChromeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChromeError";
  }
}

export function resolveChrome(env: NodeJS.ProcessEnv = process.env): string {
  const local = env.LOCALAPPDATA ?? "";
  const pf = env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  const extraPaths =
    platform() === "win32"
      ? [
          join(pf, "Google", "Chrome", "Application", "chrome.exe"),
          join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
          join(local, "Google", "Chrome", "Application", "chrome.exe"),
          join(pf, "Chromium", "Application", "chrome.exe"),
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

  try {
    return resolveExecutable(
      [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "chrome",
        "chrome.exe",
      ],
      {
        env,
        envKey: "CHROME_PATH",
        extraPaths,
        notFoundMessage:
          "Chrome/Chromium not found — install Google Chrome or set CHROME_PATH",
      },
    );
  } catch (err) {
    if (err instanceof ToolNotFoundError) {
      throw new ChromeError(err.message);
    }
    throw err;
  }
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
  const { width, height } = clampViewport({
    width: options.width,
    height: options.height,
  });

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
