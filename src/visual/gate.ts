import type { DiffFile } from "../git.js";

export type GateDecision = "mockup" | "diagram" | "none";

const UI_EXT =
  /\.(tsx|jsx|vue|svelte|html|htm|css|scss|sass|less|css\.ts|module\.css)$/i;

const UI_HUNK =
  /[+-].*(class(Name)?=|style=|styled\.|createGlobalStyle|<([A-Z][A-Za-z0-9]*|[a-z]+)|@media|--[a-z-]+\s*:)/;

/**
 * Prefer a visual whenever possible:
 * - UI markup/style → mockup
 * - everything else with real file changes → diagram (flowchart / concept before-after)
 * - none only when there is nothing to depict
 *
 * The model can still return feasible:false so we never invent a bad visual.
 */
export function decideGate(files: DiffFile[]): GateDecision {
  if (files.length === 0) return "none";

  let uiHits = 0;

  for (const file of files) {
    const uiFile = UI_EXT.test(file.path);
    const patch = file.patch || "";

    if (uiFile && patch.length > 0) {
      if (
        UI_HUNK.test(patch) ||
        /\.(tsx|jsx|vue|svelte|html)$/i.test(file.path)
      ) {
        uiHits++;
      }
    }
  }

  if (uiHits > 0) return "mockup";
  return "diagram";
}
