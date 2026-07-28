import type { FarqConfig, ProviderName } from "../config.js";
import { isInteractive } from "../ui/theme.js";
import { promptProviderChoice } from "./choose.js";
import * as claude from "./claude.js";
import * as opencode from "./opencode.js";
import * as fake from "./fake.js";
import type { CompleteOptions } from "./fake.js";

export type Provider = {
  name: ProviderName;
  complete: (prompt: string, options?: CompleteOptions) => Promise<string>;
};

export type ResolveProviderOptions = {
  flag?: ProviderName;
  config?: FarqConfig;
  detect?: () => Promise<{ claude: boolean; opencode: boolean }>;
  log?: (msg: string) => void;
  /** Override TTY detection (tests). */
  interactive?: boolean;
  /** Override the interactive picker (tests). */
  choose?: () => Promise<"claude" | "opencode">;
};

export async function detectProviders(): Promise<{
  claude: boolean;
  opencode: boolean;
}> {
  const [c, o] = await Promise.all([
    claude.isInstalled(),
    opencode.isInstalled(),
  ]);
  return { claude: c, opencode: o };
}

export async function resolveProvider(
  options: ResolveProviderOptions = {},
): Promise<Provider> {
  const flag = options.flag;
  if (flag) return getProvider(flag);

  if (options.config?.provider) return getProvider(options.config.provider);

  const detected = options.detect
    ? await options.detect()
    : await detectProviders();

  if (detected.claude && detected.opencode) {
    const interactive = options.interactive ?? isInteractive();
    if (interactive) {
      const choose = options.choose ?? promptProviderChoice;
      return getProvider(await choose());
    }
    options.log?.(
      "Both claude and opencode found — using claude (non-interactive). Set provider in ~/.config/farq/config.json or pass --provider to choose.",
    );
    return getProvider("claude");
  }
  if (detected.claude) return getProvider("claude");
  if (detected.opencode) return getProvider("opencode");

  throw new Error(
    "No AI provider found. Install Claude Code (https://claude.ai/code) or OpenCode, or pass --provider fake for testing.",
  );
}

export function getProvider(name: ProviderName): Provider {
  switch (name) {
    case "claude":
      return { name, complete: claude.complete };
    case "opencode":
      return { name, complete: opencode.complete };
    case "fake":
      return { name, complete: fake.complete };
  }
}

export {
  FAKE_SUMMARY,
  FAKE_MOCKUP_CSS,
  FAKE_BEFORE_BODY,
  FAKE_AFTER_BODY,
  FAKE_DIAGRAM_CSS,
  FAKE_DIAGRAM_BODY,
} from "./fake.js";
