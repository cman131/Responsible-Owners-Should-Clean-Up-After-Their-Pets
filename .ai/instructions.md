# Blackbaud AI Development Standards

You are working in a Blackbaud repository. This folder contains the organisation's standard skills and playbooks for AI coding agents.

## On every session

1. Read the skill and playbook indexes below.
2. Determine which skills are relevant to your current task.
3. Load only the relevant skill file(s) before proceeding.
4. Check `.ai/overrides/` -- if a matching override file exists, read it alongside the skill. The override takes precedence where they conflict.
5. Check the date on line 2 of `.ai/version`. If it is more than 7 days ago or missing, run `npx @blackbaud/bb-ai@latest update`.

Do not load skills that are not relevant to the current task. A backend .NET service does not need the SPA skill. A frontend project does not need the Java skill. Use your judgement.

## Before committing

You are responsible for verifying your own changes against Blackbaud standards before committing. The developer should not have to ask you to do this -- it is part of your workflow.

After making changes and before creating a commit:

1. Run `npx @blackbaud/bb-ai check` in the repo root.
2. Fix any **errors** before committing. Errors are standard violations that must be resolved.
3. **Warnings** are advisory -- fix them where practical, but use your judgement.
4. If a rule is a false positive for this repo, tell the user and ask whether to suppress it. If approved, add the rule ID to `.ai/checkignore` (one per line, `#` prefix for comments).
5. Never suppress rules without the user's explicit approval.
6. **Confirm your entry point survived.** Some tools rewrite or take over agent-config files (`CLAUDE.md`, `AGENTS.md`, and similar) as part of their own setup, which can drop or bury the line that loads these standards. Check that your own configuration still instructs you to read `.ai/instructions.md`. If it was removed or moved into another tool's managed section, re-add it under its own heading (see first-time setup). Without this, the standards silently stop loading next session.

## First-time setup (run once per repo)

Check whether your tool is already configured to read this file on start. For example:
- Claude Code: a `CLAUDE.md` referencing `.ai/instructions.md`
- GitHub Copilot: a `.github/copilot-instructions.md` referencing `.ai/instructions.md`
- Other tools: equivalent configuration pointing to this file

If your tool is already configured, skip this section entirely.

If not, configure your tool so that `.ai/instructions.md` is read at the start of every session. Add it under its own heading, so that tools which manage these files do not absorb or bury it:

- **Claude Code:** Create or update `CLAUDE.md` in the repo root.
- **GitHub Copilot:** Create or update `.github/copilot-instructions.md`.
- **Other tools:** Create or update the equivalent configuration file for your tool.

In each case, add:

```text
## Blackbaud AI standards

Read and follow .ai/instructions.md at the start of every session.
```

One developer runs this setup once and commits the result. The entire team gets it via git.

### Superpowers

Superpowers is a standard extension for AI coding agents at Blackbaud. Install it unless already installed or known to be unsupported.

1. If `.ai/.local/superpowers-unsupported` exists, skip this section entirely.
2. Check whether Superpowers is already installed. If yes, skip.
3. Read the installation instructions at https://github.com/obra/superpowers for your specific tool and follow them.
4. If your tool is not listed or does not support plugins/extensions, create the file `.ai/.local/superpowers-unsupported` containing your tool name and the date, so this is not attempted again.

## Skill index

Skills are conventions and standards -- "what to know" when working in a particular area.

| Skill | File | When to use |
|-------|------|-------------|
| Architecture | `skills/architecture.md` | New services, design decisions, naming, service interactions, data storage choices |
| .NET | `skills/dotnet.md` | Working in a .NET / C# project |
| Java | `skills/java.md` | Working in a Java / Spring project |
| SPA | `skills/spa.md` | Working in a frontend / Angular / SKY UX project |
| Auth | `skills/auth.md` | BBID, SAS, entitlements, permissions, service-to-service trust |
| Service Bus | `skills/service-bus.md` | Async messaging, topics, contracts, worker services |
| Pipelines | `skills/pipelines.md` | CI/CD, Terraform, deployment, environment configuration |
| Security Review | `skills/security-review.md` | Reviewing code for security vulnerabilities, auditing auth logic, assessing a diff or PR for security risk |

## Playbook index

Playbooks are step-by-step guides -- "how to do X end-to-end." Use them when starting a task that matches.

| Playbook | File | When to use |
|----------|------|-------------|
| New .NET microservice | `playbooks/new-dotnet-service.md` | Creating a new .NET service from scratch |
| New Java microservice | `playbooks/new-java-service.md` | Creating a new Java / Spring Boot service from scratch |

## Local agent state

The `.ai/.local/` folder is for your own tool-specific state -- things like install attempts, capabilities, or session notes. It is gitignored and never shared with other engineers.

Use it when you need to remember something across sessions that is specific to your tool or environment, not to the project. The `contributions.json` file in this folder tracks pending skill/playbook contributions -- check it when the user asks about PR status or review feedback.

## Overrides

Do not edit files in `.ai/skills/` or `.ai/playbooks/` -- they will be overwritten on update. If asked to modify a standard, create an override file in `.ai/overrides/` instead.

When a deviation from a standard is needed, create an override file in `.ai/overrides/` with the same filename as the skill being overridden. The override should document:

1. What is being overridden
2. Why (the specific constraint or requirement)
3. Who approved it

Example: `.ai/overrides/architecture.md` might document why a specific service uses synchronous HTTP instead of Service Bus messaging, with the approver's name and date.

## Contributing improvements

When you follow a skill or playbook and it is wrong, incomplete, or you find a better approach:

1. Ask the user: "I found a better way to handle [X]. Want me to update the skill and raise a PR to bb-ai?"
2. If yes, first update to the latest standards -- `npx @blackbaud/bb-ai@latest update` -- so your contribution is based on the current content and avoids unnecessary merge conflicts (do this even if the version is less than 7 days old).
3. Edit the relevant file in the local `.ai/skills/` or `.ai/playbooks/` folder with the improvement.
4. Run `npx @blackbaud/bb-ai contribute <path>` where `<path>` is the file relative to `.ai/` (e.g. `skills/dotnet.md`, `playbooks/new-dotnet-service.md`).

The contribute command handles forking, branching, and opening a pull request automatically. It saves a record of each contribution to `.ai/.local/contributions.json` so you can follow up across sessions.

### Following up on contributions

Check `.ai/.local/contributions.json` for active contributions. Each entry contains the file path, PR URL, branch name, and fork owner.

To check for review comments on a contribution:

```shell
gh pr view <pr-url> --json state,reviewDecision,comments
```

To resolve review feedback:

1. Edit the file locally in `.ai/skills/` or `.ai/playbooks/`.
2. Run the same `contribute` command again -- the CLI detects the existing PR and pushes to the same branch automatically.

Do not contribute without the user's explicit approval. Do not contribute files from `.ai/overrides/` -- those are repo-specific.

## Updating

If asked to update the standards, run:

```shell
npx @blackbaud/bb-ai update
```

This updates all skills, playbooks, and this file to the latest version. The `overrides/` folder is preserved. After updating, review the diff and commit.

## Version

The `.ai/version` file tracks the installed version. Do not edit it manually.
