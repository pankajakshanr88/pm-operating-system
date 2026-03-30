import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

const html = htm.bind(React.createElement);
const TASK_COLUMNS = [
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

// --- API layer ---

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.status = response.status;
    error.details = payload.details || null;
    throw error;
  }

  return payload;
}

const api = {
  getTracker: () => apiRequest("/api/tracker"),
  patchTask: (id, baseMtimeMs, updates) =>
    apiRequest(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ baseMtimeMs, updates }),
    }),
  createTask: (baseMtimeMs, item) =>
    apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, item }),
    }),
  deleteTask: (id, baseMtimeMs) =>
    apiRequest(`/api/tasks/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ baseMtimeMs }),
    }),
  taskToWaiting: (id, baseMtimeMs, waiting_for, follow_up) =>
    apiRequest(`/api/tasks/${id}/to-waiting`, {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, waiting_for, follow_up }),
    }),
  patchWaiting: (id, baseMtimeMs, updates) =>
    apiRequest(`/api/waiting/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ baseMtimeMs, updates }),
    }),
  createWaiting: (baseMtimeMs, item) =>
    apiRequest("/api/waiting", {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, item }),
    }),
  deleteWaiting: (id, baseMtimeMs) =>
    apiRequest(`/api/waiting/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ baseMtimeMs }),
    }),
  waitingToTask: (id, baseMtimeMs, item) =>
    apiRequest(`/api/waiting/${id}/to-task`, {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, item }),
    }),
  patchBacklog: (id, baseMtimeMs, updates) =>
    apiRequest(`/api/backlog/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ baseMtimeMs, updates }),
    }),
  createBacklog: (baseMtimeMs, item) =>
    apiRequest("/api/backlog", {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, item }),
    }),
  deleteBacklog: (id, baseMtimeMs) =>
    apiRequest(`/api/backlog/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ baseMtimeMs }),
    }),
  promoteBacklog: (id, baseMtimeMs, item = {}) =>
    apiRequest(`/api/backlog/${id}/promote`, {
      method: "POST",
      body: JSON.stringify({ baseMtimeMs, item }),
    }),
};

// --- Helpers ---

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function todayString() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function isOverdue(value) {
  if (!value) return false;
  return String(value) < todayString();
}

function isCompletedWithinDays(completedDate, days) {
  if (!completedDate) return false;
  const today = new Date(todayString());
  const completed = new Date(String(completedDate));
  const diff = (today - completed) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.project,
    item.notes,
    item.waiting_for,
    item.owner,
    item.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesProject(item, project) {
  return project === "all" || item.project === project;
}

function matchesDue(task, dueFilter) {
  if (dueFilter === "all") return true;
  if (dueFilter === "overdue") return isOverdue(task.due);
  if (dueFilter === "scheduled") return Boolean(task.due);
  if (dueFilter === "unscheduled") return !task.due;
  return true;
}

// --- Draft builders ---

function buildTaskDraft(item) {
  return {
    id: item?.id ?? null,
    title: item?.title ?? "",
    project: item?.project ?? "General",
    due: item?.due ?? "",
    status: item?.status ?? "not_started",
    owner: item?.owner ?? "Pankaj",
    created: item?.created ?? "",
    completed: item?.completed ?? "",
    source: item?.source ?? "",
    notes: item?.notes ?? "",
  };
}

function buildWaitingDraft(item) {
  return {
    id: item?.id ?? null,
    title: item?.title ?? "",
    waiting_for: item?.waiting_for ?? "",
    since: item?.since ?? "",
    follow_up: item?.follow_up ?? "",
    project: item?.project ?? "General",
    notes: item?.notes ?? "",
  };
}

function buildBacklogDraft(item) {
  return {
    id: item?.id ?? null,
    title: item?.title ?? "",
    project: item?.project ?? "General",
    notes: item?.notes ?? "",
  };
}

// --- Reusable field component ---

function Field({ label, children }) {
  return html`<label className="modal-field"><span>${label}</span>${children}</label>`;
}

function TextField({ label, value, onInput, ...rest }) {
  return html`
    <${Field} label=${label}>
      <input value=${value} onInput=${(e) => onInput(e.target.value)} ...${rest} />
    <//>
  `;
}

function DateField({ label, value, onInput }) {
  return html`
    <${Field} label=${label}>
      <input type="date" value=${value} onInput=${(e) => onInput(e.target.value)} />
    <//>
  `;
}

function TextArea({ label, value, onInput }) {
  return html`
    <${Field} label=${label}>
      <textarea value=${value} onInput=${(e) => onInput(e.target.value)}></textarea>
    <//>
  `;
}

function SelectField({ label, value, onChange, options }) {
  return html`
    <${Field} label=${label}>
      <select value=${value} onChange=${(e) => onChange(e.target.value)}>
        ${options.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
      </select>
    <//>
  `;
}

// --- App ---

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [activeView, setActiveView] = useState("board");
  const [filters, setFilters] = useState({ project: "all", query: "", due: "all" });
  const [modalState, setModalState] = useState(null);
  const [convertState, setConvertState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [hideDone, setHideDone] = useState(false);

  const tracker = snapshot?.tracker;
  const mtimeMs = snapshot?.meta?.mtimeMs;
  const projects = snapshot?.derived?.projects ?? [];

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await api.getTracker();
        if (!cancelled) { setSnapshot(s); setErrorMessage(""); }
      } catch (e) {
        if (!cancelled) setErrorMessage(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = async (event) => {
      if (event.data === "changed") {
        try {
          const s = await api.getTracker();
          setSnapshot(s);
        } catch (e) {
          // ignore transient errors
        }
      }
    };
    return () => eventSource.close();
  }, []);

  // Auto-clear info messages
  useEffect(() => {
    if (!infoMessage) return;
    const id = setTimeout(() => setInfoMessage(""), 3000);
    return () => clearTimeout(id);
  }, [infoMessage]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") {
        setModalState(null);
        setConvertState(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        openNewModal(activeView === "board" ? "task" : activeView);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeView]);

  // Filtered lists
  const filteredTasks = useMemo(() => {
    if (!tracker) return [];
    return tracker.tasks.filter((task) => {
      if (hideDone && task.status === "done") return false;
      if (task.status === "done" && !isCompletedWithinDays(task.completed, 7) && !hideDone) return false;
      return matchesProject(task, filters.project) && matchesQuery(task, filters.query) && matchesDue(task, filters.due);
    });
  }, [tracker, filters, hideDone]);

  const filteredWaiting = useMemo(() => {
    if (!tracker) return [];
    return tracker.waiting.filter(
      (item) => matchesProject(item, filters.project) && matchesQuery(item, filters.query)
    );
  }, [tracker, filters]);

  const filteredBacklog = useMemo(() => {
    if (!tracker) return [];
    return tracker.backlog.filter(
      (item) => matchesProject(item, filters.project) && matchesQuery(item, filters.query)
    );
  }, [tracker, filters]);

  // Mutation handler
  async function handleMutation(action, successMessage) {
    if (!snapshot) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const next = await action();
      setSnapshot(next);
      setModalState(null);
      setConvertState(null);
      setInfoMessage(successMessage);
    } catch (error) {
      if (error.status === 409 && error.details) {
        setSnapshot(error.details);
        setErrorMessage("Tracker changed on disk. Reloaded the latest version.");
      } else {
        setErrorMessage(error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  // Modal openers
  function openTaskModal(task) {
    setModalState({ type: "task", isNew: false, draft: buildTaskDraft(task) });
  }
  function openWaitingModal(item) {
    setModalState({ type: "waiting", isNew: false, draft: buildWaitingDraft(item) });
  }
  function openBacklogModal(item) {
    setModalState({ type: "backlog", isNew: false, draft: buildBacklogDraft(item) });
  }
  function openNewModal(type) {
    const builders = { task: buildTaskDraft, waiting: buildWaitingDraft, backlog: buildBacklogDraft };
    setModalState({ type, isNew: true, draft: builders[type]() });
  }

  function updateDraft(field, value) {
    setModalState((cur) => ({ ...cur, draft: { ...cur.draft, [field]: value } }));
  }

  // Actions
  async function handleTaskDrop(taskId, nextStatus) {
    const task = tracker?.tasks?.find((t) => Number(t.id) === Number(taskId));
    setDragTarget(null);
    if (!task || task.status === nextStatus) return;
    await handleMutation(
      () => api.patchTask(task.id, mtimeMs, { status: nextStatus }),
      "Task status updated."
    );
  }

  async function handleSaveModal() {
    if (!modalState || !snapshot) return;
    const { type, isNew, draft } = modalState;

    if (type === "task") {
      await handleMutation(
        () => isNew ? api.createTask(mtimeMs, draft) : api.patchTask(draft.id, mtimeMs, draft),
        isNew ? "Task created." : "Task updated."
      );
    } else if (type === "waiting") {
      await handleMutation(
        () => isNew ? api.createWaiting(mtimeMs, draft) : api.patchWaiting(draft.id, mtimeMs, draft),
        isNew ? "Waiting item created." : "Waiting item updated."
      );
    } else {
      await handleMutation(
        () => isNew ? api.createBacklog(mtimeMs, draft) : api.patchBacklog(draft.id, mtimeMs, draft),
        isNew ? "Backlog item created." : "Backlog item updated."
      );
    }
  }

  async function handleDelete() {
    if (!modalState || !snapshot) return;
    const { type, draft } = modalState;
    if (!confirm(`Delete "${draft.title}"?`)) return;

    if (type === "task") {
      await handleMutation(() => api.deleteTask(draft.id, mtimeMs), "Task deleted.");
    } else if (type === "waiting") {
      await handleMutation(() => api.deleteWaiting(draft.id, mtimeMs), "Waiting item deleted.");
    } else {
      await handleMutation(() => api.deleteBacklog(draft.id, mtimeMs), "Backlog item deleted.");
    }
  }

  async function handleConvertTaskToWaiting() {
    if (!convertState) return;
    await handleMutation(
      () => api.taskToWaiting(convertState.taskId, mtimeMs, convertState.waiting_for, convertState.follow_up || null),
      "Task moved to waiting."
    );
  }

  async function handleConvertWaitingToTask(item) {
    await handleMutation(
      () => api.waitingToTask(item.id, mtimeMs, {}),
      "Waiting item promoted to task."
    );
  }

  async function handlePromoteBacklog(item) {
    await handleMutation(
      () => api.promoteBacklog(item.id, mtimeMs),
      "Backlog item promoted to task."
    );
  }

  if (loading) {
    return html`<main className="app-shell"><div className="panel empty-state"><p>Loading task board...</p></div></main>`;
  }

  if (!snapshot) {
    return html`<main className="app-shell"><div className="banner banner-error">${errorMessage || "Could not load the tracker."}</div></main>`;
  }

  // --- Render ---
  return html`
    <main className="app-shell">
      <header className="page-header">
        <div className="page-header-top">
          <div className="title-block">
            <h1>Task Board</h1>
            <p>Two-way local board for <code>action-tracker.yaml</code>. Ctrl+N to add, Escape to close.</p>
          </div>
          <div className="toolbar-actions">
            <button className="ghost-button" type="button"
              onClick=${async () => {
                setLoading(true);
                try { setSnapshot(await api.getTracker()); } catch (e) { setErrorMessage(e.message); }
                finally { setLoading(false); }
              }}>Refresh</button>
            <button className="action-button" type="button"
              onClick=${() => openNewModal(activeView === "board" ? "task" : activeView)}>
              Add ${activeView === "board" ? "Task" : activeView === "waiting" ? "Waiting Item" : "Backlog Item"}
            </button>
          </div>
        </div>

        <div className="meta-grid">
          <div className="meta-card"><span className="meta-label">Updated</span><div className="meta-value">${tracker.last_updated}</div></div>
          <div className="meta-card"><span className="meta-label">Active Tasks</span><div className="meta-value">${tracker.tasks.filter((t) => t.status !== "done").length}</div></div>
          <div className="meta-card"><span className="meta-label">Waiting</span><div className="meta-value">${snapshot.derived.counts.waiting}</div></div>
          <div className="meta-card"><span className="meta-label">Backlog</span><div className="meta-value">${snapshot.derived.counts.backlog}</div></div>
        </div>

        ${errorMessage && html`<div className="banner banner-error">${errorMessage}</div>`}
        ${infoMessage && html`<div className="banner">${infoMessage}</div>`}
      </header>

      <section className="toolbar">
        <div className="tabs">
          ${["board", "waiting", "backlog"].map((view) => html`
            <button key=${view} type="button"
              className=${`tab-button ${activeView === view ? "is-active" : ""}`}
              onClick=${() => setActiveView(view)}>
              ${view === "board" ? "Board" : view === "waiting" ? "Waiting" : "Backlog"}
            </button>
          `)}
        </div>

        <div className="filters">
          <label className="filter-control">
            <span>Project</span>
            <select value=${filters.project}
              onChange=${(e) => setFilters((c) => ({ ...c, project: e.target.value }))}>
              <option value="all">All projects</option>
              ${projects.map((p) => html`<option key=${p} value=${p}>${p}</option>`)}
            </select>
          </label>

          <label className="filter-control">
            <span>Search</span>
            <input type="search" value=${filters.query} placeholder="Filter..."
              onInput=${(e) => setFilters((c) => ({ ...c, query: e.target.value }))} />
          </label>

          ${activeView === "board" && html`
            <label className="filter-control">
              <span>Due</span>
              <select value=${filters.due}
                onChange=${(e) => setFilters((c) => ({ ...c, due: e.target.value }))}>
                <option value="all">All tasks</option>
                <option value="overdue">Overdue</option>
                <option value="scheduled">Scheduled</option>
                <option value="unscheduled">Unscheduled</option>
              </select>
            </label>
            <label className="filter-control">
              <span>Done</span>
              <select value=${hideDone ? "hide" : "show"}
                onChange=${(e) => setHideDone(e.target.value === "hide")}>
                <option value="show">Last 7 days</option>
                <option value="hide">Hidden</option>
              </select>
            </label>
          `}
        </div>
      </section>

      ${activeView === "board" && html`
        <section className="board">
          ${TASK_COLUMNS.map((column) => html`
            <div key=${column.key}
              className=${`column ${dragTarget === column.key ? "is-drop-target" : ""}`}
              onDragOver=${(e) => { e.preventDefault(); setDragTarget(column.key); }}
              onDragLeave=${() => setDragTarget(null)}
              onDrop=${(e) => { e.preventDefault(); handleTaskDrop(e.dataTransfer.getData("text/plain"), column.key); }}>
              <div className="column-header">
                <h2>${column.label}</h2>
                <span className="column-count">${filteredTasks.filter((t) => t.status === column.key).length}</span>
              </div>
              <div className="card-stack">
                ${filteredTasks.filter((t) => t.status === column.key).map((task) => html`
                  <article key=${task.id} className="task-card" draggable="true"
                    onDragStart=${(e) => e.dataTransfer.setData("text/plain", String(task.id))}
                    onClick=${() => openTaskModal(task)}>
                    <h3>${task.title}</h3>
                    <div className="tag-row">
                      <span className="pill project">${task.project || "General"}</span>
                      ${task.due && html`<span className=${`pill ${isOverdue(task.due) && task.status !== "done" ? "overdue" : ""}`}>Due ${formatDate(task.due)}</span>`}
                      ${task.status === "done" && task.completed && html`<span className="pill status-done">Done ${formatDate(task.completed)}</span>`}
                    </div>
                    <p className="subtle-text">${task.owner || "Unassigned"}</p>
                  </article>
                `)}
                ${filteredTasks.filter((t) => t.status === column.key).length === 0 &&
                  html`<div className="empty-state"><p>No tasks.</p></div>`}
              </div>
            </div>
          `)}
        </section>
      `}

      ${activeView === "waiting" && html`
        <section className="list-view">
          <div className="list-header">
            <h2>Waiting On Others</h2>
            <p className="meta-line">Track blockers, handoffs, and follow-up dates.</p>
          </div>
          <div className="list-grid">
            ${filteredWaiting.map((item) => html`
              <article key=${item.id} className="list-card" onClick=${() => openWaitingModal(item)}>
                <h3>${item.title}</h3>
                <div className="list-meta">
                  <span className="pill project">${item.project || "General"}</span>
                  <span className="pill">${item.waiting_for || "No owner"}</span>
                  ${item.follow_up && html`<span className=${`pill ${isOverdue(item.follow_up) ? "overdue" : ""}`}>Follow up ${formatDate(item.follow_up)}</span>`}
                </div>
                <p className="subtle-text">Since ${formatDate(item.since)}</p>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick=${(e) => { e.stopPropagation(); handleConvertWaitingToTask(item); }}>
                    Resolve to Task
                  </button>
                </div>
              </article>
            `)}
          </div>
          ${filteredWaiting.length === 0 && html`<div className="panel empty-state"><p>No waiting items.</p></div>`}
        </section>
      `}

      ${activeView === "backlog" && html`
        <section className="list-view">
          <div className="list-header">
            <h2>Backlog</h2>
            <p className="meta-line">Low-priority ideas. Promote when active.</p>
          </div>
          <div className="list-grid">
            ${filteredBacklog.map((item) => html`
              <article key=${item.id} className="list-card" onClick=${() => openBacklogModal(item)}>
                <h3>${item.title}</h3>
                <div className="list-meta"><span className="pill project">${item.project || "General"}</span></div>
                ${item.notes && html`<p className="subtle-text">${item.notes}</p>`}
                <div className="modal-actions">
                  <button type="button" className="action-button" onClick=${(e) => { e.stopPropagation(); handlePromoteBacklog(item); }}>Promote to Task</button>
                </div>
              </article>
            `)}
          </div>
          ${filteredBacklog.length === 0 && html`<div className="panel empty-state"><p>No backlog items.</p></div>`}
        </section>
      `}

      ${modalState && html`
        <div className="modal-backdrop" onClick=${() => !saving && setModalState(null)}>
          <section className="modal-card" onClick=${(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>${modalState.isNew ? "New" : "Edit"} ${modalState.type === "task" ? "Task" : modalState.type === "waiting" ? "Waiting Item" : "Backlog Item"}</h2>
                <p className="modal-subtitle">Changes save to <code>action-tracker.yaml</code>.</p>
              </div>
              <button type="button" className="close-button" onClick=${() => !saving && setModalState(null)}>Close</button>
            </div>

            ${modalState.type === "task" && html`
              <fieldset className="modal-fieldset">
                <${TextField} label="Title" value=${modalState.draft.title} onInput=${(v) => updateDraft("title", v)} />
                <div className="modal-grid">
                  <${TextField} label="Project" value=${modalState.draft.project} onInput=${(v) => updateDraft("project", v)} list="project-options" />
                  <${SelectField} label="Status" value=${modalState.draft.status} onChange=${(v) => updateDraft("status", v)}
                    options=${TASK_COLUMNS.map((c) => ({ value: c.key, label: c.label }))} />
                  <${DateField} label="Due" value=${modalState.draft.due} onInput=${(v) => updateDraft("due", v)} />
                  <${TextField} label="Owner" value=${modalState.draft.owner} onInput=${(v) => updateDraft("owner", v)} />
                </div>
                <${TextField} label="Source" value=${modalState.draft.source} onInput=${(v) => updateDraft("source", v)} />
                <${TextArea} label="Notes" value=${modalState.draft.notes} onInput=${(v) => updateDraft("notes", v)} />
              </fieldset>
            `}

            ${modalState.type === "waiting" && html`
              <fieldset className="modal-fieldset">
                <${TextField} label="Title" value=${modalState.draft.title} onInput=${(v) => updateDraft("title", v)} />
                <div className="modal-grid">
                  <${TextField} label="Waiting For" value=${modalState.draft.waiting_for} onInput=${(v) => updateDraft("waiting_for", v)} />
                  <${TextField} label="Project" value=${modalState.draft.project} onInput=${(v) => updateDraft("project", v)} list="project-options" />
                  <${DateField} label="Since" value=${modalState.draft.since} onInput=${(v) => updateDraft("since", v)} />
                  <${DateField} label="Follow Up" value=${modalState.draft.follow_up} onInput=${(v) => updateDraft("follow_up", v)} />
                </div>
                <${TextArea} label="Notes" value=${modalState.draft.notes} onInput=${(v) => updateDraft("notes", v)} />
              </fieldset>
            `}

            ${modalState.type === "backlog" && html`
              <fieldset className="modal-fieldset">
                <${TextField} label="Title" value=${modalState.draft.title} onInput=${(v) => updateDraft("title", v)} />
                <${TextField} label="Project" value=${modalState.draft.project} onInput=${(v) => updateDraft("project", v)} list="project-options" />
                <${TextArea} label="Notes" value=${modalState.draft.notes} onInput=${(v) => updateDraft("notes", v)} />
              </fieldset>
            `}

            <div className="modal-actions">
              ${!modalState.isNew && html`
                <button type="button" className="danger-button" onClick=${handleDelete} disabled=${saving}>Delete</button>
                ${modalState.type === "task" && html`
                  <button type="button" className="ghost-button" disabled=${saving}
                    onClick=${() => { setModalState(null); setConvertState({ taskId: modalState.draft.id, waiting_for: "", follow_up: "" }); }}>
                    Move to Waiting
                  </button>
                `}
              `}
              <div style=${{ flex: 1 }}></div>
              <button type="button" className="ghost-button" onClick=${() => !saving && setModalState(null)}>Cancel</button>
              <button type="button" className="save-button" onClick=${handleSaveModal} disabled=${saving}>
                ${saving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      `}

      ${convertState && html`
        <div className="modal-backdrop" onClick=${() => !saving && setConvertState(null)}>
          <section className="modal-card" onClick=${(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Move Task to Waiting</h2>
              <button type="button" className="close-button" onClick=${() => !saving && setConvertState(null)}>Close</button>
            </div>
            <fieldset className="modal-fieldset">
              <${TextField} label="Waiting For (person/team)" value=${convertState.waiting_for}
                onInput=${(v) => setConvertState((c) => ({ ...c, waiting_for: v }))} />
              <${DateField} label="Follow Up Date" value=${convertState.follow_up}
                onInput=${(v) => setConvertState((c) => ({ ...c, follow_up: v }))} />
            </fieldset>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick=${() => setConvertState(null)}>Cancel</button>
              <button type="button" className="save-button" onClick=${handleConvertTaskToWaiting} disabled=${saving}>
                ${saving ? "Moving..." : "Move to Waiting"}
              </button>
            </div>
          </section>
        </div>
      `}

      <datalist id="project-options">
        ${projects.map((p) => html`<option key=${p} value=${p}></option>`)}
      </datalist>
    </main>
  `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
