#!/bin/bash
# Hook: Auto-add YAML frontmatter to new analysis/deliverable markdown files
# Event: PostToolUse (Write)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Only process markdown files
if [[ ! "$FILE_PATH" =~ \.md$ ]]; then
  exit 0
fi

# Skip system files
if [[ "$FILE_PATH" == *".claude/"* || "$FILE_PATH" == *"CLAUDE.md"* || "$FILE_PATH" == *"README.md"* ]]; then
  exit 0
fi

# Check if file already has frontmatter
FIRST_LINE=$(head -1 "$FILE_PATH" 2>/dev/null)
if [[ "$FIRST_LINE" == "---" ]]; then
  exit 0
fi

# Infer project from file path — UPDATE THESE to match your projects
PROJECT="unknown"
if [[ "$FILE_PATH" == *"Product-A"* ]]; then
  PROJECT="product-a"
elif [[ "$FILE_PATH" == *"Search"* ]]; then
  PROJECT="search"
elif [[ "$FILE_PATH" == *"Strategy"* ]]; then
  PROJECT="strategy"
fi

# Prepend frontmatter
CREATED=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
TEMP_FILE=$(mktemp)
{
  echo "---"
  echo "created: $CREATED"
  echo "project: $PROJECT"
  echo "session: $SESSION_ID"
  echo "author: claude-code"
  echo "---"
  echo ""
  cat "$FILE_PATH"
} > "$TEMP_FILE" && mv "$TEMP_FILE" "$FILE_PATH"

exit 0
