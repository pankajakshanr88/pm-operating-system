const express = require("express");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const YAML = require("yaml");

const app = express();
const PORT = process.env.PORT || 3210;

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const TRACKER_PATH = path.join(WORKSPACE_ROOT, "action-tracker.yaml");
const RENDERED_TRACKER_PATH = path.join(WORKSPACE_ROOT, "action-tracker.md");
const PUBLIC_DIR = path.join(__dirname, "public");
const STATUS_VALUES = new Set(["not_started", "in_progress", "done"]);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

// --- SSE clients for real-time push ---
const sseClients = new Set();

app.get("/api/events", (request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write("data: connected\n\n");
  sseClients.add(response);
  request.on("close", () => sseClients.delete(response));
});

function broadcastChange() {
  for (const client of sseClients) {
    client.write("data: changed\n\n");
  }
}

// --- File watcher for external changes (e.g. Claude Code edits) ---
let watchDebounce = null;
fsSync.watch(TRACKER_PATH, () => {
  clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => broadcastChange(), 500);
});

// --- Helpers ---

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function todayString() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

function extractHeader(rawText) {
  const lines = rawText.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    break;
  }

  return lines.slice(0, index).join("\n").trimEnd();
}

function orderedRecord(record, preferredKeys) {
  const output = {};

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      output[key] = record[key];
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (!Object.prototype.hasOwnProperty.call(output, key)) {
      output[key] = value;
    }
  }

  return output;
}

function normalizeTask(task) {
  return orderedRecord(task, [
    "id",
    "title",
    "project",
    "due",
    "status",
    "owner",
    "created",
    "completed",
    "source",
    "notes",
  ]);
}

function normalizeWaitingItem(item) {
  return orderedRecord(item, [
    "id",
    "title",
    "waiting_for",
    "since",
    "follow_up",
    "project",
    "notes",
  ]);
}

function normalizeBacklogItem(item) {
  return orderedRecord(item, ["id", "title", "project", "notes"]);
}

function normalizeTracker(tracker) {
  const base = {
    last_updated: tracker.last_updated,
    next_id: tracker.next_id,
    tasks: Array.isArray(tracker.tasks) ? tracker.tasks.map(normalizeTask) : [],
    waiting: Array.isArray(tracker.waiting)
      ? tracker.waiting.map(normalizeWaitingItem)
      : [],
    backlog: Array.isArray(tracker.backlog)
      ? tracker.backlog.map(normalizeBacklogItem)
      : [],
  };

  for (const [key, value] of Object.entries(tracker)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      base[key] = value;
    }
  }

  return orderedRecord(base, [
    "last_updated",
    "next_id",
    "tasks",
    "waiting",
    "backlog",
  ]);
}

function validateTracker(tracker) {
  if (!tracker || typeof tracker !== "object") {
    throw new HttpError(500, "Tracker file did not parse into an object.");
  }

  if (typeof tracker.next_id !== "number") {
    throw new HttpError(500, "Tracker is missing numeric next_id.");
  }

  for (const key of ["tasks", "waiting", "backlog"]) {
    if (!Array.isArray(tracker[key])) {
      throw new HttpError(500, `Tracker is missing array field "${key}".`);
    }
  }

  for (const task of tracker.tasks) {
    if (!STATUS_VALUES.has(task.status)) {
      throw new HttpError(
        500,
        `Task ${task.id} has invalid status "${task.status}".`
      );
    }
  }
}

function sanitizeNullableDate(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function ensureStatusCompletedFields(task) {
  if (task.status === "done") {
    if (!task.completed || String(task.completed).trim() === "") {
      task.completed = todayString();
    }
    return;
  }

  delete task.completed;
}

function parseRenderedTrackerDate(markdownText) {
  const match = markdownText.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isDateOverdue(dateStr) {
  if (!dateStr) return false;
  const today = todayString();
  return String(dateStr) < today;
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const today = new Date(todayString());
  const target = new Date(String(dateStr));
  const diff = (today - target) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

// --- Markdown generation (replaces sync-tracker.sh for web UI writes) ---

function generateMarkdown(tracker) {
  const today = todayString();
  const sevenDaysFromNow = new Date(
    new Date(today).getTime() + 7 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  const overdue = [];
  const dueWeek = [];
  const inProgressNoDue = [];
  const notStartedNoDue = [];
  const completed = [];

  for (const task of tracker.tasks || []) {
    if (task.status === "done") {
      if (task.completed && isWithinDays(task.completed, 7)) {
        completed.push(task);
      }
      continue;
    }

    if (!task.due) {
      if (task.status === "in_progress") {
        inProgressNoDue.push(task);
      } else {
        notStartedNoDue.push(task);
      }
      continue;
    }

    const due = String(task.due);
    if (due < today) {
      overdue.push(task);
    } else if (due <= sevenDaysFromNow) {
      dueWeek.push(task);
    }
  }

  const lines = [];
  lines.push("# Action Tracker");
  lines.push(`Last updated: ${tracker.last_updated}`);
  lines.push("");

  lines.push("## Overdue");
  lines.push("| Item | Project | Due | Owner |");
  lines.push("|------|---------|-----|-------|");
  if (overdue.length === 0) {
    lines.push("| (none) | | | |");
  } else {
    for (const t of overdue) {
      lines.push(`| ${t.title} | ${t.project} | ${t.due} | ${t.owner || "Pankaj"} |`);
    }
  }
  lines.push("");

  lines.push("## Due This Week");
  lines.push("| Item | Project | Due | Status |");
  lines.push("|------|---------|-----|--------|");
  if (dueWeek.length === 0) {
    lines.push("| (none) | | | |");
  } else {
    for (const t of dueWeek) {
      const s = t.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`| ${t.title} | ${t.project} | ${t.due} | ${s} |`);
    }
  }
  lines.push("");

  lines.push("## In Progress (No Due Date)");
  lines.push("| Item | Project |");
  lines.push("|------|---------|");
  if (inProgressNoDue.length === 0) {
    lines.push("| (none) | |");
  } else {
    for (const t of inProgressNoDue) {
      lines.push(`| ${t.title} | ${t.project} |`);
    }
  }
  lines.push("");

  lines.push("## Not Started (No Due Date)");
  lines.push("| Item | Project |");
  lines.push("|------|---------|");
  if (notStartedNoDue.length === 0) {
    lines.push("| (none) | |");
  } else {
    for (const t of notStartedNoDue) {
      lines.push(`| ${t.title} | ${t.project} |`);
    }
  }
  lines.push("");

  lines.push("## Waiting On Others");
  lines.push("| Item | Waiting For | Since | Follow-up |");
  lines.push("|------|-------------|-------|-----------|");
  const waiting = tracker.waiting || [];
  if (waiting.length === 0) {
    lines.push("| (none) | | | |");
  } else {
    for (const w of waiting) {
      let fu = w.follow_up ? String(w.follow_up) : "--";
      if (w.follow_up && isDateOverdue(w.follow_up)) {
        fu += " (OVERDUE)";
      }
      lines.push(`| ${w.title} | ${w.waiting_for} | ${w.since} | ${fu} |`);
    }
  }
  lines.push("");

  lines.push("## Backlog");
  lines.push("| Item | Project | Notes |");
  lines.push("|------|---------|-------|");
  const backlog = tracker.backlog || [];
  if (backlog.length === 0) {
    lines.push("| (none) | | |");
  } else {
    for (const b of backlog) {
      const notes = (b.notes || "").replace(/\n/g, " ").trim().slice(0, 80);
      lines.push(`| ${b.title} | ${b.project} | ${notes} |`);
    }
  }
  lines.push("");

  lines.push("## Completed (Last 7 Days)");
  lines.push("| Item | Project | Completed |");
  lines.push("|------|---------|-----------|");
  if (completed.length === 0) {
    lines.push("| (none) | | |");
  } else {
    for (const t of completed) {
      lines.push(`| ${t.title} | ${t.project} | ${t.completed} |`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function syncRenderedMarkdown(tracker) {
  const markdown = generateMarkdown(tracker);
  await fs.writeFile(RENDERED_TRACKER_PATH, markdown, "utf8");
}

// --- Tracker file I/O ---

async function getRenderedStatus(trackerDate) {
  try {
    const markdownText = await fs.readFile(RENDERED_TRACKER_PATH, "utf8");
    const markdownDate = parseRenderedTrackerDate(markdownText);

    return {
      exists: true,
      markdownDate,
      isStale:
        Boolean(markdownDate) &&
        Boolean(trackerDate) &&
        markdownDate < trackerDate,
    };
  } catch (error) {
    return {
      exists: false,
      markdownDate: null,
      isStale: false,
      error: error.code || "read_error",
    };
  }
}

async function loadTrackerFile() {
  const [rawText, stats] = await Promise.all([
    fs.readFile(TRACKER_PATH, "utf8"),
    fs.stat(TRACKER_PATH),
  ]);

  const tracker = YAML.parse(rawText);
  validateTracker(tracker);

  return {
    rawText,
    header: extractHeader(rawText),
    tracker,
    mtimeMs: stats.mtimeMs,
  };
}

function buildProjects(tracker) {
  const projectNames = new Set();

  for (const section of ["tasks", "waiting", "backlog"]) {
    for (const item of tracker[section]) {
      if (item.project) {
        projectNames.add(item.project);
      }
    }
  }

  return Array.from(projectNames).sort((a, b) => a.localeCompare(b));
}

async function buildClientSnapshot(source) {
  const renderStatus = await getRenderedStatus(source.tracker.last_updated);

  return {
    tracker: normalizeTracker(source.tracker),
    meta: {
      mtimeMs: source.mtimeMs,
      loadedAt: new Date().toISOString(),
      trackerPath: TRACKER_PATH,
      renderedTrackerPath: RENDERED_TRACKER_PATH,
    },
    derived: {
      projects: buildProjects(source.tracker),
      renderStatus,
      counts: {
        tasks: source.tracker.tasks.length,
        waiting: source.tracker.waiting.length,
        backlog: source.tracker.backlog.length,
      },
    },
  };
}

function serializeTracker(header, tracker) {
  const normalized = normalizeTracker(tracker);
  const body = YAML.stringify(normalized, {
    indent: 2,
    lineWidth: 0,
  }).trimEnd();

  if (!header) {
    return `${body}\n`;
  }

  return `${header}\n\n${body}\n`;
}

async function writeTrackerFile(header, tracker) {
  const serialized = serializeTracker(header, tracker);
  const tempPath = `${TRACKER_PATH}.tmp`;

  await fs.writeFile(tempPath, serialized, "utf8");
  await fs.rename(tempPath, TRACKER_PATH);

  // Sync rendered markdown on every write
  await syncRenderedMarkdown(tracker);

  // Notify SSE clients
  broadcastChange();
}

function requireBaseMtime(baseMtimeMs) {
  if (typeof baseMtimeMs !== "number") {
    throw new HttpError(400, "Mutations require baseMtimeMs.");
  }
}

function findItemById(list, id) {
  return list.find((item) => Number(item.id) === Number(id));
}

function findItemIndexById(list, id) {
  return list.findIndex((item) => Number(item.id) === Number(id));
}

function getNextListId(list, fallbackBase) {
  const maxId = list.reduce((highest, item) => {
    const numericId = Number(item.id);
    return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
  }, fallbackBase - 1);

  return maxId + 1;
}

function applyTaskUpdates(task, updates) {
  const allowedFields = [
    "title",
    "project",
    "due",
    "status",
    "owner",
    "created",
    "completed",
    "source",
    "notes",
  ];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      continue;
    }

    if (field === "due" || field === "completed") {
      task[field] = sanitizeNullableDate(updates[field]);
      continue;
    }

    if (field === "status") {
      if (!STATUS_VALUES.has(updates.status)) {
        throw new HttpError(400, `Invalid task status "${updates.status}".`);
      }

      task.status = updates.status;
      continue;
    }

    const value = updates[field];
    task[field] = typeof value === "string" ? value.trim() : value;
  }

  ensureStatusCompletedFields(task);
}

function applyWaitingUpdates(item, updates) {
  const allowedFields = [
    "title",
    "waiting_for",
    "since",
    "follow_up",
    "project",
    "notes",
  ];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      continue;
    }

    if (field === "follow_up") {
      item[field] = sanitizeNullableDate(updates[field]);
      continue;
    }

    const value = updates[field];
    item[field] = typeof value === "string" ? value.trim() : value;
  }
}

function applyBacklogUpdates(item, updates) {
  const allowedFields = ["title", "project", "notes"];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      continue;
    }

    const value = updates[field];
    item[field] = typeof value === "string" ? value.trim() : value;
  }
}

async function mutateTracker(baseMtimeMs, mutator) {
  requireBaseMtime(baseMtimeMs);

  const current = await loadTrackerFile();

  if (current.mtimeMs !== baseMtimeMs) {
    throw new HttpError(
      409,
      "The tracker changed on disk. Reload before saving.",
      await buildClientSnapshot(current)
    );
  }

  const nextTracker = JSON.parse(JSON.stringify(current.tracker));
  mutator(nextTracker);
  nextTracker.last_updated = todayString();
  validateTracker(nextTracker);

  await writeTrackerFile(current.header, nextTracker);

  const updated = await loadTrackerFile();
  return buildClientSnapshot(updated);
}

// --- Routes ---

app.get("/api/tracker", async (request, response, next) => {
  try {
    const source = await loadTrackerFile();
    response.json(await buildClientSnapshot(source));
  } catch (error) {
    next(error);
  }
});

// Tasks CRUD
app.patch("/api/tasks/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const task = findItemById(tracker.tasks, request.params.id);

      if (!task) {
        throw new HttpError(404, "Task not found.");
      }

      applyTaskUpdates(task, request.body.updates || {});
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const task = {
        id: tracker.next_id,
        title: "",
        project: "General",
        due: null,
        status: "not_started",
        owner: "Pankaj",
        created: todayString(),
      };

      applyTaskUpdates(task, request.body.item || {});
      ensureStatusCompletedFields(task);
      tracker.tasks.push(task);
      tracker.next_id += 1;
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = findItemIndexById(tracker.tasks, request.params.id);

      if (index === -1) {
        throw new HttpError(404, "Task not found.");
      }

      tracker.tasks.splice(index, 1);
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Convert task to waiting item
app.post("/api/tasks/:id/to-waiting", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = findItemIndexById(tracker.tasks, request.params.id);

      if (index === -1) {
        throw new HttpError(404, "Task not found.");
      }

      const [task] = tracker.tasks.splice(index, 1);
      const waitingItem = {
        id: getNextListId(tracker.waiting, 100),
        title: task.title,
        waiting_for: request.body.waiting_for || "",
        since: todayString(),
        follow_up: request.body.follow_up || null,
        project: task.project || "General",
      };

      if (task.notes) {
        waitingItem.notes = task.notes;
      }

      tracker.waiting.push(waitingItem);
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Waiting CRUD
app.patch("/api/waiting/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const item = findItemById(tracker.waiting, request.params.id);

      if (!item) {
        throw new HttpError(404, "Waiting item not found.");
      }

      applyWaitingUpdates(item, request.body.updates || {});
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/waiting", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const item = {
        id: getNextListId(tracker.waiting, 100),
        title: "",
        waiting_for: "",
        since: todayString(),
        follow_up: null,
        project: "General",
      };

      applyWaitingUpdates(item, request.body.item || {});
      tracker.waiting.push(item);
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/waiting/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = findItemIndexById(tracker.waiting, request.params.id);

      if (index === -1) {
        throw new HttpError(404, "Waiting item not found.");
      }

      tracker.waiting.splice(index, 1);
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Convert waiting item to task
app.post("/api/waiting/:id/to-task", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = findItemIndexById(tracker.waiting, request.params.id);

      if (index === -1) {
        throw new HttpError(404, "Waiting item not found.");
      }

      const [waitingItem] = tracker.waiting.splice(index, 1);
      const task = {
        id: tracker.next_id,
        title: waitingItem.title,
        project: waitingItem.project || "General",
        due: null,
        status: "not_started",
        owner: "Pankaj",
        created: todayString(),
      };

      if (waitingItem.notes) {
        task.notes = waitingItem.notes;
      }

      if (request.body.item && typeof request.body.item === "object") {
        applyTaskUpdates(task, request.body.item);
      }

      ensureStatusCompletedFields(task);
      tracker.tasks.push(task);
      tracker.next_id += 1;
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Backlog CRUD
app.patch("/api/backlog/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const item = findItemById(tracker.backlog, request.params.id);

      if (!item) {
        throw new HttpError(404, "Backlog item not found.");
      }

      applyBacklogUpdates(item, request.body.updates || {});
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/backlog", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const item = {
        id: getNextListId(tracker.backlog, 200),
        title: "",
        project: "General",
      };

      applyBacklogUpdates(item, request.body.item || {});
      tracker.backlog.push(item);
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/backlog/:id", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = findItemIndexById(tracker.backlog, request.params.id);

      if (index === -1) {
        throw new HttpError(404, "Backlog item not found.");
      }

      tracker.backlog.splice(index, 1);
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/backlog/:id/promote", async (request, response, next) => {
  try {
    const result = await mutateTracker(request.body.baseMtimeMs, (tracker) => {
      const index = tracker.backlog.findIndex(
        (item) => Number(item.id) === Number(request.params.id)
      );

      if (index === -1) {
        throw new HttpError(404, "Backlog item not found.");
      }

      const [backlogItem] = tracker.backlog.splice(index, 1);
      const task = {
        id: tracker.next_id,
        title: backlogItem.title,
        project: backlogItem.project || "General",
        due: null,
        status: "not_started",
        owner: "Pankaj",
        created: todayString(),
      };

      if (backlogItem.notes) {
        task.notes = backlogItem.notes;
      }

      if (request.body.item && typeof request.body.item === "object") {
        applyTaskUpdates(task, request.body.item);
      }

      ensureStatusCompletedFields(task);
      tracker.tasks.push(task);
      tracker.next_id += 1;
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get(/.*/, (request, response) => {
  response.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({
    error: error.message || "Unexpected server error.",
    details: error.details || null,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Task board listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  for (const client of sseClients) {
    client.end();
  }
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  for (const client of sseClients) {
    client.end();
  }
  server.close(() => process.exit(0));
});
