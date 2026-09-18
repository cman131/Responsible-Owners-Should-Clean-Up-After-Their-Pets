#!/bin/bash
# Detect current project and set up storage paths.
# Exports: PROJECT_ID, PROJECT_NAME, PROJECT_ROOT, PROJECT_DIR
#
# Project detection priority:
#   1. CLAUDE_PROJECT_DIR env var
#   2. git remote URL (hashed — portable across machines)
#   3. git repo root path (machine-specific fallback)
#   4. "global" (no project context)

# Detect Python command — verify it actually runs (Windows Store alias for
# python3 passes `command -v` but exits with code 49 instead of working)
PYTHON_CMD=""
if python3 --version &>/dev/null; then
  PYTHON_CMD="python3"
elif python --version &>/dev/null; then
  PYTHON_CMD="python"
fi
export PYTHON_CMD

HOMUNCULUS_DIR="${HOME}/.claude/homunculus"
mkdir -p "$HOMUNCULUS_DIR"

# Determine project root
PROJECT_ROOT=""
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
elif git rev-parse --show-toplevel &>/dev/null; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
fi

# Determine project ID (12-char SHA256 hash)
PROJECT_ID="global"
PROJECT_NAME="global"
HASH_INPUT=""

if [ -n "$PROJECT_ROOT" ]; then
  PROJECT_NAME="$(basename "$PROJECT_ROOT")"

  # Prefer git remote URL (portable across machines)
  remote_url=$(git -C "$PROJECT_ROOT" remote get-url origin 2>/dev/null || echo "")
  if [ -n "$remote_url" ]; then
    HASH_INPUT="$remote_url"
  else
    # Fallback to repo root path (machine-specific)
    HASH_INPUT="$PROJECT_ROOT"
  fi

  PROJECT_ID=$(printf '%s' "$HASH_INPUT" | $PYTHON_CMD -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest()[:12])" 2>/dev/null || echo "global")
fi

# Set up project storage directory
if [ "$PROJECT_ID" = "global" ]; then
  PROJECT_DIR="$HOMUNCULUS_DIR"
else
  PROJECT_DIR="$HOMUNCULUS_DIR/projects/$PROJECT_ID"
fi

mkdir -p "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/observations.archive" 2>/dev/null || true

# Update projects.json mapping
# Uses env vars instead of shell interpolation in Python to avoid injection risks
if [ "$PROJECT_ID" != "global" ] && [ -n "$PYTHON_CMD" ]; then
  export PROJECTS_FILE="$HOMUNCULUS_DIR/projects.json"
  export PROJECT_ID PROJECT_NAME PROJECT_ROOT
  $PYTHON_CMD -c '
import json, os, sys, subprocess, re, tempfile
sys.stdout = open(os.devnull, "w")  # prevent any stdout leakage into hook passthrough
from datetime import datetime, timezone

projects_file = os.environ["PROJECTS_FILE"]
project_id = os.environ["PROJECT_ID"]
project_name = os.environ["PROJECT_NAME"]
project_root = os.environ["PROJECT_ROOT"]

try:
    with open(projects_file, "r") as f:
        projects = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    projects = {}

# Get remote URL via subprocess (avoids shell interpolation)
try:
    result = subprocess.run(
        ["git", "-C", project_root, "remote", "get-url", "origin"],
        capture_output=True, text=True, timeout=5
    )
    raw_remote = result.stdout.strip() if result.returncode == 0 else ""
except Exception:
    raw_remote = ""

# Sanitize remote: strip userinfo (user:pass@) to avoid leaking credentials
sanitized_remote = re.sub(r"://[^@]+@", "://", raw_remote) if raw_remote else ""

# Sanitize root: store only the repo basename, not the full local path
sanitized_root = os.path.basename(project_root)

projects[project_id] = {
    "name": project_name,
    "root": sanitized_root,         # basename only — avoids exposing local paths
    "remote": sanitized_remote,     # userinfo stripped — avoids leaking credentials
    "last_seen": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
}

# Atomic write: temp file + os.replace to avoid truncation/race conditions
dir_name = os.path.dirname(projects_file)
fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
try:
    with os.fdopen(fd, "w") as f:
        json.dump(projects, f, indent=2)
    os.replace(tmp_path, projects_file)
except Exception:
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    raise
' 2>/dev/null || true
fi

export PROJECT_ID
export PROJECT_NAME
export PROJECT_ROOT
export PROJECT_DIR
