"use client";

import { useEffect, useState } from "react";
import { onTaskDone, GenerationTask } from "@/lib/generationStore";
import { CheckCircle2, X, Wand2, Mail, FileText, AlertTriangle, History } from "lucide-react";

interface ToastItem {
  id: string;
  task: GenerationTask;
}

// A small global hook other components can wire later if we want custom events.
// Surface completed generation tasks across the app.
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = onTaskDone((task) => {
      const item: ToastItem = { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, task };
      setToasts((prev) => [...prev.slice(-3), item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 6000);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
      {toasts.map((item) => (
        <ToastCard
          key={item.id}
          item={item}
          onDismiss={() => setToasts((prev) => prev.filter((t) => t.id !== item.id))}
        />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { task } = item;
  const isErr = task.status === "error";
  const typeMeta =
    task.type === "resume" ? { color: "#c084fc", Icon: Wand2, label: "Resume tailored" } :
    task.type === "coverLetter" ? { color: "#fbbf24", Icon: FileText, label: "Cover letter ready" } :
    /* email */ { color: "#38bdf8", Icon: Mail, label: "Email drafted" };

  const color = isErr ? "#ef4444" : typeMeta.color;
  const Icon = isErr ? AlertTriangle : typeMeta.Icon;
  const label = isErr ? `${typeMeta.label.split(" ")[0]} failed` : typeMeta.label;
  const StatusIcon = isErr ? AlertTriangle : CheckCircle2;

  const openHistory = () => {
    window.dispatchEvent(new CustomEvent("job-assistant-open-history"));
    onDismiss();
  };

  return (
    <button
      onClick={openHistory}
      className="flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl w-80 text-left transition-all hover:-translate-y-0.5 cursor-pointer group"
      style={{
        background: "var(--card)",
        borderColor: color + "55",
        boxShadow: `0 10px 30px ${color}22, 0 0 0 1px ${color}22`,
        animation: "slideIn 0.25s ease-out",
      }}
      title="Click to open History"
    >
      <StatusIcon size={16} style={{ color: isErr ? "#ef4444" : "#10b981", flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={11} style={{ color }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        </div>
        <p className="text-xs text-slate-100 truncate font-semibold">{task.job.title}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {task.job.department.slice(0, 50)}
        </p>
        <p className="text-[10px] mt-1 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: "var(--muted-foreground-strong)" }}>
          <History size={9} /> Click to view in History
        </p>
      </div>
      <span
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors p-0.5 rounded cursor-pointer"
      >
        <X size={12} />
      </span>
    </button>
  );
}
