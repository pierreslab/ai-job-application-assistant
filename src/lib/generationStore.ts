import { Job } from "@/types";

export type GenType = "resume" | "coverLetter" | "email";
export type GenStatus = "pending" | "running" | "done" | "error";

export interface GenerationTask {
  id: string;
  job: Job;
  type: GenType;
  status: GenStatus;
  latex?: string;   // resume / coverLetter
  text?: string;    // email — JSON stringified { subject, body }
  changes?: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

type Listener = () => void;
type TaskDoneListener = (task: GenerationTask) => void;

const STORE_VERSION = "3";

function loadPersisted(): GenerationTask[] {
  if (typeof window === "undefined") return [];
  try {
    if (localStorage.getItem("job-assistant-data-version") !== STORE_VERSION) return [];
    const raw = localStorage.getItem("job-assistant-history");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GenerationTask[];
    return parsed;
  } catch {
    return [];
  }
}

function persistDone(taskList: GenerationTask[]) {
  if (typeof window === "undefined") return;
  try {
    const done = taskList.filter((t) => t.status === "done");
    localStorage.setItem("job-assistant-history", JSON.stringify(done));
  } catch {
    // quota exceeded — skip
  }
}

let tasks: GenerationTask[] = loadPersisted();
const listeners = new Set<Listener>();
const doneListeners = new Set<TaskDoneListener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getTasks(): GenerationTask[] {
  return tasks;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onTaskDone(fn: TaskDoneListener): () => void {
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

export function addTask(job: Job, type: GenType): string {
  const id = `${type}-${job.id}-${Date.now()}`;
  tasks = [{ id, job, type, status: "running", startedAt: Date.now() }, ...tasks];
  emit();
  return id;
}

export function updateTask(id: string, patch: Partial<GenerationTask>) {
  let justDone: GenerationTask | null = null;
  tasks = tasks.map((t) => {
    if (t.id !== id) return t;
    const updated = { ...t, ...patch };
    if (patch.status === "done" && t.status !== "done") justDone = updated;
    return updated;
  });
  if (justDone) {
    persistDone(tasks);
    doneListeners.forEach((fn) => fn(justDone!));
  }
  emit();
}

export function removeTask(id: string) {
  tasks = tasks.filter((t) => t.id !== id);
  persistDone(tasks);
  emit();
}

export function clearDone() {
  tasks = tasks.filter((t) => t.status === "running" || t.status === "pending");
  persistDone(tasks);
  emit();
}

/** Returns the most recent completed task for a given job + type. */
export function getLatestTask(jobId: string, type: GenType): GenerationTask | undefined {
  let best: GenerationTask | undefined;
  for (const t of tasks) {
    if (t.job.id !== jobId || t.type !== type || t.status !== "done") continue;
    if (!best || (t.finishedAt ?? 0) > (best.finishedAt ?? 0)) best = t;
  }
  return best;
}

/**
 * Cheap scalar snapshot for a job+type — designed for useSyncExternalStore.
 * Returns a stable string per state so React.Object.is correctly skips re-renders
 * when unrelated tasks update. Format: `id|status|finishedAt` or empty.
 */
export function getTaskSignal(jobId: string, type: GenType): string {
  const t = getLatestTask(jobId, type);
  return t ? `${t.id}|${t.status}|${t.finishedAt ?? 0}` : "";
}

export type TaskGroup = { job: Job; resume?: GenerationTask; coverLetter?: GenerationTask; email?: GenerationTask };

/** Groups tasks by job, keeping only the most recent per type. */
export function getGroupedTasks(): Map<string, TaskGroup> {
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const g = groups.get(task.job.id) ?? { job: task.job };
    if (task.type === "resume" && (!g.resume || task.startedAt > g.resume.startedAt)) g.resume = task;
    if (task.type === "coverLetter" && (!g.coverLetter || task.startedAt > g.coverLetter.startedAt)) g.coverLetter = task;
    if (task.type === "email" && (!g.email || task.startedAt > g.email.startedAt)) g.email = task;
    groups.set(task.job.id, g);
  }
  return groups;
}
