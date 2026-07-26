# farq

**farq** (فرق, "difference") turns a git branch's changes into a paste-ready update: an AI-written summary plus an optional before/after visual.

One command. No servers. No API keys. Auth stays with your local `claude` or `opencode` CLI.

```bash
npx @ahmedalbarghouti/farq@0.0.2 pr           # title + markdown body (+ image when feasible)
npx farq slack              # Slack mrkdwn daily update
npx farq json               # structured JSON
npx farq pr --open          # fill PR template + create with gh
```

> **0.0.2** — PATH/`gh`/Chrome resolution, hosted-image PR body cleanup, orphaned asset prune. CLI surface (`pr` / `slack` / `json`) is the stable bit.

## Install

```bash
npm i -g @ahmedalbarghouti/farq
farq --help
```

Or run without installing:

```bash
npx @ahmedalbarghouti/farq@0.0.2 --help
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

1. Reads `.github` PR template if present and fills known sections  
2. Infers title style from recent merged PR titles when `gh` works  
3. Best-effort uploads composed image(s) as prerelease assets and embeds the URL(s)  
4. Creates the PR with `gh pr create`, or **updates** title/body with `gh pr edit` if one already exists for the branch, then opens it in the browser  

On the default branch (`main` / `master` / repo default), `--open` skips create and still prints the artifact. Titles are capped at GitHub's **256** character limit (overflow goes into the body).

### `farq slack`

Slack mrkdwn with category emoji. Images off by default.

### `farq json`

Validated change summary plus an `images` array of produced file paths.

## Images (honesty policy)

- Visuals come from the diff only. Unrelated change clusters get **up to 5** separate images (related file-overlapping items share one). UI markup gets a mockup attempt; everything else gets a small concept flowchart/diagram. If the model cannot produce a faithful preview for a topic, that topic is skipped (still exit 0).
- Generated compositions include a small **generated preview** badge.
- Diagrams stay conceptual — no code dumps.
- Missing Chrome / visual failure **soft-degrades** to text-only with a stderr warning (exit 0), unless you passed `--before`/`--after` (then hard-fail).
- A local image path will not render on GitHub until the file is attached or uploaded. `--open` tries a best-effort upload (and rewrites stdout to the hosted URL).

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
  }
}
```

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
| `-v, --verbose` | verbose logs (incl. `feasible: false` reasons) |
| `--open` | (`pr` only) create PR with `gh` |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | success (including no feasible image / skipped `--open` on default branch) |
| `1` | user/environment error |
| `2` | AI failure after retry / timeout |

Progress → **stderr**. Artifact → **stdout**.

## Publishing notes (maintainers)

Tag-triggered publish via GitHub Actions (npm provenance):

```bash
git tag v0.0.2
git push origin v0.0.2
```

Requires repo secret `NPM_TOKEN`. Package name: `@ahmedalbarghouti/farq`.

## Repository ops

- **CI** runs on every PR and on pushes to `main` (test + build + `--help` smoke).
- **`main` is protected** — changes go through PRs; the `CI / test` check must pass.
- **Releases** are tag-triggered: create `v0.0.2` (or later) after merge; the publish workflow needs a repo secret named `NPM_TOKEN` (npm automation/granular token with publish rights).
- **`--open` image assets:** uploaded as `farq-assets-<branch>` prereleases; farq deletes orphaned tags whose branch no longer has an open PR.

## Roadmap

- Harder GitHub image upload (`user-attachments` URLs)
- Optional CDP snap of an already-running Chrome tab
- Richer multi-template chooser

## License

MIT © Ahmed Albarghouti
