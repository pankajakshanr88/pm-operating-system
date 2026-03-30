# Task Board

Local Trello-like web app for managing `action-tracker.yaml` — the YAML-based task tracker used by a Claude Code executive assistant system.

## What It Does

- Reads `../action-tracker.yaml` as the source of truth
- Kanban board for tasks (Not Started / In Progress / Done)
- Dedicated views for Waiting items and Backlog
- Two-way sync: edits write back to YAML immediately
- Auto-regenerates `action-tracker.md` on every mutation
- Real-time updates via SSE when the YAML changes externally (e.g., Claude Code edits)
- Optimistic concurrency — stale writes are rejected and the client reloads

## Features

- **Drag and drop** tasks between status columns
- **Create / Edit / Delete** tasks, waiting items, and backlog items
- **Convert** tasks to waiting items and vice versa
- **Promote** backlog items to active tasks
- **Filter** by project, search query, due date, done visibility
- **Overdue flagging** on both tasks and waiting follow-up dates
- **Done column** auto-filters to last 7 days (with hide toggle)
- **Keyboard shortcuts**: `Ctrl+N` to add, `Escape` to close modals

## Run It

```bash
npm install
npm start
```

Open [http://localhost:3210](http://localhost:3210).

## Architecture

```
task-board/
  server.js        Express server — YAML I/O, REST API, SSE, MD generation
  public/
    index.html     Shell (React via importmap, no build step)
    app.js         React SPA using htm tagged templates
    styles.css     Dark theme, glassmorphism, responsive
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tracker` | Full tracker snapshot |
| GET | `/api/events` | SSE stream for real-time changes |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/to-waiting` | Convert task to waiting item |
| POST | `/api/waiting` | Create waiting item |
| PATCH | `/api/waiting/:id` | Update waiting item |
| DELETE | `/api/waiting/:id` | Delete waiting item |
| POST | `/api/waiting/:id/to-task` | Convert waiting to task |
| POST | `/api/backlog` | Create backlog item |
| PATCH | `/api/backlog/:id` | Update backlog item |
| DELETE | `/api/backlog/:id` | Delete backlog item |
| POST | `/api/backlog/:id/promote` | Promote backlog to task |

### Integration with Claude Code

This board and Claude Code both read/write the same YAML file. Conflicts are handled by:
1. Every mutation includes `baseMtimeMs` — if the file changed since the client last loaded, the server returns 409 with the latest state
2. The server watches the YAML file and pushes SSE events when it detects external changes
3. The server regenerates `action-tracker.md` after every write, so the Claude Code `sync-tracker.sh` hook and this server produce identical output

## Notes

- The app writes to `../action-tracker.yaml` and regenerates `../action-tracker.md`
- Task moves to `done` auto-fill `completed` with today's date
- Requires Node.js 18+ and npm
