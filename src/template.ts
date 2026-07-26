import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSummary } from "./schema.js";
import { truncateTitle, GITHUB_TITLE_MAX } from "./title.js";

export function findPrTemplate(cwd: string): string | null {
  const single = join(cwd, ".github", "pull_request_template.md");
  if (existsSync(single)) return readFileSync(single, "utf8");

  const alt = join(cwd, ".github", "PULL_REQUEST_TEMPLATE.md");
  if (existsSync(alt)) return readFileSync(alt, "utf8");

  const dir = join(cwd, ".github", "PULL_REQUEST_TEMPLATE");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files[0]) return readFileSync(join(dir, files[0]), "utf8");
  }
  return null;
}

export function fillPrTemplate(options: {
  template: string | null;
  summary: ChangeSummary;
  bodyMarkdown: string;
  imageUrl?: string | null;
}): { title: string; body: string } {
  const { title, overflow } = truncateTitle(
    options.summary.headline,
    GITHUB_TITLE_MAX,
  );

  let body = options.template?.trim() || "";
  if (!body) {
    body = options.bodyMarkdown;
    if (overflow) body = overflow + "\n\n" + body;
    if (options.imageUrl) {
      const re = /\]\((?:\.\/)?\.farq\/[^)]+\)/;
      if (re.test(body)) {
        body = body.replace(re, "](" + options.imageUrl + ")");
      } else {
        body =
          "### Before / After\n\n![before / after](" +
          options.imageUrl +
          ")\n\n" +
          body;
      }
    }
    return { title, body };
  }

  body = fillSection(body, /summary/i, options.summary.overview);
  const changes = options.summary.items
    .map((i) => "- **" + i.title + "** — " + i.description)
    .join("\n");
  body = fillSection(body, /changes?|what('s| is)? changed/i, changes);

  const testPlan =
    "_Please add verification steps._\n\n" +
    options.summary.items.map((i) => "- [ ] Verify: " + i.title).join("\n");
  body = fillSection(body, /test\s*plan|testing|how to test/i, testPlan);

  if (overflow) body = overflow + "\n\n" + body;

  if (options.imageUrl) {
    if (/before\s*\/\s*after|screenshots?/i.test(body)) {
      body = fillSection(
        body,
        /before\s*\/\s*after|screenshots?/i,
        "![before / after](" + options.imageUrl + ")",
      );
    } else {
      body +=
        "\n\n### Before / After\n\n![before / after](" +
        options.imageUrl +
        ")\n";
    }
  }

  return { title, body };
}

function fillSection(template: string, heading: RegExp, content: string): string {
  const lines = template.split("\n");
  let inSection = false;
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{1,3}\s+(.*)$/);
    if (h) {
      if (inSection) {
        end = i;
        break;
      }
      if (heading.test(h[1])) {
        inSection = true;
        start = i;
      }
    }
  }

  if (start === -1) return template;

  const before = lines.slice(0, start + 1);
  const after = lines.slice(end);
  return [...before, "", content, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}
