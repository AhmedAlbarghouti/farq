import type { ProviderName } from "../config.js";

/**
 * Rotating status lines. `{p}` is replaced with the provider name so a line
 * always says who is doing the work. Keep templates <= 37 chars so the longest
 * provider name still fits the one-line spinner.
 */
const BANKS = {
  diff: [
    "gathering the diff…",
    "asking git politely…",
    "reading what you actually did…",
    "diffing against the merge base…",
    "counting the damage…",
  ],
  summarize: [
    "{p} is reading the diff…",
    "{p} is grouping the mess…",
    "{p} is finding the story…",
    "{p} is naming things (hard part)…",
    "{p} is deciding what matters…",
    "{p} is skipping the boring parts…",
    "{p} is drafting your PR title…",
    "{p} is writing the blurb…",
  ],
  topics: [
    "planning the visuals…",
    "splitting the story into scenes…",
    "deciding how many pictures…",
    "grouping changes into topics…",
  ],
  mockup: [
    "{p} is sketching the before…",
    "{p} is sketching the after…",
    "{p} is laying out the mockup…",
    "{p} is writing placeholder copy…",
    "{p} is obeying the design tokens…",
    "{p} is resisting a redesign…",
    "{p} is measuring the spacing…",
  ],
  diagram: [
    "{p} is boxing a flowchart…",
    "{p} is drawing arrows…",
    "{p} is explaining it with boxes…",
    "{p} is keeping it conceptual…",
    "{p} is deleting a wall of text…",
  ],
  shoot: [
    "chrome is taking the shot…",
    "chrome is scaling it to fit…",
    "waiting on headless chrome…",
    "pressing the shutter…",
  ],
  visual: [
    "{p} is drawing the difference…",
    "{p} is picking a composition…",
    "chrome is warming up…",
    "making the change look obvious…",
  ],
  open: [
    "talking to gh…",
    "filling the PR template…",
    "uploading the visuals…",
    "shipping the PR body…",
    "almost there…",
  ],
} satisfies Record<string, string[]>;

export type LineBank = keyof typeof BANKS;

export function linesFor(bank: LineBank, provider?: ProviderName): string[] {
  const name = provider ?? "claude";
  return BANKS[bank].map((line) => line.replaceAll("{p}", name));
}

/** Short, honest name for the stage — the witty line sits next to it. */
export function labelFor(bank: LineBank): string {
  switch (bank) {
    case "diff":
      return "diff";
    case "summarize":
      return "summary";
    case "topics":
      return "planning";
    case "mockup":
      return "mockup";
    case "diagram":
      return "diagram";
    case "shoot":
      return "capture";
    case "visual":
      return "visuals";
    case "open":
      return "pull request";
  }
}
