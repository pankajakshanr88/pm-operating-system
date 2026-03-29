#!/bin/bash
# Hook: Log every Notion MCP tool call for daily work tracking
# Event: PreToolUse (mcp__notion__*)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' | head -c 200)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "$TIMESTAMP | $TOOL_NAME | $TOOL_INPUT" >> ~/.claude/notion-access-log.txt

exit 0
