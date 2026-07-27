import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isThemeName, type ThemeName } from "./visual/design.js";

export type ProviderName = "claude" | "opencode" | "fake";
export type ToneName = "technical" | "client";

export type VisualConfig = {
  /** Palette used by every generated mockup and diagram. */
  theme?: ThemeName;
  /** Override the single accent color within the chosen theme. */
  accent?: string;
  /** Optional webfont stylesheet; omitted keeps renders offline and fast. */
  fontImport?: string;
  fontSans?: string;
  fontDisplay?: string;
  /** Upper bound on generated visuals (each one costs a model call). */
  maxTopics?: number;
  /** How many visuals to generate at once. */
  concurrency?: number;
};

export type FarqConfig = {
  provider?: ProviderName;
  tone?: ToneName;
  models?: {
    claudeCheap?: string;
    opencodeCheap?: string;
  };
  visual?: VisualConfig;
};

export type LoadConfigOptions = {
  cwd?: string;
  globalDir?: string;
};

export function defaultGlobalDir(): string {
  return join(homedir(), ".config", "farq");
}

export function loadConfig(options: LoadConfigOptions = {}): FarqConfig {
  const cwd = options.cwd ?? process.cwd();
  const globalDir = options.globalDir ?? defaultGlobalDir();

  const globalCfg = readJsonFile(join(globalDir, "config.json"));
  const projectCfg =
    readJsonFile(join(cwd, ".farqrc.json")) ??
    readJsonFile(join(cwd, ".farqrc"));

  return mergeConfig(globalCfg ?? {}, projectCfg ?? {});
}

/** Merge with later sources winning. Undefined flag fields do not wipe base. */
export function mergeConfig(
  base: FarqConfig,
  override: FarqConfig,
): FarqConfig {
  const out: FarqConfig = {};
  const provider = override.provider ?? base.provider;
  const tone = override.tone ?? base.tone;
  const models = {
    ...base.models,
    ...stripUndefined(override.models ?? {}),
  };
  const visual = {
    ...base.visual,
    ...stripUndefined(override.visual ?? {}),
  };

  if (provider !== undefined) out.provider = provider;
  if (tone !== undefined) out.tone = tone;
  if (Object.keys(models).length > 0) out.models = models;
  if (Object.keys(visual).length > 0) out.visual = visual;
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function readJsonFile(path: string): FarqConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as FarqConfig;
    return sanitize(data);
  } catch {
    return null;
  }
}

function sanitize(data: FarqConfig): FarqConfig {
  const out: FarqConfig = {};
  if (
    data.provider === "claude" ||
    data.provider === "opencode" ||
    data.provider === "fake"
  ) {
    out.provider = data.provider;
  }
  if (data.tone === "technical" || data.tone === "client") {
    out.tone = data.tone;
  }
  if (data.models && typeof data.models === "object") {
    const models: NonNullable<FarqConfig["models"]> = {};
    if (typeof data.models.claudeCheap === "string") {
      models.claudeCheap = data.models.claudeCheap;
    }
    if (typeof data.models.opencodeCheap === "string") {
      models.opencodeCheap = data.models.opencodeCheap;
    }
    if (Object.keys(models).length > 0) out.models = models;
  }
  if (data.visual && typeof data.visual === "object") {
    const visual: VisualConfig = {};
    if (isThemeName(data.visual.theme)) visual.theme = data.visual.theme;
    for (const key of ["accent", "fontImport", "fontSans", "fontDisplay"] as const) {
      const value = data.visual[key];
      if (typeof value === "string" && value.trim()) visual[key] = value.trim();
    }
    for (const key of ["maxTopics", "concurrency"] as const) {
      const value = data.visual[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
        visual[key] = Math.floor(value);
      }
    }
    if (Object.keys(visual).length > 0) out.visual = visual;
  }
  return out;
}
