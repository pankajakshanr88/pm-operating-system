---
name: plan-day
description: |
  Morning planning — pulls action tracker, today's calendar, and checks for
  unprocessed meetings. Shows a unified day view and lets you reprioritize.
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# Plan My Day

## User-invocable
When the user types `/plan-day`, run this skill.

## Process
1. Read the tracker YAML
2. Fetch today's calendar events via Google Calendar MCP
3. Check Granola for unprocessed meetings (optional)
4. Flag overdue items
5. Present unified day view: calendar + overdue + due today + in progress + waiting
6. Ask if user wants to reprioritize
7. Update tracker with changes

## Style
- No emojis, clean scannable format
- Show everything at once
