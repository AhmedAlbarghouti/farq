export type TruncatedTitle = {
  title: string;
  overflow: string;
};

export type TitleConvention = {
  kind: "conventional" | "ticket" | "none";
  blurb: string;
};

/** GitHub PR title hard limit is 256 characters. */
export const GITHUB_TITLE_MAX = 256;

export function truncateTitle(
  text: string,
  max = GITHUB_TITLE_MAX,
): TruncatedTitle {
  if (text.length <= max) return { title: text, overflow: "" };

  const ellipsis = "...";
  const budget = max - ellipsis.length;
  let cut = budget;

  const slice = text.slice(0, budget + 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(budget * 0.6)) {
    cut = lastSpace;
  }

  const title = text.slice(0, cut).trimEnd() + ellipsis;
  const overflow = text.slice(cut).trimStart();
  return { title, overflow };
}

export function inferTitleConvention(samples: string[]): TitleConvention {
  if (samples.length === 0) {
    return { kind: "none", blurb: "" };
  }

  const conventional = samples.filter((s) =>
    /^(feat|fix|chore|docs|refactor|perf|test|style|ci|build)(\([^)]+\))?:/i.test(
      s.trim(),
    ),
  );
  const ticket = samples.filter((s) => /^\[[A-Z][A-Z0-9]+-\d+\]/.test(s.trim()));

  if (conventional.length >= Math.ceil(samples.length * 0.6)) {
    return {
      kind: "conventional",
      blurb:
        "Repo PR titles usually follow Conventional Commits (e.g. feat:, fix(scope):). Match that style. Prefer titles around 72 characters when possible.",
    };
  }

  if (ticket.length >= Math.ceil(samples.length * 0.6)) {
    return {
      kind: "ticket",
      blurb:
        "Repo PR titles usually start with a ticket prefix like [PROJ-123]. Match that prefix style when a ticket id is available in the branch or commits; otherwise keep a clear plain title.",
    };
  }

  return { kind: "none", blurb: "" };
}
