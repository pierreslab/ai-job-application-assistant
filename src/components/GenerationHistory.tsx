"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getTasks, subscribe, removeTask, clearDone, getGroupedTasks,
  GenerationTask,
} from "@/lib/generationStore";
import { compileLatexToPdf, downloadBlob, downloadTex } from "@/lib/latexCompiler";
import {
  X, Loader2, CheckCircle2, AlertCircle, Download,
  Wand2, Mail, Trash2, ChevronDown, ChevronUp, History,
} from "lucide-react";

function jobSlug(title: string) {
  return title.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 40);
}

function MiniDocRow({ task, prefix }: { task: GenerationTask; prefix: string }) {
  const [compiling, setCompiling] = useState(false);
  const isResume = task.type === "resume";
  const color = isResume ? "#c084fc" : "#fbbf24";
  const Icon = isResume ? Wand2 : Mail;
  const label = isResume ? "Resume" : "Cover Letter";
  const slug = jobSlug(task.job.title);

  const handleDownload = async () => {
    if (!task.latex) return;
    setCompiling(true);
    try {
      const pdf = await compileLatexToPdf(task.latex);
      downloadBlob(pdf, `${prefix}_${slug}.pdf`);
    } catch {
      downloadTex(task.latex, `${prefix}_${slug}.tex`);
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Icon size={10} style={{ color }} className="shrink-0" />
      <span className="text-xs" style={{ color }}>{label}</span>

      {task.status === "running" && <Loader2 size={10} className="animate-spin" style={{ color }} />}
      {task.status === "done" && <CheckCircle2 size={10} style={{ color: "#10b981" }} />}
      {task.status === "error" && <AlertCircle size={10} style={{ color: "#ef4444" }} />}

      {task.status === "done" && task.latex && (
        <button
          onClick={handleDownload}
          disabled={compiling}
          className="ml-auto p-0.5 rounded hover:bg-slate-600 transition-colors disabled:opacity-50"
          style={{ color: "var(--accent-light)" }}
          title="Download PDF"
        >
          {compiling ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
        </button>
      )}
    </div>
  );
}

export function GenerationHistory() {
  useSyncExternalStore(subscribe, getTasks, getTasks);
  const tasks = getTasks();
  const groups = getGroupedTasks();
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const running = tasks.filter((t) => t.status === "running").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const allGroups = Array.from(groups.values());

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-80 rounded-2xl border overflow-hidden shadow-2xl"
      style={{ background: "var(--card)", borderColor: "var(--card-border)", maxHeight: collapsed ? "auto" : "70vh" }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={14} style={{ color: "var(--accent-light)" }} />
          <span className="text-xs font-bold text-slate-200">Generation Queue</span>
          {running > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(99,102,241,0.2)", color: "var(--accent-light)" }}>
              {running} running
            </span>
          )}
          {done > 0 && running === 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
              {done} done
            </span>
          )}
        </div>
        {collapsed ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
      </button>

      {!collapsed && (
        <>
          <div className="px-3 pb-3 space-y-2 overflow-y-auto" style={{ maxHeight: "55vh" }}>
            {allGroups.map(({ job, resume, coverLetter }) => (
              <div
                key={job.id}
                className="rounded-xl border p-3"
                style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{job.title}</p>
                    <p className="text-xs text-slate-600 truncate">
                      {job.department.slice(0, 40)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (resume) removeTask(resume.id);
                      if (coverLetter) removeTask(coverLetter.id);
                    }}
                    className="p-0.5 rounded hover:bg-slate-600 transition-colors shrink-0"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {resume && <MiniDocRow task={resume} prefix="Resume" />}
                  {coverLetter && <MiniDocRow task={coverLetter} prefix="CoverLetter" />}
                </div>
              </div>
            ))}
          </div>

          {done > 0 && (
            <div className="px-3 pb-3">
              <button
                onClick={clearDone}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
              >
                <Trash2 size={11} /> Clear completed
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
