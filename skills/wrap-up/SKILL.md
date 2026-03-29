---
name: wrap-up
description: |
  End-of-day wrap up. Mark completed tasks, flag slipped items, preview tomorrow.
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# End of Day Wrap Up

## User-invocable
When the user types `/wrap-up`, run this skill.

## Process
1. Load tracker, show today's active items
2. Ask which ones are done, mark completions
3. Flag slipped items (due today/earlier, not done)
4. Fetch tomorrow's calendar, show preview
5. Suggest rescheduling for slipped items
6. Friday: offer to archive old items, show velocity
7. Save all changes to tracker

## Style
- No emojis, direct and concise
