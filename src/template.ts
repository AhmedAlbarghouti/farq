import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSummary } from "./schema.js";
import { truncateTitle, GITHUB_TITLE_MAX } from "./title.js";
import { stripLocalImageNote } from "./tools.js";

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

export type TemplateImage = {
  url: string;
  title?: string;
};

export function fillPrTemplate(options: {
  template: string | null;
  summary: ChangeSummary;
  bodyMarkdown: string;
  /** @deprecated prefer images */
  imageUrl?: string | null;
  images?: TemplateImage[];
}): { title: string; body: string } {
  const { title, overflow } = truncateTitle(
    options.summary.headline,
    GITHUB_TITLE_MAX,
  );

  const images = normalizeTemplateImages(options);

  let body = options.template?.trim() || "";
  if (!body) {
    body = options.bodyMarkdown;
    if (overflow) body = overflow + "\n\n" + body;
    if (images.length > 0) {
      body = replaceLocalImages(body, images);
      if (!hasMarkdownImage(body)) {
        body = renderImageMarkdown(images) + "\n\n" + body;
      }
      body = stripLocalImageNote(body);
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

  if (images.length > 0) {
    const md = renderImageMarkdown(images);
    if (/before\s*\/\s*after|screenshots?|visuals?/i.test(body)) {
      body = fillSection(
        body,
        /before\s*\/\s*after|screenshots?|visuals?/i,
        md.replace(/^###[^\n]+\n+/, "").trim(),
      );
    } else {
      body += "\n\n" + md + "\n";
    }
    body = stripLocalImageNote(body);
  }

  return { title, body };
}

function normalizeTemplateImages(options: {
  imageUrl?: string | null;
  images?: TemplateImage[];
}): TemplateImage[] {
  if (options.images && options.images.length > 0) return options.images;
  if (options.imageUrl) return [{ url: options.imageUrl }];
  return [];
}

function hasMarkdownImage(body: string): boolean {
  return /!\[[^\]]*\]\([^)]+\)/.test(body);
}

function replaceLocalImages(body: string, images: TemplateImage[]): string {
  let i = 0;
  return body.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/)[^)]+\)/g,
    (_m, alt: string) => {
      const img = images[Math.min(i, images.length - 1)]!;
      i += 1;
      return `![${alt || img.title || "before / after"}](${img.url})`;
    },
  );
}

function renderImageMarkdown(images: TemplateImage[]): string {
  if (images.length === 1) {
    const alt = images[0]!.title ?? "before / after";
    return `### Before / After\n\n![${alt}](${images[0]!.url})`;
  }
  const parts = ["### Visuals"];
  for (const img of images) {
    const alt = img.title ?? "before / after";
    parts.push("", `#### ${alt}`, "", `![${alt}](${img.url})`);
  }
  return parts.join("\n");
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
