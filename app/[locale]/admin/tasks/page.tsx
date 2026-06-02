"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckSquare, Plus, Bot, Loader2, Trash2, Check, Clock,
  ChevronDown, Flag, AlertTriangle, RefreshCw, X, Circle,
  PlayCircle, CheckCircle2, XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Status   = "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface Task {
  id:          string;
  title:       string;
  description: string | null;
  priority:    Priority;
  status:      Status;
  category:    string | null;
  dueDate:     string | null;
  createdByAI: boolean;
  completedAt: string | null;
  createdAt:   string;
  assignedTo:  { id: string; name: string | null; email: string } | null;
}

interface Counts { pending: number; inProgress: number; done: number }

// ── Helpers ────────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; dotColor: string }> = {
  URGENT: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200",       dotColor: "bg-red-500"    },
  HIGH:   { label: "High",   color: "bg-orange-100 text-orange-700 border-orange-200", dotColor: "bg-orange-500" },
  MEDIUM: { label: "Medium", color: "bg-blue-100 text-blue-700 border-blue-200",     dotColor: "bg-blue-500"   },
  LOW:    { label: "Low",    color: "bg-gray-100 text-gray-600 border-gray-200",     dotColor: "bg-gray-400"   },
};

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ElementType; color: string }> = {
  PENDING:     { label: "Pending",     icon: Circle,       color: "text-gray-400"  },
  IN_PROGRESS: { label: "In Progress", icon: PlayCircle,   color: "text-blue-500"  },
  DONE:        { label: "Done",        icon: CheckCircle2, color: "text-emerald-500"},
  CANCELLED:   { label: "Cancelled",   icon: XCircle,      color: "text-gray-300"  },
};

const CATEGORY_COLOR: Record<string, string> = {
  overdue:      "bg-red-50 text-red-700",
  reservations: "bg-amber-50 text-amber-700",
  acquisition:  "bg-violet-50 text-violet-700",
  processing:   "bg-blue-50 text-blue-700",
  members:      "bg-emerald-50 text-emerald-700",
  fines:        "bg-orange-50 text-orange-700",
  other:        "bg-gray-50 text-gray-600",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [counts,      setCounts]      = useState<Counts>({ pending: 0, inProgress: 0, done: 0 });
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"active" | "done" | "all">("active");
  const [saving,      setSaving]      = useState<Set<string>>(new Set());
  const [showCreate,  setShowCreate]  = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);

  // Create form state
  const [newTitle,    setNewTitle]    = useState("");
  const [newDesc,     setNewDesc]     = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("MEDIUM");
  const [newCategory, setNewCategory] = useState("other");
  const [newDueDate,  setNewDueDate]  = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/staff-tasks?status=${tab}`);
    const data = await res.json();
    setTasks(data.tasks   ?? []);
    setCounts(data.counts ?? { pending: 0, inProgress: 0, done: 0 });
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function updateStatus(taskId: string, status: Status) {
    setSaving(s => new Set(s).add(taskId));
    await fetch(`/api/staff-tasks/${taskId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    setSaving(s => { const n = new Set(s); n.delete(taskId); return n; });
    fetchTasks();
    window.dispatchEvent(new Event("alertsChanged"));
  }

  async function deleteTask(taskId: string) {
    setDeleting(taskId);
    await fetch(`/api/staff-tasks/${taskId}`, { method: "DELETE" });
    setDeleting(null);
    fetchTasks();
    window.dispatchEvent(new Event("alertsChanged"));
  }

  async function createTask() {
    if (!newTitle.trim()) { setCreateErr("Title is required"); return; }
    setCreating(true); setCreateErr("");
    const res = await fetch("/api/staff-tasks", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority:    newPriority,
        category:    newCategory,
        dueDate:     newDueDate ? new Date(newDueDate).toISOString() : undefined,
        createdByAI: false,
      }),
    });
    setCreating(false);
    if (!res.ok) { setCreateErr("Failed to create task"); return; }
    setShowCreate(false);
    setNewTitle(""); setNewDesc(""); setNewPriority("MEDIUM"); setNewCategory("other"); setNewDueDate("");
    fetchTasks();
    window.dispatchEvent(new Event("alertsChanged"));
  }

  const active    = counts.pending + counts.inProgress;

  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Task Board</h1>
            <p className="text-xs text-gray-400">
              {active > 0 ? `${active} active task${active !== 1 ? "s" : ""}` : "All tasks completed"} — AI can add tasks automatically
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* ── Stat chips ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {[
          { label: "Pending",     count: counts.pending,    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
          { label: "In Progress", count: counts.inProgress, color: "bg-blue-50   border-blue-200   text-blue-700"   },
          { label: "Done",        count: counts.done,       color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
        ].map(({ label, count, color }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${color}`}>
            <span>{count}</span>
            <span>{label}</span>
          </div>
        ))}
        <button onClick={fetchTasks} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200">
        {([ ["active", "Active", active], ["done", "Completed", counts.done], ["all", "All", counts.pending + counts.inProgress + counts.done] ] as [typeof tab, string, number][]).map(([key, label, cnt]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {cnt > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === key ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"
              }`}>{cnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Task list ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No tasks here</p>
          <p className="text-xs text-gray-400 mt-1">
            {tab === "active" ? "Add a task manually or ask the AI assistant to create one" : "No completed tasks yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const pc     = PRIORITY_CONFIG[task.priority];
            const sc     = STATUS_CONFIG[task.status];
            const catCls = task.category ? (CATEGORY_COLOR[task.category] ?? CATEGORY_COLOR.other) : "";
            const overdue= isOverdue(task.dueDate) && task.status !== "DONE" && task.status !== "CANCELLED";

            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border p-4 transition-all ${
                  task.status === "DONE" || task.status === "CANCELLED"
                    ? "border-gray-100 opacity-60"
                    : overdue
                      ? "border-red-200 shadow-sm"
                      : "border-gray-100 shadow-sm hover:border-purple-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon / toggle button */}
                  <button
                    onClick={() => {
                      if (task.status === "PENDING")     updateStatus(task.id, "IN_PROGRESS");
                      else if (task.status === "IN_PROGRESS") updateStatus(task.id, "DONE");
                      // DONE/CANCELLED are toggled via action menu
                    }}
                    disabled={saving.has(task.id) || task.status === "DONE" || task.status === "CANCELLED"}
                    className="mt-0.5 flex-shrink-0 disabled:opacity-50"
                    title={task.status === "PENDING" ? "Start task" : task.status === "IN_PROGRESS" ? "Mark done" : ""}
                  >
                    {saving.has(task.id)
                      ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      : <sc.icon className={`w-5 h-5 ${sc.color}`} />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${task.status === "DONE" ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {task.title}
                      </p>
                      {/* AI badge */}
                      {task.createdByAI && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-100">
                          <Bot className="w-2.5 h-2.5" /> AI
                        </span>
                      )}
                      {/* Priority badge */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${pc.color}`}>
                        <Flag className="w-2.5 h-2.5" /> {pc.label}
                      </span>
                      {/* Category badge */}
                      {task.category && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${catCls}`}>
                          {task.category}
                        </span>
                      )}
                      {/* Overdue */}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                          <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{task.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(task.createdAt)}
                      </span>
                      {task.dueDate && (
                        <span className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
                          Due {fmtDate(task.dueDate)}
                        </span>
                      )}
                      {task.completedAt && (
                        <span className="text-emerald-500">
                          ✓ Completed {fmtDate(task.completedAt)}
                        </span>
                      )}
                      {task.assignedTo && (
                        <span>→ {task.assignedTo.name ?? task.assignedTo.email}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Quick-status shortcuts */}
                    {task.status === "PENDING" && (
                      <button
                        onClick={() => updateStatus(task.id, "IN_PROGRESS")}
                        disabled={saving.has(task.id)}
                        title="Start"
                        className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-40"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    )}
                    {(task.status === "PENDING" || task.status === "IN_PROGRESS") && (
                      <button
                        onClick={() => updateStatus(task.id, "DONE")}
                        disabled={saving.has(task.id)}
                        title="Mark done"
                        className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {task.status !== "CANCELLED" && task.status !== "DONE" && (
                      <button
                        onClick={() => updateStatus(task.id, "CANCELLED")}
                        disabled={saving.has(task.id)}
                        title="Cancel"
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-40"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {(task.status === "DONE" || task.status === "CANCELLED") && (
                      <button
                        onClick={() => updateStatus(task.id, "PENDING")}
                        disabled={saving.has(task.id)}
                        title="Reopen"
                        className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-50 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteTask(task.id)}
                      disabled={deleting === task.id}
                      title="Delete"
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {deleting === task.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Task Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-600" /> New Task
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Task *</label>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createTask()}
                  placeholder="e.g. Contact overdue member John Doe"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Details (optional)</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="More context about what needs to be done…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <div className="relative">
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value as Priority)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <div className="relative">
                    <select
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                    >
                      <option value="overdue">Overdue</option>
                      <option value="reservations">Reservations</option>
                      <option value="acquisition">Acquisition</option>
                      <option value="processing">Processing</option>
                      <option value="members">Members</option>
                      <option value="fines">Fines</option>
                      <option value="other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due date (optional)</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {createErr && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {createErr}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={createTask}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
