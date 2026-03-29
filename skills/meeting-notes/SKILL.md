---
name: meeting-notes
description: |
  Process a meeting transcript into structured notes with action items.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# Meeting Notes Processor

## User-invocable
When the user types `/meeting-notes`, run this skill.

## Arguments
- `/meeting-notes` — prompts for transcript paste
- `/meeting-notes pull` — pulls most recent from Granola
- `/meeting-notes pull [name]` — pulls specific meeting

## Process
1. Get transcript (paste or Granola MCP)
2. Extract: decisions, discussion, action items, blockers, open questions
3. Auto-detect project from attendees and keywords
4. Save to project directory as `YYYY-MM-DD-Meeting Notes - [Topic].md`
5. Confirm action items before adding to tracker
6. Update tracker YAML

## Style
- No emojis, scannable bullets
- Preserve quotes and numbers from transcript
