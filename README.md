# farq

**farq** (فرق, "difference") turns a git branch's changes into a paste-ready update: an AI-written summary plus an optional before/after visual.

One command. No servers. No API keys. Auth stays with your local `claude` or `opencode` CLI.

```bash
npx @ahmedalbarghouti/farq@0.1.0 pr           # title + markdown body (+ image when feasible)
npx farq slack              # Slack mrkdwn daily update
npx farq json               # structured JSON
npx farq pr --open          # fill PR template + create with gh
```

> **0.1.0** — design-system visuals, lower latency, richer progress. CLI surface (`pr` / `slack` / `json`) is the stable bit.

## Install

```bash
npm i -g @ahmedalbarghouti/farq
farq --help
```

Or run without installing:

```bash
npx @ahmedalbarghouti/farq@0.1.0 --help
```

Generated images land in a **user cache directory outside the repo** by default (no `.gitignore` change needed). Use `--out .farq` if you want them in-tree.

## Requirements

Checked at runtime when needed — nothing native is bundled.

| Tool | When needed |
|------|-------------|
| **Node ≥ 20** | always |
| **git** | always |
| **`claude` or `opencode`** | summarizing / generating visuals (`--provider fake` for dry runs) |
| **Google Chrome / Chromium** | image generation or `--before`/`--after` compose (`CHROME_PATH` override OK) |
| **`gh`** | only for `farq pr --open` |

Missing a required tool → one-line fix hint + non-zero exit. Optional visuals soft-degrade (see below).

## Quick start

```bash
# On a feature branch with commits (or dirty worktree):
farq pr --no-images          # text only
farq pr                      # text + visual attempt
farq slack                   # paste into Slack
farq pr --open               # create the GitHub PR
```

Stdout is the artifact only (pipe-friendly):

```bash
farq pr --no-images | pbcopy          # macOS
farq pr --no-images | clip            # Windows
```

## Commands

### `farq pr` (default)

Line 1 = title. Blank line. Then markdown body (overview, optional before/after, changes, breaking).

```bash
farq pr
farq pr --provider fake --no-images
farq pr --before shot-a.png --after shot-b.png
farq pr --open
```

**`--open`** (feature branches only):

1. Pushes the current branch to `origin` (`git push -u origin HEAD`) if needed  
2. Reads `.github` PR template if present and fills known sections  
3. Infers title style from recent merged PR titles when `gh` works  
4. Best-effort uploads composed image(s) as prerelease assets and embeds the URL(s)  
5. Creates the PR with `gh pr create`, or **updates** title/body with `gh pr edit` if one already exists for the branch, then opens it in the browser  

On the default branch (`main` / `master` / repo default), `--open` skips create and still prints the artifact. Titles are capped at GitHub's **256** character limit (overflow goes into the body).

### `farq slack`

Slack mrkdwn with category emoji. Images off by default.

### `farq json`

Validated change summary plus an `images` array of produced file paths.

## Images (honesty policy)

- Visuals come from the diff only. The summarize call also returns the grouping of items into **up to 5** visual topics by intent (same feature → one image; truly unrelated domains → separate), so no extra model round-trip is spent on it. A dedicated grouping call, then file-overlap, are the fallbacks. UI markup gets a mockup attempt; everything else gets a small concept flowchart. If a topic is infeasible, it is skipped (still exit 0).
- Every visual is **1280×720** and carries a small **generated preview** badge.
- Diagrams stay conceptual — no code dumps.
- Missing Chrome / visual failure **soft-degrades** to text-only with a stderr warning (exit 0), unless you passed `--before`/`--after` (then hard-fail).
- A local image path will not render on GitHub until the file is attached or uploaded. `--open` tries a best-effort upload (and rewrites stdout to the hosted URL).

### Consistent visual style

farq owns the page frame — background, header, Before/After labels, badge, typography and the colour palette. The model only fills in the two panel interiors, and it must draw every colour, font and radius from a fixed set of CSS custom properties (`--fq-accent`, `--fq-text-muted`, `--fq-surface`, …). The only literals it may use are colours the diff states outright. That is what keeps two runs on two branches looking like the same product.

Two palettes ship today, `midnight` (default) and `daylight`:

```bash
farq pr --theme daylight
farq pr --accent "#ff5722"
```

Content is measured and scaled to fit the frame after rendering, so a tall mockup shrinks instead of getting clipped, and the model is not asked to guess at pixel budgets.

## Config

Precedence: **flags → project → global**.

- Project: `.farqrc` or `.farqrc.json`
- Global: `~/.config/farq/config.json`

```json
{
  "provider": "claude",
  "tone": "technical",
  "models": {
    "claudeCheap": "haiku",
    "opencodeCheap": "provider/model"
  },
  "visual": {
    "theme": "midnight",
    "accent": "#4dd0e1",
    "maxTopics": 3,
    "concurrency": 3
  }
}
```

`visual.maxTopics` caps how many images a run may generate (each costs one model call), and `visual.concurrency` is how many are generated at once. `visual.fontImport` can point at a webfont stylesheet; leaving it unset keeps rendering offline and fast.

If both `claude` and `opencode` are installed and nothing is configured, farq uses **claude** and prints how to override (no interactive prompt).

## Flags

| Flag | Meaning |
|------|---------|
| `-r, --range` | git range (default: merge-base…HEAD, else worktree) |
| `-p, --provider` | `claude` \| `opencode` \| `fake` |
| `-t, --tone` | `technical` \| `client` |
| `--before` / `--after` | manual screenshots (skips generation) |
| `--no-images` | skip visuals |
| `-o, --out` | image output dir (default: OS user cache, outside the repo) |
| `--model-cheap` | cheap model id for visuals |
| `--theme` | visual palette: `midnight` \| `daylight` |
| `--accent` | override the theme accent colour |
| `--max-visuals` | cap generated visuals (1–5) |
| `-v, --verbose` | verbose logs (incl. `feasible: false` reasons) |
| `--open` | (`pr` only) create PR with `gh` |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | success (including no feasible image / skipped `--open` on default branch) |
| `1` | user/environment error |
| `2` | AI failure after retry / timeout |

Progress → **stderr**. Artifact → **stdout**.

## Progress output

Each stage is numbered, names what it is doing, and reports how long it took:

```
farq ⠹ [2/3] summary · claude is naming things (hard part)… · 11s
farq ✓ summarized with claude 12.4s
farq ⠸ [3/3] visuals · claude is sketching the after… · 1/3 · Refund status badge · 8s
farq ✓ 3 visuals ready 41.2s
```

Non-interactive terminals (CI, pipes) get one plain line per stage transition instead of a spinner.

## Speed

A `farq pr` run makes as few model calls as it can, and overlaps everything that does not depend on the model:

- Provider detection, the diff and the `gh` title lookup all start at once.
- Topic grouping rides along on the summarize response instead of being its own request.
- File contents for the visuals are read while the summary is still being written.
- Each visual is a **single** HTML document with one shared stylesheet — roughly half the tokens of emitting two standalone pages, and one Chrome screenshot instead of three.
- Visuals for different topics are generated in parallel (`visual.concurrency`).

If a run still feels slow, the lever with the most travel is `--model-cheap` (for example `haiku`), followed by `--max-visuals 1`.

## Repository ops

- **CI** runs on every PR and on pushes to `main` (test + build + `--help` smoke).
- **`main` is protected** — changes go through PRs; the `CI / test` check must pass.
- **Releases** are tag-triggered: create `v0.1.1` (or later) after merge; the publish workflow needs a repo secret named `NPM_TOKEN` (npm automation/granular token with publish rights).
- **`--open` image assets:** uploaded as `farq-assets-<branch>` prereleases; farq deletes orphaned tags whose branch no longer has an open PR.

## Roadmap

- Harder GitHub image upload (`user-attachments` URLs)
- Optional CDP snap of an already-running Chrome tab
- Richer multi-template chooser

## License

MIT © Ahmed Albarghouti
