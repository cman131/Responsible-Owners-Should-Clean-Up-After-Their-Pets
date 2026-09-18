# Tech Debt Scanner

Scan code for tech debt, score it, and optionally route high-debt areas to story-author for cleanup stories.

## Usage

`/tech-debt [path] [--threshold N] [--route-stories]`

## Instructions

1. If `--skip-debt` is set, output "Tech debt scan: skipped by user" and exit
2. Load the tech-debt-scorer skill from `.claude/skills/tech-debt-scorer/SKILL.md`
3. Load `.claude/tech-debt-ignore.json` if it exists — apply ignore_files, ignore_folders, and ignore_signals during scoring
4. Determine target files:
   - If `[path]` provided, scan that path (file or directory)
   - If no path, scan files changed in the current branch vs master: `git diff --name-only master...HEAD -- '**/*.{ts,tsx}'` (e.g. `**/*.cs` vs `**/*.ts` — see `profiles/<your-stack>/tech-debt-scorer-addendum.md` for this stack's exact glob and any stack-specific debt signals)
5. Filter to `src/**/**/*.{ts,tsx}`, exclude generated/build output directories (e.g. `obj/`, `bin/`, `dist/`, `node_modules/`) and any paths in the ignore list
6. Run the scoring procedure from the skill (Steps 1-5), checking for inline `// tech-debt-ignore:` comments and suppressing matching signals
7. Present the report to the user (suppressed signals shown as strikethrough, excluded from score)
8. If `--route-stories` is set OR any file scores 16+, ask the user to confirm before invoking `story-author`

**Default threshold**: 16 per file, 31 per area. Override with `--threshold N` (applies to file score).

**Progress updates**: Report status after every 5 files scanned.

## Arguments

$ARGUMENTS:
- `[path]` optional path to scan (file or directory, default: changed files vs master)
- `--threshold N` optional file score threshold for story routing (default: 16)
- `--route-stories` optional flag to auto-prompt for story generation on high-debt files
- `--skip-debt` optional flag to skip the scan entirely
