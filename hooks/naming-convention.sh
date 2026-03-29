#!/bin/bash
# Hook: Enforce date-prefixed naming for new markdown analysis files
# Event: PreToolUse (Write)
# Prevents undated files from cluttering your project directories

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
FILENAME=$(basename "$FILE_PATH" 2>/dev/null)

# Only check new markdown files (skip existing files, non-md, system files)
if [ -f "$FILE_PATH" ]; then
  exit 0  # Existing file, allow edit
fi

if [[ ! "$FILENAME" =~ \.md$ ]]; then
  exit 0  # Not markdown, skip
fi

# Skip system files
if [[ "$FILENAME" == "CLAUDE.md" || "$FILENAME" == "MEMORY.md" || "$FILENAME" == "README.md" || "$FILENAME" == "action-tracker.md" ]]; then
  exit 0
fi

# Skip files in .claude/ directory
if [[ "$FILE_PATH" == *".claude/"* || "$FILE_PATH" == *".claude\\"* ]]; then
  exit 0
fi

# Check for YYYY-MM-DD prefix
if [[ ! "$FILENAME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
  TODAY=$(date +%Y-%m-%d)
  echo "BLOCKED: New analysis files must be date-prefixed. Rename to: ${TODAY}-${FILENAME}" >&2
  echo "Example: ${TODAY}-voice-product-analysis.md" >&2
  exit 2
fi

exit 0
