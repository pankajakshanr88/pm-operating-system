#!/bin/bash
# Hook: Block edits to completed/archived project directories
# Event: PreToolUse (Edit|Write)
# Add your completed project paths here to prevent accidental edits

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# UPDATE THESE with your own archived/completed project paths
ARCHIVED_PATTERNS=(
  "archived-project-1/"
  "archived-project-2/"
  "completed-q4/"
)

for pattern in "${ARCHIVED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: This file is in an archived project ('$pattern'). Create a new file instead of editing completed work." >&2
    exit 2
  fi
done

exit 0
