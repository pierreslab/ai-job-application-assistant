"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getTasks, subscribe, removeTask, clearDone, getGroupedTasks,
  GenerationTask,
} from "@/lib/generationStore";
import { Job } from "@/types";
import { compileLatexToPdf, downloadBlob, downloadTex } from "@/lib/latexCompiler";
import { EmailDisplay } from "@/components/EmailModal";
import {
  Loader2, CheckCircle2, AlertCircle, Download, ExternalLink,
  Trash2, ChevronDown, ChevronUp,
  X, History, Package,
} from "lucide-react";

function jobSlug(title: string) {
  return title
    .replace(/[^a-z0-9\s]/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("_");
}

function timeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

type Filter = "all" | "running" | "done" | "error";

function DocRow({
  task,
  label,
  color,
  prefix,
}: {
  task: GenerationTask;
  label: string;
  color: string;
  prefix: string;
}) {
  const [compiling, setCompiling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const slug = jobSlug(task.job.title);
  const filename = `${prefix}_${slug}`;

  const handleDownload = async () => {
    if (!task.latex) return;
    setCompiling(true);
    try {
      const pdf = await compileLatexToPdf(task.latex);
      downloadBlob(pdf, `${filename}.pdf`);
    } catch {
      downloadTex(task.latex, `${filename}.tex`);
    } finally {
      setCompiling(false);
    }
  };

  const openOverleaf = () => {
    if (!task.latex) return;
    const form = document.createElement("form");
    form.method = "POST"; form.action = "https://www.overleaf.com/docs"; form.target = "_blank";
    const inp = document.createElement("input"); inp.type = "hidden"; inp.name = "snip"; inp.value = task.latex;
    form.appendChild(inp); document.body.appendChild(form); form.submit(); document.body.removeChild(form);
  };

  return (
    <div className="rounded-lg border p-3" style={{ background: color + "08", borderColor: color + "25" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {task.status === "running" && <Loader2 size={13} className="animate-spin shrink-0" style={{ color }} />}
          {task.status === "done" && <CheckCircle2 size={13} className="shrink-0" style={{ color: "#10b981" }} />}
          {task.status === "error" && <AlertCircle size={13} className="shrink-0" style={{ color: "#ef4444" }} />}
          <span className="text-xs font-semibold" style={{ color }}>{label}</span>
          {task.finishedAt && (
            <span className="text-xs text-slate-600">{timeAgo(task.finishedAt)}</span>
          )}
          {task.status === "running" && (
            <span className="text-xs text-slate-500">Generating…</span>
          )}
          {task.status === "error" && (
            <span className="text-xs truncate" style={{ color: "#f87171" }}>{task.error}</span>
          )}
        </div>

        {task.status === "done" && task.latex && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleDownload}
              disabled={compiling}
              title="Download PDF"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
              style={{ background: color + "18", color, border: `1px solid ${color}33` }}
            >
              {compiling ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              {compiling ? "..." : "PDF"}
            </button>
            <button
              onClick={openOverleaf}
              title="Open in Overleaf"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <ExternalLink size={11} /> OL
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              title="View LaTeX"
              className="p-1 rounded-lg hover:bg-slate-700 transition-colors"
              style={{ color: "var(--muted-foreground)" }}
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>
        )}
      </div>

      {task.status === "done" && task.changes && task.changes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.changes.map((c, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc" }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {expanded && task.latex && (
        <div
          className="mt-2 rounded-lg p-2 overflow-auto text-xs font-mono leading-relaxed border"
          style={{ background: "#0d0d1a", borderColor: "var(--card-border)", color: "#94a3b8", maxHeight: 200, whiteSpace: "pre-wrap" }}
        >
          {task.latex}
        </div>
      )}
    </div>
  );
}

function EmailRow({ task }: { task: GenerationTask }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "#0ea5e908", borderColor: "#0ea5e925" }}>
      <div className="flex items-center gap-2">
        {task.status === "running" && <Loader2 size={13} className="animate-spin shrink-0" style={{ color: "#0ea5e9" }} />}
        {task.status === "done" && <CheckCircle2 size={13} className="shrink-0" style={{ color: "#10b981" }} />}
        {task.status === "error" && <AlertCircle size={13} className="shrink-0" style={{ color: "#ef4444" }} />}
        <span className="text-xs font-semibold" style={{ color: "#0ea5e9" }}>Application Email</span>
        {task.finishedAt && <span className="text-xs text-slate-600">{timeAgo(task.finishedAt)}</span>}
        {task.status === "running" && <span className="text-xs text-slate-500">Generating…</span>}
        {task.status === "error" && <span className="text-xs truncate" style={{ color: "#f87171" }}>{task.error}</span>}
      </div>
      {task.status === "done" && task.text && <EmailDisplay text={task.text} />}
    </div>
  );
}

async function compileSafe(latex: string): Promise<Blob | null> {
  try { return await compileLatexToPdf(latex); } catch { return null; }
}

export function HistoryView({ onJobClick }: { onJobClick?: (job: Job) => void }) {
  useSyncExternalStore(subscribe, getTasks, getTasks);
  const groups = getGroupedTasks();
  const tasks = getTasks();

  const [filter, setFilter] = useState<Filter>("all");
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);

  const running = tasks.filter((t) => t.status === "running").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const errors = tasks.filter((t) => t.status === "error").length;

  const allGroups = Array.from(groups.values());
  const donePairsDownloadable = allGroups.filter((g) => g.resume?.latex || g.coverLetter?.latex).length;
  const filteredGroups = allGroups.filter((g) => {
    if (filter === "running") return g.resume?.status === "running" || g.coverLetter?.status === "running" || g.email?.status === "running";
    if (filter === "done") return g.resume?.status === "done" || g.coverLetter?.status === "done" || g.email?.status === "done";
    if (filter === "error") return g.resume?.status === "error" || g.coverLetter?.status === "error" || g.email?.status === "error";
    return true;
  });

  const downloadAllDone = async () => {
    setDownloading(true);
    setDlProgress(0);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const items: { latex: string; name: string }[] = [];
      for (const g of allGroups) {
        if (g.resume?.latex) items.push({ latex: g.resume.latex, name: `Resume_${jobSlug(g.job.title)}` });
        if (g.coverLetter?.latex) items.push({ latex: g.coverLetter.latex, name: `CoverLetter_${jobSlug(g.job.title)}` });
      }
      for (let i = 0; i < items.length; i += 3) {
        const batch = items.slice(i, i + 3);
        const results = await Promise.all(batch.map(async (item) => ({ ...item, pdf: await compileSafe(item.latex) })));
        for (const r of results) zip.file(r.pdf ? `${r.name}.pdf` : `${r.name}.tex`, r.pdf ?? r.latex);
        setDlProgress(Math.min(i + 3, items.length));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, "Applications.zip");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History size={20} style={{ color: "var(--accent-light)" }} />
            <h2 className="text-2xl font-black gradient-text">Generation History</h2>
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {allGroups.length > 0
              ? `${allGroups.length} job${allGroups.length !== 1 ? "s" : ""} · ${tasks.length} document${tasks.length !== 1 ? "s" : ""}`
              : "Your generated resumes, cover letters, and emails will appear here"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {donePairsDownloadable >= 2 && (
            <button
              onClick={downloadAllDone}
              disabled={downloading}
              className="btn-primary flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold"
            >
              {downloading ? (
                <><Loader2 size={13} className="animate-spin" /> {dlProgress > 0 ? `${dlProgress}/${donePairsDownloadable * 2}` : "Compiling…"}</>
              ) : (
                <><Package size={13} /> Download ZIP</>
              )}
            </button>
          )}
          {done > 0 && (
            <button
              onClick={clearDone}
              className="btn-ghost flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium"
            >
              <Trash2 size={12} /> Clear done
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Running", count: running, color: "var(--accent-light)", icon: <Loader2 size={14} className={running > 0 ? "animate-spin" : ""} /> },
            { label: "Complete", count: done, color: "#10b981", icon: <CheckCircle2 size={14} /> },
            { label: "Errors", count: errors, color: "#ef4444", icon: <AlertCircle size={14} /> },
          ].map(({ label, count, color, icon }) => (
            <div key={label} className="rounded-xl border p-4 flex items-center justify-between" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
              <div>
                <p className="text-3xl font-black leading-none" style={{ color: count > 0 ? color : "var(--muted-foreground)" }}>{count}</p>
                <p className="text-xs font-medium mt-1 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, color }}>
                {icon}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {([
          ["all", "All", allGroups.length],
          ["running", "In Progress", allGroups.filter((g) => g.resume?.status === "running" || g.coverLetter?.status === "running").length],
          ["done", "Complete", allGroups.filter((g) => g.resume?.status === "done" || g.coverLetter?.status === "done").length],
          ["error", "Failed", allGroups.filter((g) => g.resume?.status === "error" || g.coverLetter?.status === "error").length],
        ] as [Filter, string, number][]).map(([f, label, count]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: filter === f ? "var(--accent)" : "var(--muted)",
              color: filter === f ? "white" : "var(--muted-foreground)",
              border: `1px solid ${filter === f ? "var(--accent)" : "var(--card-border)"}`,
            }}
          >
            {label}
            <span
              className="px-1 rounded-full text-xs"
              style={{ background: filter === f ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)" }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredGroups.length === 0 && (
        <div className="text-center py-16">
          <History size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-slate-500 text-sm">
            {tasks.length === 0
              ? "No generations yet. Tailor a resume or generate a cover letter to get started."
              : "No items match this filter."}
          </p>
        </div>
      )}

      {/* Job groups */}
      <div className="space-y-3">
        {filteredGroups.map(({ job, resume, coverLetter, email }) => (
          <div
            key={job.id}
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
          >
            {/* Job header */}
            <div className="flex items-start justify-between gap-2 p-4 pb-3">
              <button
                className="min-w-0 text-left group flex-1"
                onClick={() => onJobClick?.(job)}
                title={onJobClick ? "Click to view job posting" : undefined}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={`text-sm font-bold text-slate-100 truncate ${onJobClick ? "group-hover:text-indigo-300 transition-colors" : ""}`}>{job.title}</h3>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    #{job.id}
                  </span>
                  {onJobClick && (
                    <ExternalLink size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-indigo-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {job.department.slice(0, 60)}
                </p>
              </button>
              <button
                onClick={() => {
                  if (resume) removeTask(resume.id);
                  if (coverLetter) removeTask(coverLetter.id);
                  if (email) removeTask(email.id);
                }}
                title="Remove"
                className="p-1 rounded-lg hover:bg-slate-700 transition-colors shrink-0"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Doc rows */}
            <div className="px-4 pb-4 space-y-2">
              {resume && (
                <DocRow
                  task={resume}
                  label="Tailored Resume"
                  color="#c084fc"
                  prefix="Resume"
                />
              )}
              {coverLetter && (
                <DocRow
                  task={coverLetter}
                  label="Cover Letter"
                  color="#fbbf24"
                  prefix="CoverLetter"
                />
              )}
              {email && <EmailRow task={email} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
