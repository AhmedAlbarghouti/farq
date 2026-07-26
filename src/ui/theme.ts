import pc from "picocolors";

export function brand(): string {
  return pc.dim("farq");
}

export function accent(text: string): string {
  return pc.cyan(text);
}

export function ok(text: string): string {
  return `${pc.cyan("✓")} ${pc.dim(text)}`;
}

export function fail(text: string): string {
  return `${pc.red("✗")} ${text}`;
}

export function muted(text: string): string {
  return pc.dim(text);
}

export function isInteractive(): boolean {
  return Boolean(process.stderr.isTTY) && process.env.CI !== "true";
}
