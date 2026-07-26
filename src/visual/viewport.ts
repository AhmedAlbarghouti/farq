/** Hard screenshot frame — Chrome captures the window only, so HTML must fit. */
export const VIEWPORT_MAX_WIDTH = 1280;
export const VIEWPORT_MAX_HEIGHT = 720;

export const DEFAULT_VIEWPORT = {
  width: VIEWPORT_MAX_WIDTH,
  height: VIEWPORT_MAX_HEIGHT,
} as const;

export type ViewportSize = {
  width: number;
  height: number;
};

/** Clamp to max frame; invalid/missing values fall back to defaults. */
export function clampViewport(
  input?: { width?: number; height?: number } | null,
): ViewportSize {
  const width = clampDim(input?.width, VIEWPORT_MAX_WIDTH);
  const height = clampDim(input?.height, VIEWPORT_MAX_HEIGHT);
  return { width, height };
}

function clampDim(value: number | undefined, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return max;
  }
  return Math.min(Math.round(value), max);
}
