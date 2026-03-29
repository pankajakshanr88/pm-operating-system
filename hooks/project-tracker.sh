#!/bin/bash
# Hook: Infer project area from user prompt and log for time tracking
# Event: UserPromptSubmit
# Customize the keyword patterns to match your projects

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Infer project from keywords in prompt
# UPDATE THESE to match your own projects
PROJECT="general"
if echo "$PROMPT" | grep -iqE "product-a|feature-x|design-review"; then
  PROJECT="product-a"
elif echo "$PROMPT" | grep -iqE "search|discovery|autocomplete"; then
  PROJECT="search"
elif echo "$PROMPT" | grep -iqE "strategy|roadmap|competitive"; then
  PROJECT="strategy"
elif echo "$PROMPT" | grep -iqE "experiment|a/b|conversion"; then
  PROJECT="experiments"
fi

echo "$TIMESTAMP | $PROJECT | $(echo "$PROMPT" | head -c 100)" >> ~/.claude/project-time-log.txt

exit 0
