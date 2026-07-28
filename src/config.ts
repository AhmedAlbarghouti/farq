import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { THEME_NAMES, type ThemeName } from "./visual/design.js";

export type ProviderName = "claude" | "opencode" | "fake";
export type ToneName = "technical" | "client";

const PROVIDERS = ["claude", "opencode", "fake"] as const;
const TONES = ["technical", "client"] as const;

/** Optional string: trim, require non-empty, else drop the field. */
const optionalTrimmedString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined);

/** Optional positive int (floored); invalid values are dropped. */
const optionalPositiveInt = z
  .number()
  .finite()
  .gte(1)
  .transform((n) => Math.floor(n))
  .optional()
  .catch(undefined);

export const VisualConfigSchema = z
  .object({
    theme: z.enum(THEME_NAMES).optional().catch(undefined),
    accent: optionalTrimmedString,
    fontImport: optionalTrimmedString,
    fontSans: optionalTrimmedString,
    fontDisplay: optionalTrimmedString,
    maxTopics: optionalPositiveInt,
    concurrency: optionalPositiveInt,
  })
  .strip();

export const FarqConfigSchema = z
  .object({
    provider: z.enum(PROVIDERS).optional().catch(undefined),
    tone: z.enum(TONES).optional().catch(undefined),
    models: z
      .object({
        claudeCheap: optionalTrimmedString,
        opencodeCheap: optionalTrimmedString,
      })
      .strip()
      .optional()
      .catch(undefined),
    visual: VisualConfigSchema.optional().catch(undefined),
  })
  .strip();

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
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Parse unknown JSON into a FarqConfig, dropping invalid fields. */
export function sanitize(data: unknown): FarqConfig {
  const parsed = FarqConfigSchema.safeParse(data ?? {});
  if (!parsed.success) return {};

  const out: FarqConfig = {};
  if (parsed.data.provider !== undefined) out.provider = parsed.data.provider;
  if (parsed.data.tone !== undefined) out.tone = parsed.data.tone;

  if (parsed.data.models) {
    const models = stripUndefined(parsed.data.models);
    if (Object.keys(models).length > 0) out.models = models;
  }

  if (parsed.data.visual) {
    const visual = stripUndefined(parsed.data.visual) as VisualConfig;
    if (Object.keys(visual).length > 0) out.visual = visual;
  }

  return out;
}
