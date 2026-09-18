#!/bin/bash
# Continuous Learning - Observation Hook
# Captures tool usage (PreToolUse/PostToolUse) as JSONL observations.
#
# Usage:
#   bash observe.sh pre   # Called by PreToolUse hook
#   bash observe.sh post  # Called by PostToolUse hook
#
# Hook config (in .claude/settings.json):
# {
#   "hooks": {
#     "PreToolUse": [{
#       "matcher": "",
#       "hooks": [{ "type": "command", "command": "bash .claude/skills/continuous-learning/hooks/observe.sh pre" }]
#     }],
#     "PostToolUse": [{
#       "matcher": "",
#       "hooks": [{ "type": "command", "command": "bash .claude/skills/continuous-learning/hooks/observe.sh post" }]
#     }]
#   }
# }

# Note: no set -e — hook must never abort (e.g. if python3 is missing)

HOOK_PHASE="${1:-post}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read JSON from stdin (Claude Code hook input)
INPUT_JSON=$(cat)

# Pass through the input unchanged (required for hooks)
printf '%s\n' "$INPUT_JSON"

# Source project detection
source "$SKILL_ROOT/scripts/detect-project.sh"

# Determine observations file
OBSERVATIONS_FILE="${PROJECT_DIR}/observations.jsonl"

# Read max_observation_file_mb from config.json (default: 10)
CONFIG_FILE="$SKILL_ROOT/config.json"
max_observation_file_mb=10
if [ -f "$CONFIG_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    val=$(jq -r '.max_observation_file_mb // empty' "$CONFIG_FILE" 2>/dev/null)
  else
    val=$(grep -o '"max_observation_file_mb"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" 2>/dev/null | grep -o '[0-9]*$')
  fi
  if [ -n "$val" ] && [ "$val" -eq "$val" ] 2>/dev/null; then
    max_observation_file_mb=$val
  fi
fi
threshold_bytes=$((max_observation_file_mb * 1048576))

# Read archive_retention_days from config.json (default: 30)
archive_retention_days=30
if [ -f "$CONFIG_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    ret_val=$(jq -r '.archive_retention_days // empty' "$CONFIG_FILE" 2>/dev/null)
  else
    ret_val=$(grep -o '"archive_retention_days"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" 2>/dev/null | grep -o '[0-9]*$')
  fi
  if [ -n "$ret_val" ] && [ "$ret_val" -eq "$ret_val" ] 2>/dev/null; then
    archive_retention_days=$ret_val
  fi
fi

# Auto-archive if file exceeds configured threshold
if [ -f "$OBSERVATIONS_FILE" ]; then
  file_size=$(wc -c < "$OBSERVATIONS_FILE" 2>/dev/null || echo "0")
  if [ "${file_size:-0}" -ge "$threshold_bytes" ]; then
    archive_dir="${PROJECT_DIR}/observations.archive"
    mkdir -p "$archive_dir"
    mv "$OBSERVATIONS_FILE" "$archive_dir/observations-$(date +%Y%m%d-%H%M%S)-$$.jsonl"
  fi
fi

# Purge archived files older than retention period
archive_dir="${PROJECT_DIR}/observations.archive"
if [ -d "$archive_dir" ]; then
  find "$archive_dir" -name "observations-*.jsonl" -mtime +"$archive_retention_days" -delete 2>/dev/null || true
fi

# Parse tool data and write observation via Python (handles JSON safely)
# Guarded: skip gracefully if Python is unavailable (PYTHON_CMD set by detect-project.sh)
if [ -n "$PYTHON_CMD" ]; then
  printf '%s\n' "$INPUT_JSON" | HOOK_PHASE="$HOOK_PHASE" PROJECT_ID="$PROJECT_ID" PROJECT_NAME="$PROJECT_NAME" OBSERVATIONS_FILE="$OBSERVATIONS_FILE" $PYTHON_CMD -c '
import json, sys, os, re
from datetime import datetime, timezone

SENSITIVE_TOOLS = {"Bash", "Write", "Edit", "Read"}
SAFE_PREVIEW_LEN = 200

# Regex to catch common secret patterns (tokens, keys, passwords, etc.)
_SECRET_RE = re.compile(
    r"(?i)(password|secret|token|api[_\-]?key|credentials?|authorization)"
    r"[\"\s:=]+\S+",
)

def sanitize_payload(text, tool_name):
    """For sensitive tools, return a short safe preview; redact potential secrets."""
    if not text:
        return text
    text_str = str(text)
    # Redact secret-like patterns regardless of tool
    redacted = _SECRET_RE.sub(r"\1=[REDACTED]", text_str)
    if tool_name not in SENSITIVE_TOOLS:
        return redacted[:5000]
    total_len = len(redacted)
    preview = redacted[:SAFE_PREVIEW_LEN]
    if total_len > SAFE_PREVIEW_LEN:
        return f"{preview}... [{total_len} chars, truncated]"
    return preview

try:
    data = json.load(sys.stdin)
    hook_phase = os.environ.get("HOOK_PHASE", "post")
    project_id = os.environ.get("PROJECT_ID", "global")
    project_name = os.environ.get("PROJECT_NAME", "global")
    obs_file = os.environ.get("OBSERVATIONS_FILE", "")

    event = "tool_start" if hook_phase == "pre" else "tool_complete"

    tool_name = data.get("tool_name", data.get("tool", "unknown"))
    tool_input = data.get("tool_input", data.get("input", {}))
    tool_output = data.get("tool_output", data.get("output", ""))

    if isinstance(tool_input, dict):
        tool_input_str = json.dumps(tool_input)
    else:
        tool_input_str = str(tool_input)

    observation = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event": event,
        "tool": tool_name,
        "project_id": project_id,
        "project_name": project_name,
    }

    if event == "tool_start":
        observation["input"] = sanitize_payload(tool_input_str, tool_name)
    else:
        output_str = str(tool_output) if tool_output else ""
        if output_str:
            observation["output"] = sanitize_payload(output_str, tool_name)

    if obs_file:
        with open(obs_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(observation) + "\n")

except Exception as e:
    # Hooks must not block on errors — fail silently
    sys.stderr.write(f"[ContinuousLearning] observe error: {e}\n")
' 2>/dev/null || true
fi

exit 0
