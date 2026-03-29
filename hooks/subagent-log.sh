#!/bin/bash
# Hook: Log subagent start/stop events for visibility into agent work
# Event: SubagentStart and SubagentStop

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [[ "$EVENT" == "SubagentStart" ]]; then
  echo "$TIMESTAMP | START | $AGENT_TYPE | session=$SESSION_ID" >> ~/.claude/subagent-log.txt
else
  echo "$TIMESTAMP | STOP  | $AGENT_TYPE | session=$SESSION_ID" >> ~/.claude/subagent-log.txt
fi

exit 0
