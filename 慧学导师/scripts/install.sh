#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-antigravity-global}"
DRY_RUN="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_NAME="huixue-mentor"

declare -a DESTS=()
case "$TARGET" in
  antigravity-workspace) DESTS+=("$(pwd)/.agents/skills/$SKILL_NAME") ;;
  antigravity-global)    DESTS+=("$HOME/.gemini/config/skills/$SKILL_NAME") ;;
  claude)                DESTS+=("$HOME/.claude/skills/$SKILL_NAME") ;;
  cursor)                DESTS+=("$HOME/.cursor/skills/$SKILL_NAME") ;;
  codex)                 DESTS+=("$HOME/.codex/skills/$SKILL_NAME") ;;
  all)
    DESTS+=("$HOME/.gemini/config/skills/$SKILL_NAME")
    DESTS+=("$HOME/.claude/skills/$SKILL_NAME")
    DESTS+=("$HOME/.cursor/skills/$SKILL_NAME")
    DESTS+=("$HOME/.codex/skills/$SKILL_NAME")
    ;;
  *)
    echo "Usage: $0 <antigravity-workspace|antigravity-global|claude|cursor|codex|all> [--dry-run]"
    exit 1
    ;;
esac

for dest in "${DESTS[@]}"; do
  echo "Target: $dest"
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "  [DryRun] Would mirror $SKILL_ROOT -> $dest"
    continue
  fi
  mkdir -p "$dest"
  for item in SKILL.md README.md README_EN.md LICENSE CONTRIBUTING.md references scripts examples; do
    if [[ -e "$SKILL_ROOT/$item" ]]; then
      rm -rf "$dest/$item"
      cp -R "$SKILL_ROOT/$item" "$dest/$item"
    fi
  done
  echo "  Installed successfully -> $dest"
done
