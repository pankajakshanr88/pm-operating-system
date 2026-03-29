# PM Operating System (PMOS) for Claude Code

A complete AI-powered executive assistant system built on [Claude Code](https://claude.ai/code), designed for Product Managers who juggle multiple projects, meetings, deadlines, and stakeholders.

This is a real, production system I use daily as an AI Product Manager. It turns Claude Code into a full PM operating system with task tracking, meeting intelligence, daily briefings, and automated workflows.

## What This Is

A collection of **hooks**, **skills**, **agents**, and **configuration** that transforms Claude Code from an AI coding assistant into a PM's executive assistant:

- **Daily Briefing** -- Session start hook that parses your task tracker and shows overdue items, today's tasks, and blockers
- **Brain Dump Processing** -- Freeform thought capture that auto-categorizes into tasks, follow-ups, ideas, and notes
- **Meeting Intelligence** -- Process transcripts (or pull from Granola) into structured notes with auto-extracted action items
- **Day Planning** -- Unified view combining calendar, tasks, and unprocessed meetings
- **Weekly Review** -- Velocity tracking, carryover flagging, and manager update generation
- **End-of-Day Wrap-up** -- Mark completions, flag slips, preview tomorrow

## Architecture

```
~/.claude/
  settings.json          # Hooks, permissions, MCP integrations
  CLAUDE.md              # Global preferences and work context
  hooks/
    daily-briefing.sh    # Session start: parse YAML tracker, show briefing
    project-tracker.sh   # Auto-detect project from prompt keywords
    onedrive-check.sh    # Block 0-byte cloud placeholder reads
    naming-convention.sh # Enforce date-prefixed filenames
    protect-archived.sh  # Block edits to completed projects
    tag-deliverable.sh   # Auto-add YAML frontmatter to deliverables
    session-end-log.sh   # Log session summary with project breakdown
    subagent-log.sh      # Track subagent spawns for visibility
    notion-access-log.sh # Log Notion API calls
  skills/
    brain-dump/          # /brain-dump -- freeform thought processing
    plan-day/            # /plan-day -- morning planning with calendar
    wrap-up/             # /wrap-up -- end-of-day review
    meeting-notes/       # /meeting-notes -- transcript processing
    weekly-review/       # /weekly-review -- Friday review + manager update
  agents/
    executive-assistant.md  # System overview and routing
    context-curator.md      # Auto-updates CLAUDE.md from conversations
  context/
    business/            # Industry knowledge, how-we-work docs
    products/            # Per-product context files
    templates/           # Reusable templates
    history/             # Full project history

To do/
  action-tracker.yaml    # YAML source of truth for all tasks
  YYYY-MM-DD-brain-dump.md  # Daily brain dump captures
  archive/               # Completed items older than 7 days
```

## Task Tracker (YAML)

The system uses a YAML-based task tracker as its source of truth:

```yaml
last_updated: "2026-03-27"
next_id: 15

tasks:
  - id: 1
    title: "Ship feature X"
    project: "Product Alpha"
    due: "2026-04-01"
    status: in_progress
    owner: You
    created: "2026-03-25"

waiting:
  - id: 101
    title: "Design review from Sarah"
    waiting_for: "Sarah (Design)"
    since: "2026-03-20"
    follow_up: "2026-03-28"
    project: "Product Alpha"

backlog:
  - id: 201
    title: "Explore competitive pricing analysis"
    project: "Strategy"
```

**Statuses:** `not_started` -> `in_progress` -> `done` (or `blocked`)

## Hooks

### SessionStart: Daily Briefing
Parses your YAML tracker with Python on every session start. Shows:
- Overdue items (with age)
- Due today
- Due this week (7-day rolling window)
- Waiting items (flags stale > 7 days)
- Available skills

### UserPromptSubmit: Project Tracker
Infers which project you're working on from keywords in your prompt. Logs to a time-tracking file for session-end summaries.

### PreToolUse: Safety Hooks
- **OneDrive Check** -- Blocks reads on 0-byte cloud placeholders (common with OneDrive/SharePoint)
- **Naming Convention** -- Enforces `YYYY-MM-DD-` prefix on new markdown files
- **Archive Protection** -- Blocks edits to completed/archived project directories
- **Notion Logger** -- Logs every Notion MCP call for daily work tracking

### PostToolUse: Enrichment
- **Tag Deliverable** -- Auto-adds YAML frontmatter (created date, project, session ID) to new markdown files
- **Audit Log** -- Logs every bash command with timestamp and working directory

### SessionEnd: Summary
Aggregates session data: projects touched, Notion calls made, subagents spawned. Writes to session history.

## Skills (Slash Commands)

| Command | Use When | What It Does |
|---------|----------|-------------|
| `/brain-dump` | Anytime | Capture thoughts -> categorize -> update tracker |
| `/plan-day` | Morning | Calendar + tasks + Granola -> unified day view |
| `/wrap-up` | End of day | Mark done, flag slips, preview tomorrow |
| `/meeting-notes` | After meetings | Transcript -> structured notes + action items |
| `/weekly-review` | Friday | Velocity, carryovers, manager update, archive |

### Brain Dump Flow
1. Paste freeform thoughts
2. System categorizes into: tasks, follow-ups, ideas, notes
3. Auto-tags to projects using keyword matching
4. Extracts deadlines from natural language ("EOW" -> Friday, "next Wednesday" -> date)
5. Updates YAML tracker with new items
6. Shows summary table

### Meeting Notes Flow
1. Paste transcript OR pull from Granola MCP
2. Extracts: decisions, discussion topics, action items, blockers, open questions
3. Auto-detects project from attendees and content
4. Saves to project-specific directory
5. Confirms action items before adding to tracker

## Agents

### Executive Assistant
The orchestrator agent that understands the full system. Routes natural language to skills:
- "brain dump: ..." -> `/brain-dump`
- "plan my day" -> `/plan-day`
- "wrap up" -> `/wrap-up`
- "pull from my last meeting" -> `/meeting-notes pull`

### Context Curator
Proactively monitors conversations for context changes and updates CLAUDE.md:
- New projects mentioned -> adds to Active Work
- Preference corrections -> updates Communication Style
- Project completions -> archives
- Team changes -> updates Key People

## MCP Integrations

The system integrates with these MCP servers:

| Integration | Used By | Purpose |
|-------------|---------|---------|
| Google Calendar | `/plan-day`, `/wrap-up` | Calendar events for day view |
| Granola | `/meeting-notes`, `/plan-day` | Meeting transcript retrieval |
| Notion | On-demand | Project/experiment tracking |
| Gmail | On-demand | Email access |

## Setup Guide

### 1. Create the directory structure

```bash
mkdir -p ~/.claude/{hooks,skills/{brain-dump,plan-day,wrap-up,meeting-notes,weekly-review},agents,context/{business,products,templates,history}}
```

### 2. Copy the files

Copy each file from this repo to its corresponding location under `~/.claude/`.

### 3. Create your action tracker

Create a `To do/action-tracker.yaml` file (or wherever you want your tracker) and update the paths in:
- `hooks/daily-briefing.sh` (line 5-6)
- Each skill's `SKILL.md` (Files section)

### 4. Configure settings.json

Copy `settings.json` to `~/.claude/settings.json`. Customize:
- Hook paths
- Permission rules
- MCP server configs (add your own API keys)

### 5. Write your CLAUDE.md

Use the template in `CLAUDE-template.md` to create your own `~/.claude/CLAUDE.md` with:
- Your role, team, and organization
- Active projects
- Key people and business context
- Communication preferences

### 6. Install dependencies

The daily briefing hook needs Python with PyYAML:
```bash
pip install pyyaml
```

## Customization

### Adding a new project
1. Add keyword patterns to `hooks/project-tracker.sh`
2. Add the project to the keyword table in each skill's `SKILL.md`
3. Add the save directory to `skills/meeting-notes/SKILL.md`
4. Add archived patterns to `hooks/protect-archived.sh` when done

### Adding a new skill
1. Create `~/.claude/skills/your-skill/SKILL.md` with the frontmatter format
2. Add it to the agents/executive-assistant.md routing table
3. Register it in settings if needed

### Adding a new hook
Add to `settings.json` under the appropriate event (`SessionStart`, `PreToolUse`, `PostToolUse`, etc.)

## Requirements

- [Claude Code](https://claude.ai/code) (CLI, Desktop, or VS Code extension)
- Python 3.x with PyYAML (`pip install pyyaml`)
- Git Bash or WSL (for bash hooks on Windows)
- Optional: Granola, Google Calendar, Notion MCP servers

## What This Isn't

- Not a standalone app -- it's a Claude Code configuration
- Not a task management replacement -- it's an AI layer on top of simple YAML
- Not automatic -- Claude Code is request-response; you start each session

## License

MIT -- use it, fork it, make it yours.

## About

Built by **Pankaj Ramaswamy**, AI Product Manager. This system evolved from months of daily use managing multiple AI products, experiments, and cross-functional projects. It represents a real-world approach to using AI as a PM multiplier rather than a novelty.
