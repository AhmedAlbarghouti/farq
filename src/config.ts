import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderName = "claude" | "opencode" | "fake";
export type ToneName = "technical" | "client";

export type FarqConfig = {
  provider?: ProviderName;
  tone?: ToneName;
  models?: {
    claudeCheap?: string;
    opencodeCheap?: string;
  };
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

  if (provider !== undefined) out.provider = provider;
  if (tone !== undefined) out.tone = tone;
  if (Object.keys(models).length > 0) out.models = models;
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
  return out;
}
