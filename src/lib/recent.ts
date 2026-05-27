const KEY = "job-assistant-recent";
const MAX = 12;
type Listener = () => void;

const listeners = new Set<Listener>();

export function getRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  const existing = getRecentIds().filter((x) => x !== id);
  const next = [id, ...existing].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((fn) => fn());
}

export function subscribeRecent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearRecent() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn());
}
