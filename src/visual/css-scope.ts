/**
 * Prefix every top-level selector in a stylesheet so model-authored rules can
 * only affect one before/after panel. Runs at build time on our side, so the
 * output works on any Chrome (no CSS nesting or @scope support required).
 */
export function scopeCss(css: string, prefix: string): string {
  if (!css || !css.trim()) return "";
  return transformBlock(css, prefix);
}

function transformBlock(css: string, prefix: string): string {
  let out = "";
  let prelude = "";
  let i = 0;

  while (i < css.length) {
    const ch = css[i]!;

    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = skipString(css, i);
      prelude += css.slice(i, end);
      i = end;
      continue;
    }

    if (ch === "{") {
      const { body, next } = readBlock(css, i);
      out += renderRule(prelude.trim(), body, prefix);
      prelude = "";
      i = next;
      continue;
    }

    if (ch === ";") {
      // Statement at-rule such as @import / @charset — pass through untouched.
      const stmt = prelude.trim();
      if (stmt) out += `${stmt};`;
      prelude = "";
      i++;
      continue;
    }

    if (ch === "}") {
      // Stray closer from malformed input; drop it rather than corrupt output.
      i++;
      continue;
    }

    prelude += ch;
    i++;
  }

  return out;
}

/** At-rules whose body is a nested list of rules, not declarations. */
const NESTED_AT_RULES = new Set(["media", "supports", "container", "layer"]);

function renderRule(prelude: string, body: string, prefix: string): string {
  if (!prelude) return "";

  if (prelude.startsWith("@")) {
    const name = prelude.slice(1).split(/[\s({]/)[0]!.toLowerCase();
    if (NESTED_AT_RULES.has(name)) {
      return `${prelude}{${transformBlock(body, prefix)}}`;
    }
    // @keyframes / @font-face / @property / @page carry no page selectors.
    return `${prelude}{${body}}`;
  }

  return `${prefixSelectorList(prelude, prefix)}{${body}}`;
}

function prefixSelectorList(list: string, prefix: string): string {
  return splitTopLevel(list, ",")
    .map((sel) => prefixSelector(sel.trim(), prefix))
    .filter(Boolean)
    .join(",");
}

const ROOT_SELECTOR = /^(html|body|:root)\b/i;

function prefixSelector(selector: string, prefix: string): string {
  if (!selector) return "";
  // Root-level selectors would escape the panel — retarget them at the panel.
  if (ROOT_SELECTOR.test(selector)) {
    const rest = selector.replace(ROOT_SELECTOR, "").trim();
    if (!rest || rest === ">") return prefix;
    return `${prefix} ${rest}`.replace(/\s+/g, " ");
  }
  if (selector.startsWith("&")) {
    return `${prefix}${selector.slice(1)}`;
  }
  return `${prefix} ${selector}`;
}

/** Split on a separator that sits outside strings, parens and brackets. */
function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '"' || ch === "'") {
      const end = skipString(input, i);
      current += input.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);

    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
    i++;
  }

  parts.push(current);
  return parts;
}

/** Read a `{...}` block starting at openIdx; returns inner body and index after `}`. */
function readBlock(css: string, openIdx: number): { body: string; next: number } {
  let depth = 0;
  let i = openIdx;

  while (i < css.length) {
    const ch = css[i]!;
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { body: css.slice(openIdx + 1, i), next: i + 1 };
      }
    }
    i++;
  }

  return { body: css.slice(openIdx + 1), next: css.length };
}

function skipString(input: string, start: number): number {
  const quote = input[start]!;
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}
