#!/bin/bash
# Cost Tracker Hook
#
# Estimates per-interaction cost from PostToolUse hook data and appends
# metrics to ~/.claude/metrics/costs.jsonl. Runs alongside the
# continuous-learning observer — both fire on PostToolUse.
#
# Hook config (in .claude/settings.json):
# {
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "",
#       "hooks": [{ "type": "command", "command": "bash .claude/skills/speed-aware-llm-pipeline/hooks/cost-tracker.sh" }]
#     }]
#   }
# }

# Note: no set -e — hook must never abort

# Read JSON from stdin (Claude Code hook input)
INPUT_JSON=$(cat)


# Detect Python — use --version to actually run the interpreter, not just
# check if the command exists. On Windows, `command -v python3` finds the
# Microsoft Store alias which exits with code 49 instead of working.
PYTHON_CMD=""
if python3 --version &>/dev/null; then
  PYTHON_CMD="python3"
elif python --version &>/dev/null; then
  PYTHON_CMD="python"
fi

# Skip gracefully if Python unavailable
if [ -z "$PYTHON_CMD" ]; then
  exit 0
fi

# Extract cost metrics and append to JSONL
printf '%s\n' "$INPUT_JSON" | $PYTHON_CMD -c '
import json, sys, os
from datetime import datetime, timezone
from pathlib import Path

# Pricing table: per-1M-token rates (2025-2026)
PRICING = {
    "haiku":  {"input": 0.80,  "output": 4.00},
    "sonnet": {"input": 3.00,  "output": 15.00},
    "opus":   {"input": 15.00, "output": 75.00},
}

def detect_model_tier(model_str):
    """Map model string to pricing tier."""
    m = model_str.lower()
    for tier in ("haiku", "sonnet", "opus"):
        if tier in m:
            return tier
    return "sonnet"  # conservative default

def estimate_tokens_from_text(text):
    """Rough estimate: ~4 chars per token for English text."""
    if not text:
        return 0
    return max(1, len(str(text)) // 4)

def estimate_cost(tier, input_tokens, output_tokens):
    rates = PRICING.get(tier, PRICING["sonnet"])
    cost = (input_tokens / 1_000_000) * rates["input"] + (output_tokens / 1_000_000) * rates["output"]
    return round(cost, 6)

try:
    data = json.load(sys.stdin)

    # Extract what we can from the hook input
    tool_name = data.get("tool_name", data.get("tool", "unknown"))

    # Get model from environment or hook data
    model = str(
        data.get("model")
        or os.environ.get("CLAUDE_MODEL")
        or "unknown"
    )

    # Try to get actual token usage if available (Stop hook provides this)
    usage = data.get("usage") or data.get("token_usage") or {}
    input_tokens = int(usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or usage.get("completion_tokens", 0) or 0)
    measured = "usage_field" if (input_tokens > 0 or output_tokens > 0) else None

    # Try transcript JSONL for real token counts (most accurate source)
    # Prefer transcript_path from hook data; fall back to session ID search
    if input_tokens == 0 and output_tokens == 0:
        try:
            transcript_path = data.get("transcript_path", "")
            if transcript_path and Path(transcript_path).is_file():
                with open(transcript_path, "r", encoding="utf-8") as tf:
                    last_line = None
                    for line in tf:
                        stripped = line.strip()
                        if stripped:
                            last_line = stripped
                    if last_line:
                        entry = json.loads(last_line)
                        t_usage = entry.get("usage", {})
                        input_tokens = int(t_usage.get("input_tokens", 0))
                        output_tokens = int(t_usage.get("output_tokens", 0))
                        if input_tokens > 0 or output_tokens > 0:
                            measured = "transcript"
        except Exception:
            pass

    # Last-resort: search by session ID (slow rglob)
    if input_tokens == 0 and output_tokens == 0:
        try:
            session_id = os.environ.get("CLAUDE_SESSION_ID", "")
            if session_id:
                projects_dir = Path.home() / ".claude" / "projects"
                for jsonl in projects_dir.rglob(f"{session_id}.jsonl"):
                    with open(jsonl, "r", encoding="utf-8") as tf:
                        last_line = None
                        for line in tf:
                            stripped = line.strip()
                            if stripped:
                                last_line = stripped
                        if last_line:
                            entry = json.loads(last_line)
                            t_usage = entry.get("usage", {})
                            input_tokens = int(t_usage.get("input_tokens", 0))
                            output_tokens = int(t_usage.get("output_tokens", 0))
                            if input_tokens > 0 or output_tokens > 0:
                                measured = "transcript_rglob"
                    break  # use first match
        except Exception:
            pass  # fall through to estimation

    # Fallback: estimate from tool input/response sizes
    if input_tokens == 0 and output_tokens == 0:
        tool_input = data.get("tool_input", data.get("input", {}))
        tool_output = data.get("tool_response", data.get("tool_output", data.get("output", "")))
        input_text = json.dumps(tool_input) if isinstance(tool_input, dict) else str(tool_input)
        output_text = str(tool_output) if tool_output else ""
        input_tokens = estimate_tokens_from_text(input_text)
        output_tokens = estimate_tokens_from_text(output_text)
        measured = "estimate"

    tier = detect_model_tier(model)
    cost_usd = estimate_cost(tier, input_tokens, output_tokens)

    session_id = os.environ.get("CLAUDE_SESSION_ID", "default")

    # Build metrics row
    row = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "session_id": session_id,
        "model": model,
        "model_tier": tier,
        "tool": tool_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost_usd": cost_usd,
        "source": measured or "unknown",
    }

    # Write to ~/.claude/metrics/costs.jsonl
    home = Path.home()
    metrics_dir = home / ".claude" / "metrics"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    costs_file = metrics_dir / "costs.jsonl"

    with open(costs_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

except Exception:
    # Hooks must not block on errors — fail silently
    pass
' 2>/dev/null || true

exit 0
