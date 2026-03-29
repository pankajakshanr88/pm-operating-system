#!/bin/bash
# Hook: Log session end with summary for daily tracking
# Event: SessionEnd

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Count today's project interactions
TODAY=$(date '+%Y-%m-%d')
if [ -f ~/.claude/project-time-log.txt ]; then
  PROJECT_SUMMARY=$(grep "^$TODAY" ~/.claude/project-time-log.txt | awk -F'|' '{print $2}' | sort | uniq -c | sort -rn | head -5)
else
  PROJECT_SUMMARY="No project data"
fi

{
  echo "=== SESSION END: $TIMESTAMP (ID: $SESSION_ID) ==="
  echo "Projects touched:"
  echo "$PROJECT_SUMMARY"
  echo "---"
} >> ~/.claude/session-history.txt

exit 0
