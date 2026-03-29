#!/bin/bash
# Hook: Block reading 0-byte OneDrive/SharePoint cloud placeholders
# Event: PreToolUse (Read)
# Useful if your files are on OneDrive — cloud-only files appear as 0 bytes locally

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  SIZE=$(wc -c < "$FILE_PATH" 2>/dev/null || echo "0")
  SIZE=$(echo "$SIZE" | tr -d '[:space:]')
  if [ "$SIZE" -eq 0 ]; then
    echo "BLOCKED: '$FILE_PATH' is 0 bytes - likely an OneDrive cloud placeholder. Sync the file manually in File Explorer before reading." >&2
    exit 2
  fi
fi
exit 0
