import type { ProviderName } from "../config.js";

const SUMMARIZE: Record<ProviderName, string[]> = {
  claude: [
    "claude is reading the diff…",
    "claude is grouping the mess…",
    "claude is writing the blurb…",
  ],
  opencode: [
    "opencode is reading the diff…",
    "opencode is grouping the mess…",
    "opencode is writing the blurb…",
  ],
  fake: [
    "fake is vibing on hard mode…",
    "fake is inventing nothing new…",
    "fake is shipping canned vibes…",
  ],
};

const VISUAL: Record<ProviderName, string[]> = {
  claude: [
    "claude is sketching a mockup…",
    "claude is boxing a flowchart…",
    "chrome is taking the shot…",
  ],
  opencode: [
    "opencode is sketching a mockup…",
    "opencode is boxing a flowchart…",
    "chrome is taking the shot…",
  ],
  fake: [
    "fake is drawing boxes…",
    "fake is pretending to design…",
    "chrome is taking the shot…",
  ],
};

const OPEN = [
  "talking to gh…",
  "shipping the PR body…",
  "almost there…",
];

export type LineBank = "summarize" | "visual" | "open" | "diff";

export function linesFor(
  bank: LineBank,
  provider?: ProviderName,
): string[] {
  if (bank === "diff") {
    return ["gathering the diff…", "asking git politely…"];
  }
  if (bank === "open") return OPEN;
  const p = provider ?? "claude";
  return bank === "summarize" ? SUMMARIZE[p] : VISUAL[p];
}
