---
name: brain-dump
description: |
  Process a brain dump — capture freeform thoughts, categorize into tasks/follow-ups/ideas/notes,
  auto-tag to projects, extract deadlines, and update the action tracker.
  Use when the user says "brain dump", pastes unstructured thoughts, or wants to capture ideas.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# Brain Dump Processor

## User-invocable
When the user types `/brain-dump`, run this skill.

## Files
- **Tracker YAML**: `$HOME/action-tracker.yaml`  <!-- UPDATE THIS PATH -->
- **Brain dump file**: `$HOME/YYYY-MM-DD-brain-dump.md` (use today's date)
- **CLAUDE.md**: `~/.claude/CLAUDE.md` (for project auto-tagging)

## Process

1. If the user included thoughts after `/brain-dump`, use those. Otherwise ask them to go.
2. Save raw thoughts to today's brain dump file:
   - New file: create with `# Brain Dump — YYYY-MM-DD` header
   - Existing file: append under a `### HH:MM` timestamp header
3. Read CLAUDE.md Active Work section for project matching
4. Categorize each item:
   - **task** — actionable, has a clear next step
   - **follow-up** — waiting on someone else
   - **idea** — needs development before actionable
   - **note** — context only, no action
5. Extract deadlines from natural language:
   - "EOW" / "end of week" -> Friday of current week
   - "tomorrow" -> next calendar day
   - "next week" -> Monday of next week
   - No date -> null (backlog)
6. Ask **one** clarifying question at a time for ambiguous items
7. Read the current tracker YAML
8. Add new items with the next available `id` (increment `next_id`)
9. Show a summary table of what was added

## Project Auto-Tagging
Customize this table with your own projects and keywords.

## Style
- No emojis
- Direct and concise
- Bullet points for summaries
- Ask clarifying questions one at a time
