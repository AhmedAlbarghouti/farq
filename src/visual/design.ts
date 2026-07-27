import { scopeCss } from "./css-scope.js";
import { VIEWPORT_MAX_HEIGHT, VIEWPORT_MAX_WIDTH } from "./viewport.js";

export const THEME_NAMES = ["midnight", "daylight"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "midnight";

/**
 * Interior size of a rendered panel, in CSS pixels, measured from the shell
 * below at the 1280x720 frame. The model designs against these so its output
 * lands at roughly 1:1 instead of being scaled down into illegibility.
 *
 * Re-measure after changing the shell layout — `design.test.ts` checks these
 * against a real Chrome render whenever Chrome is available.
 */
export const MOCKUP_PANEL = { width: 605, height: 604 } as const;
export const DIAGRAM_PANEL = { width: 1230, height: 626 } as const;

/** Widths the model designs against before farq scales the result to fit. */
export const DEFAULT_MOCKUP_STAGE_WIDTH = 600;
export const DEFAULT_DIAGRAM_STAGE_WIDTH = 1200;

/** Bounds keep a stray stage_width from tanking legibility. */
const MOCKUP_STAGE_BOUNDS = { min: 320, max: 900 } as const;
const DIAGRAM_STAGE_BOUNDS = { min: 480, max: 1600 } as const;

export type ThemeTokens = {
  canvas: string;
  canvasAlt: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  positive: string;
  positiveSoft: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  shadow: string;
};

export type Theme = {
  name: ThemeName;
  tokens: ThemeTokens;
  /** Optional webfont import; omitted by default so renders stay offline-safe. */
  fontImport?: string;
  fontSans?: string;
  fontDisplay?: string;
};

const MIDNIGHT: ThemeTokens = {
  canvas: "#0d1117",
  canvasAlt: "#141b24",
  surface: "#161d26",
  surfaceAlt: "#1e2731",
  surfaceSunken: "#0a0e13",
  border: "#28323e",
  borderStrong: "#3a4756",
  text: "#e8eef5",
  textMuted: "#9aa8b8",
  textFaint: "#68778a",
  accent: "#4dd0e1",
  accentInk: "#06222a",
  accentSoft: "rgba(77,208,225,0.14)",
  positive: "#5ddc9a",
  positiveSoft: "rgba(93,220,154,0.14)",
  warning: "#f0b429",
  danger: "#ff7a7a",
  dangerSoft: "rgba(255,122,122,0.14)",
  shadow: "0 18px 44px rgba(0,0,0,0.45)",
};

const DAYLIGHT: ThemeTokens = {
  canvas: "#f2efe8",
  canvasAlt: "#e8e4da",
  surface: "#ffffff",
  surfaceAlt: "#f7f5f0",
  surfaceSunken: "#ebe7de",
  border: "#dcd6c9",
  borderStrong: "#bdb4a2",
  text: "#161a1f",
  textMuted: "#5b6673",
  textFaint: "#8b95a2",
  accent: "#0f7f8f",
  accentInk: "#ffffff",
  accentSoft: "rgba(15,127,143,0.12)",
  positive: "#12734c",
  positiveSoft: "rgba(18,115,76,0.12)",
  warning: "#a2670a",
  danger: "#c0392b",
  dangerSoft: "rgba(192,57,43,0.12)",
  shadow: "0 18px 40px rgba(28,24,16,0.14)",
};

const THEMES: Record<ThemeName, ThemeTokens> = {
  midnight: MIDNIGHT,
  daylight: DAYLIGHT,
};

const SYSTEM_SANS =
  '"Inter","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const SYSTEM_DISPLAY =
  '"Inter Tight","Inter","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const SYSTEM_MONO =
  '"JetBrains Mono","SF Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

export type ThemeOverrides = {
  theme?: string;
  accent?: string;
  fontImport?: string;
  fontSans?: string;
  fontDisplay?: string;
};

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value)
  );
}

export function resolveTheme(overrides: ThemeOverrides = {}): Theme {
  const name = isThemeName(overrides.theme) ? overrides.theme : DEFAULT_THEME;
  const tokens = { ...THEMES[name] };
  if (overrides.accent && isSafeCssValue(overrides.accent)) {
    tokens.accent = overrides.accent;
    tokens.accentSoft = `color-mix(in srgb, ${overrides.accent} 16%, transparent)`;
  }
  return {
    name,
    tokens,
    fontImport: overrides.fontImport,
    fontSans: overrides.fontSans,
    fontDisplay: overrides.fontDisplay,
  };
}

/** Reject anything that could break out of a CSS declaration. */
function isSafeCssValue(value: string): boolean {
  return value.length <= 64 && !/[;{}<>]/.test(value);
}

function tokenCss(theme: Theme): string {
  const t = theme.tokens;
  const sans = theme.fontSans ?? SYSTEM_SANS;
  const display = theme.fontDisplay ?? sans;
  return `:root{
--fq-canvas:${t.canvas};
--fq-canvas-alt:${t.canvasAlt};
--fq-surface:${t.surface};
--fq-surface-alt:${t.surfaceAlt};
--fq-surface-sunken:${t.surfaceSunken};
--fq-border:${t.border};
--fq-border-strong:${t.borderStrong};
--fq-text:${t.text};
--fq-text-muted:${t.textMuted};
--fq-text-faint:${t.textFaint};
--fq-accent:${t.accent};
--fq-accent-ink:${t.accentInk};
--fq-accent-soft:${t.accentSoft};
--fq-positive:${t.positive};
--fq-positive-soft:${t.positiveSoft};
--fq-warning:${t.warning};
--fq-danger:${t.danger};
--fq-danger-soft:${t.dangerSoft};
--fq-shadow:${t.shadow};
--fq-radius-sm:6px;
--fq-radius:10px;
--fq-radius-lg:16px;
--fq-space:8px;
--fq-font-sans:${sans};
--fq-font-display:${display};
--fq-font-mono:${SYSTEM_MONO};
}`;
}

/**
 * The exact vocabulary the model is allowed to use. Keeping this in one place
 * is what makes successive runs look like the same product.
 */
export const STYLE_CONTRACT = `Design tokens (CSS custom properties already defined — use them, do not redefine them):
- Colors: var(--fq-canvas), var(--fq-canvas-alt), var(--fq-surface), var(--fq-surface-alt), var(--fq-surface-sunken), var(--fq-border), var(--fq-border-strong), var(--fq-text), var(--fq-text-muted), var(--fq-text-faint), var(--fq-accent), var(--fq-accent-ink) (text on accent), var(--fq-accent-soft), var(--fq-positive), var(--fq-positive-soft), var(--fq-warning), var(--fq-danger), var(--fq-danger-soft)
- Type: var(--fq-font-display) for headings, var(--fq-font-sans) for body, var(--fq-font-mono) for identifiers
- Shape: var(--fq-radius-sm), var(--fq-radius), var(--fq-radius-lg), var(--fq-shadow)

Style rules (hard):
- Every color you choose MUST be one of the variables above. The only exception is a color the diff states literally (e.g. the code sets #ff5722) — then use that literal value.
- Do not set font-family to anything except the three variables. Do not @import fonts. Do not reference external URLs, images, or scripts.
- Do not add gradients, glows, blurs, or decorative background art. The page frame, background, header and badge are supplied by farq — do not recreate them.
- Use exactly one accent color for emphasis; neutrals carry the rest.
- Legal pairings only: text on a surface is var(--fq-text) or var(--fq-text-muted); text on var(--fq-accent-soft) is var(--fq-accent); text on var(--fq-accent) is var(--fq-accent-ink). Never put muted or faint text on a colored fill.
- Spacing in multiples of 4px. Body text >= 13px.
- No raw code listings, no JSON dumps, no lorem ipsum. Placeholder copy must read like real product data.`;

export type StageKind = "mockup" | "diagram";
export type StageSize = { width: number };

export function clampStageWidth(
  input?: { width?: number } | null,
  kind: StageKind = "mockup",
): StageSize {
  const bounds = kind === "diagram" ? DIAGRAM_STAGE_BOUNDS : MOCKUP_STAGE_BOUNDS;
  const fallback =
    kind === "diagram"
      ? DEFAULT_DIAGRAM_STAGE_WIDTH
      : DEFAULT_MOCKUP_STAGE_WIDTH;
  const raw = input?.width;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { width: fallback };
  }
  return {
    width: Math.min(bounds.max, Math.max(bounds.min, Math.round(raw))),
  };
}

/**
 * Measures each stage at its natural size and scales it to fit its viewport.
 * This is why the prompts no longer need to threaten the model about overflow:
 * content that is too tall shrinks instead of getting clipped.
 *
 * Short content is first stretched to the panel's aspect ratio so a mockup
 * reads as a full screen rather than a floating card on empty background.
 */
const FIT_SCRIPT = `(function(){
  function fit(){
    var stages=document.querySelectorAll('.fq-stage');
    for(var i=0;i<stages.length;i++){
      var s=stages[i],vp=s.parentElement;
      if(!vp)continue;
      s.style.transform='none';
      var aw=vp.clientWidth,ah=vp.clientHeight;
      if(aw>0&&ah>0){
        var natural=s.offsetWidth||aw;
        s.style.minHeight=(natural*(ah/aw))+'px';
      }
      var w=Math.max(s.scrollWidth,s.offsetWidth,1);
      var h=Math.max(s.scrollHeight,s.offsetHeight,1);
      var maxK=s.getAttribute('data-grow')==='1'?1.8:1;
      var k=Math.min(aw/w,ah/h,maxK);
      if(!isFinite(k)||k<=0)k=1;
      s.style.transformOrigin='top left';
      s.style.transform='translate('+((aw-w*k)/2)+'px,'+((ah-h*k)/2)+'px) scale('+k+')';
      s.setAttribute('data-fit',aw+'x'+ah+'@'+k.toFixed(3));
    }
  }
  fit();
  document.addEventListener('DOMContentLoaded',fit);
  window.addEventListener('load',fit);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
})();`;

function shellCss(theme: Theme): string {
  return `${theme.fontImport ? `@import url("${theme.fontImport}");\n` : ""}${tokenCss(theme)}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:${VIEWPORT_MAX_WIDTH}px;height:${VIEWPORT_MAX_HEIGHT}px;overflow:hidden}
body{background:var(--fq-canvas);color:var(--fq-text);font-family:var(--fq-font-sans);
  font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.fq-frame{display:flex;flex-direction:column;width:100%;height:100%;padding:20px 24px 24px}
.fq-head{display:flex;align-items:center;gap:12px;height:34px;flex:0 0 auto;margin-bottom:14px}
.fq-title{font-family:var(--fq-font-display);font-size:15px;font-weight:600;letter-spacing:-0.01em;
  color:var(--fq-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fq-rule{flex:1 1 auto;height:1px;background:var(--fq-border)}
.fq-badge{flex:0 0 auto;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--fq-text-faint);border:1px solid var(--fq-border);border-radius:999px;padding:4px 10px}
.fq-body{flex:1 1 auto;min-height:0;display:grid;gap:18px}
.fq-body--split{grid-template-columns:1fr 1fr}
.fq-body--single{grid-template-columns:1fr}
.fq-panel{display:flex;flex-direction:column;min-height:0;min-width:0}
.fq-label{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-bottom:8px;
  font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--fq-text-faint)}
.fq-label::after{content:"";flex:1 1 auto;height:1px;background:var(--fq-border)}
.fq-panel--after .fq-label{color:var(--fq-accent)}
.fq-panel--after .fq-label::after{background:var(--fq-accent-soft)}
.fq-viewport{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;
  background:var(--fq-canvas-alt);border:1px solid var(--fq-border);border-radius:var(--fq-radius);
  box-shadow:var(--fq-shadow)}
.fq-stage{position:absolute;top:0;left:0;transform-origin:top left;display:flex;flex-direction:column}
.fq-stage>*{flex:1 1 auto}
.fq-root{background:var(--fq-surface);color:var(--fq-text);font-family:var(--fq-font-sans)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function document_(options: {
  theme: Theme;
  title: string;
  extraCss: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>${shellCss(options.theme)}</style>
<style>${options.extraCss}</style>
</head>
<body>
${options.body}
<script>${FIT_SCRIPT}</script>
</body></html>`;
}

/**
 * `grow` lets a diagram scale past 1:1 to fill the frame. Mockups stay capped
 * at 1:1 so they read as a screenshot rather than a zoomed-in one.
 */
function stage(
  className: string,
  width: number,
  body: string,
  grow = false,
): string {
  const growAttr = grow ? ' data-grow="1"' : "";
  return `<div class="fq-viewport"><div class="fq-stage" style="width:${width}px"${growAttr}><div class="${className}">${body}</div></div></div>`;
}

export const PREVIEW_BADGE = "generated preview";

export type MockupDocumentInput = {
  theme: Theme;
  title: string;
  css?: string;
  beforeCss?: string;
  afterCss?: string;
  beforeBody: string;
  afterBody: string;
  stageWidth?: number;
  badge?: string;
};

export function buildMockupDocument(input: MockupDocumentInput): string {
  const width = clampStageWidth({ width: input.stageWidth }, "mockup").width;
  const extraCss = [
    input.css ?? "",
    scopeCss(input.beforeCss ?? "", ".fq-panel--before"),
    scopeCss(input.afterCss ?? "", ".fq-panel--after"),
  ]
    .filter(Boolean)
    .join("\n");

  const body = `<div class="fq-frame">
  <header class="fq-head">
    <span class="fq-title">${escapeHtml(input.title)}</span>
    <span class="fq-rule"></span>
    <span class="fq-badge">${escapeHtml(input.badge ?? PREVIEW_BADGE)}</span>
  </header>
  <div class="fq-body fq-body--split">
    <section class="fq-panel fq-panel--before">
      <div class="fq-label">Before</div>
      ${stage("fq-root", width, input.beforeBody)}
    </section>
    <section class="fq-panel fq-panel--after">
      <div class="fq-label">After</div>
      ${stage("fq-root", width, input.afterBody)}
    </section>
  </div>
</div>`;

  return document_({
    theme: input.theme,
    title: input.title,
    extraCss,
    body,
  });
}

export type DiagramDocumentInput = {
  theme: Theme;
  title: string;
  css?: string;
  body: string;
  stageWidth?: number;
  badge?: string;
};

export function buildDiagramDocument(input: DiagramDocumentInput): string {
  const width = clampStageWidth({ width: input.stageWidth }, "diagram").width;
  const body = `<div class="fq-frame">
  <header class="fq-head">
    <span class="fq-title">${escapeHtml(input.title)}</span>
    <span class="fq-rule"></span>
    <span class="fq-badge">${escapeHtml(input.badge ?? PREVIEW_BADGE)}</span>
  </header>
  <div class="fq-body fq-body--single">
    <section class="fq-panel">
      ${stage("fq-diagram", width, input.body, true)}
    </section>
  </div>
</div>`;

  return document_({
    theme: input.theme,
    title: input.title,
    extraCss: `.fq-diagram{display:flex;flex-direction:column;justify-content:center;background:transparent;color:var(--fq-text);font-family:var(--fq-font-sans);padding:8px}\n${input.css ?? ""}`,
    body,
  });
}

export type ComposeDocumentInput = {
  theme: Theme;
  title: string;
  beforeBase64: string;
  afterBase64: string;
  badge?: string;
};

/** Frame for user-supplied before/after PNGs — same chrome as generated visuals. */
export function buildComposeDocument(input: ComposeDocumentInput): string {
  const body = `<div class="fq-frame">
  <header class="fq-head">
    <span class="fq-title">${escapeHtml(input.title)}</span>
    <span class="fq-rule"></span>
    <span class="fq-badge">${escapeHtml(input.badge ?? "before / after")}</span>
  </header>
  <div class="fq-body fq-body--split">
    <section class="fq-panel fq-panel--before">
      <div class="fq-label">Before</div>
      <div class="fq-viewport fq-shot"><img alt="Before" src="data:image/png;base64,${input.beforeBase64}" /></div>
    </section>
    <section class="fq-panel fq-panel--after">
      <div class="fq-label">After</div>
      <div class="fq-viewport fq-shot"><img alt="After" src="data:image/png;base64,${input.afterBase64}" /></div>
    </section>
  </div>
</div>`;

  return document_({
    theme: input.theme,
    title: input.title,
    extraCss: `.fq-shot{display:flex;align-items:center;justify-content:center;background:var(--fq-surface-sunken)}
.fq-shot img{max-width:100%;max-height:100%;width:auto;height:auto;display:block}`,
    body,
  });
}
