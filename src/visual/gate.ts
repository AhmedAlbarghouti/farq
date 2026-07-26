import type { DiffFile } from "../git.js";

export type GateDecision = "mockup" | "diagram" | "none";

const UI_EXT =
  /\.(tsx|jsx|vue|svelte|html|htm|css|scss|sass|less|css\.ts|module\.css)$/i;
const DIAGRAM_PATH =
  /(route|routes|controller|serializer|schema|openapi|swagger|graphql|resolver|migration|migrations|api\/|handlers?)/i;
const DIAGRAM_EXT = /\.(graphql|gql|proto|sql|prisma)$/i;

const UI_HUNK =
  /[+-].*(class(Name)?=|style=|styled\.|createGlobalStyle|<([A-Z][A-Za-z0-9]*|[a-z]+)|@media|--[a-z-]+\s*:)/;

const API_HUNK =
  /[+-].*(app\.(get|post|put|patch|delete)|router\.|@Get|@Post|type\s+\w+Response|z\.object|JSON\.schema|createTable|addColumn|properties\s*:|Query\s|Mutation\s)/i;

/**
 * Conservative heuristic: when in doubt, none.
 */
export function decideGate(files: DiffFile[]): GateDecision {
  let uiHits = 0;
  let diagramHits = 0;

  for (const file of files) {
    const uiFile = UI_EXT.test(file.path);
    const diagramFile =
      DIAGRAM_PATH.test(file.path) || DIAGRAM_EXT.test(file.path);
    const patch = file.patch || "";

    if (uiFile && (UI_HUNK.test(patch) || patch.length > 0)) {
      // Prefer meaningful markup/style hunks; accept UI file with any hunk as soft signal
      if (UI_HUNK.test(patch) || /\.(tsx|jsx|vue|svelte|html)$/i.test(file.path)) {
        uiHits++;
      }
    }
    if (diagramFile || API_HUNK.test(patch)) {
      if (diagramFile || API_HUNK.test(patch)) diagramHits++;
    }
  }

  if (uiHits > 0 && uiHits >= diagramHits) return "mockup";
  if (diagramHits > 0) return "diagram";
  return "none";
}
