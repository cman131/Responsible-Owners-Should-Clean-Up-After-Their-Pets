---
name: continuous-learning
description: Automatically extract reusable patterns from Claude Code sessions and save them as learned skills for future use.
version: 1.0.0
---

# Continuous Learning Skill

Observes Claude Code tool usage via hooks and extracts reusable patterns that can be saved as learned skills.

## When to Activate

- Setting up automatic pattern extraction from Claude Code sessions
- Configuring observation hooks for session evaluation
- Reviewing or curating learned skills in `.claude/skills/learned/` or `~/.claude/skills/learned/`
- Adjusting extraction thresholds or pattern categories

## How It Works

This skill uses **PreToolUse** and **PostToolUse** hooks to observe tool usage during sessions:

1. **Observation**: Hooks capture every tool call (input + output) as JSONL entries
2. **Project Detection**: Observations are scoped to the current git project via remote URL hash
3. **Pattern Detection**: After enough observations accumulate, patterns can be extracted
4. **Skill Extraction**: Reusable patterns are saved as learned skill files

### Hook Events Used

| Event | When | Purpose |
|-------|------|---------|
| `PreToolUse` | Before tool executes | Capture tool name + input |
| `PostToolUse` | After tool completes | Capture tool output/result |

### Data Flow

```text
PreToolUse hook → observe.sh "pre" → observations.jsonl (tool_start entry)
PostToolUse hook → observe.sh "post" → observations.jsonl (tool_complete entry)
/learn command → Claude reads observations → extracts patterns → saves skill files
```

## Storage Structure

```
~/.claude/homunculus/
├── projects.json                    # Project hash -> name mapping
├── observations.jsonl               # Global observations (fallback)
└── projects/
    └── <project-hash>/              # 12-char SHA256 of git remote URL
        ├── observations.jsonl       # Project-scoped observations
        ├── observations.archive/    # Rolled-over observation files (>10MB)
        └── learned/                 # Project-scoped learned skills
```

## Observation Format

Each observation is a single JSONL line:

```json
{"timestamp":"2026-03-07T10:30:00Z","event":"tool_start","tool":"Edit","project_id":"a1b2c3d4e5f6","project_name":"dha-rules-svc","input":"..."}
{"timestamp":"2026-03-07T10:30:01Z","event":"tool_complete","tool":"Edit","project_id":"a1b2c3d4e5f6","project_name":"dha-rules-svc","output":"..."}
```

## Hook Input Schema

Hooks receive JSON on stdin from Claude Code:

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", "Read", etc.
  tool_input: {
    command?: string;         // Bash: the command
    file_path?: string;       // Edit/Write/Read: target file
    old_string?: string;      // Edit: text being replaced
    new_string?: string;      // Edit: replacement text
    content?: string;         // Write: file content
  };
  tool_output?: {             // PostToolUse only
    output?: string;          // Command/tool output
  };
}
```

### Exit Codes

- `0` — Success, continue
- `2` — Block tool execution (PreToolUse only)
- Other non-zero — Error (logged, non-blocking)

## Configuration

Edit `config.json` to customize behavior:

```json
{
  "min_observations_for_extract": 20,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "max_observation_file_mb": 10,
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": [
    "simple_typos",
    "one_time_fixes",
    "external_api_issues"
  ]
}
```

## Hook Setup

Add to your project `.claude/settings.json` or user `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/skills/continuous-learning/hooks/observe.sh pre"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/skills/continuous-learning/hooks/observe.sh post"
          }
        ]
      }
    ]
  }
}
```

## Pattern Types

| Pattern | Description |
|---------|-------------|
| `error_resolution` | How specific errors were resolved |
| `user_corrections` | Patterns from user corrections (Claude got it wrong, user fixed it) |
| `workarounds` | Solutions to framework/library quirks |
| `debugging_techniques` | Effective debugging approaches |
| `project_specific` | Project-specific conventions and patterns |

## Related

- `/learn` command — Manual pattern extraction mid-session
