"use client";

import { useState, useSyncExternalStore } from "react";
import { Job } from "@/types";
import { tailorResumeWithGemini, generateCoverLetterWithGemini } from "@/lib/gemini";
import { compileLatexToPdf, downloadBlob } from "@/lib/latexCompiler";
import { getTasks, subscribe, getLatestTask, addTask, updateTask } from "@/lib/generationStore";
import { GenerationProfile } from "@/lib/generateInBackground";
import { enrichJobFromStorage } from "@/lib/utils";
import {
  X, Loader2, CheckCircle2, AlertCircle,
  Download, FileText, Wand2, Mail, Package, Play,
} from "lucide-react";

interface JobStatus {
  job: Job;
  resume: "skip" | "pending" | "running" | "done" | "error";
  coverLetter: "skip" | "pending" | "running" | "done" | "error";
  resumeLatex?: string;
  coverLetterLatex?: string;
  error?: string;
}

interface BulkGenerateModalProps {
  savedJobs: Job[];
  appliedJobs: Set<string>;
  apiKey: string;
  generationProfile: GenerationProfile;
  onClose: () => void;
}

type GenMode = "both" | "resume" | "coverLetter";

function jobSlug(job: Job) {
  return job.title.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 40);
}

const CONCURRENCY = 3;

export function BulkGenerateModal({ savedJobs: allSavedJobs, appliedJobs, apiKey, generationProfile, onClose }: BulkGenerateModalProps) {
  const savedJobs = allSavedJobs.filter((j) => !appliedJobs.has(j.id));
  // Reactive store to check existing
  useSyncExternalStore(subscribe, getTasks, getTasks);

  const [screen, setScreen] = useState<"preflight" | "running" | "done">("preflight");
  const [genMode, setGenMode] = useState<GenMode>("both");
  const [skipExisting, setSkipExisting] = useState(true);

  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);

  const updateStatus = (id: string, patch: Partial<JobStatus>) => {
    setStatuses((prev) => prev.map((s) => (s.job.id === id ? { ...s, ...patch } : s)));
  };

  const buildStatuses = (): JobStatus[] =>
    savedJobs.map((job) => {
      const hasResume = !!getLatestTask(job.id, "resume");
      const hasCL = !!getLatestTask(job.id, "coverLetter");
      return {
        job,
        resume:
          genMode === "coverLetter"
            ? "skip"
            : skipExisting && hasResume
            ? "skip"
            : "pending",
        coverLetter:
          genMode === "resume"
            ? "skip"
            : skipExisting && hasCL
            ? "skip"
            : "pending",
      };
    });

  const start = async () => {
    const initial = buildStatuses();
    setStatuses(initial);
    setScreen("running");

    const toProcess = initial.filter((s) => s.resume !== "skip" || s.coverLetter !== "skip");

    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      const batch = toProcess.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.flatMap((s) => {
          const ops: Promise<void>[] = [];
          if (s.resume !== "skip") {
            ops.push(
              (async () => {
                updateStatus(s.job.id, { resume: "running" });
                const enriched = enrichJobFromStorage(s.job);
                const storeId = addTask(enriched, "resume");
                try {
                  const result = await tailorResumeWithGemini(enriched, generationProfile.masterResumeLatex, apiKey);
                  updateStatus(s.job.id, { resume: "done", resumeLatex: result.latex });
                  updateTask(storeId, { status: "done", latex: result.latex, changes: result.changes, finishedAt: Date.now() });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  updateStatus(s.job.id, { resume: "error", error: msg });
                  updateTask(storeId, { status: "error", error: msg, finishedAt: Date.now() });
                }
              })()
            );
          }
          if (s.coverLetter !== "skip") {
            ops.push(
              (async () => {
                updateStatus(s.job.id, { coverLetter: "running" });
                const enriched = enrichJobFromStorage(s.job);
                const storeId = addTask(enriched, "coverLetter");
                try {
                  const latex = await generateCoverLetterWithGemini(
                    enriched,
                    generationProfile.coverLetterTemplateLatex || "",
                    generationProfile.masterResumeLatex,
                    "",
                    apiKey
                  );
                  updateStatus(s.job.id, { coverLetter: "done", coverLetterLatex: latex });
                  updateTask(storeId, { status: "done", latex, finishedAt: Date.now() });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  updateStatus(s.job.id, { coverLetter: "error" });
                  updateTask(storeId, { status: "error", error: msg, finishedAt: Date.now() });
                }
              })()
            );
          }
          return ops;
        })
      );
    }
    setScreen("done");
  };

  async function compileSafe(latex: string): Promise<Blob | null> {
    try { return await compileLatexToPdf(latex); } catch { return null; }
  }

  const downloadAll = async () => {
    setDownloading(true);
    setCompileProgress(0);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const items: { latex: string; name: string }[] = [];
      for (const s of statuses) {
        const slug = jobSlug(s.job);
        if (s.resumeLatex) items.push({ latex: s.resumeLatex, name: `Resume_${slug}` });
        if (s.coverLetterLatex) items.push({ latex: s.coverLetterLatex, name: `CoverLetter_${slug}` });
      }
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async (item) => ({ ...item, pdf: await compileSafe(item.latex) })));
        for (const r of results) {
          zip.file(r.pdf ? `${r.name}.pdf` : `${r.name}.tex`, r.pdf ?? r.latex);
        }
        setCompileProgress(Math.min(i + CONCURRENCY, items.length));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, "Applications.zip");
    } finally {
      setDownloading(false);
    }
  };

  const downloadSinglePdf = async (latex: string, filename: string) => {
    try {
      const pdf = await compileLatexToPdf(latex);
      downloadBlob(pdf, filename);
    } catch {
      downloadBlob(new Blob([latex], { type: "text/plain" }), filename.replace(".pdf", ".tex"));
    }
  };

  const openOverleaf = (latex: string) => {
    const form = document.createElement("form");
    form.method = "POST"; form.action = "https://www.overleaf.com/docs"; form.target = "_blank";
    const inp = document.createElement("input"); inp.type = "hidden"; inp.name = "snip"; inp.value = latex;
    form.appendChild(inp); document.body.appendChild(form); form.submit(); document.body.removeChild(form);
  };

  const totalFiles = statuses.filter((s) => s.resumeLatex || s.coverLetterLatex).length;
  const doneCount = statuses.filter((s) =>
    (s.resume === "done" || s.resume === "skip" || s.resume === "error") &&
    (s.coverLetter === "done" || s.coverLetter === "skip" || s.coverLetter === "error")
  ).length;

  const StatusIcon = ({ state }: { state: JobStatus["resume"] }) => {
    if (state === "running") return <Loader2 size={13} className="animate-spin shrink-0" style={{ color: "var(--accent-light)" }} />;
    if (state === "done") return <CheckCircle2 size={13} className="shrink-0" style={{ color: "#10b981" }} />;
    if (state === "error") return <AlertCircle size={13} className="shrink-0" style={{ color: "#ef4444" }} />;
    if (state === "skip") return <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>—</span>;
    return <span className="w-3 h-3 rounded-full shrink-0" style={{ background: "var(--muted-foreground)", display: "inline-block" }} />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border flex flex-col overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border)", maxHeight: "88vh" }}
      >
        <div className="h-0.5 w-full shrink-0" style={{ background: "linear-gradient(90deg, #a855f7, #6366f1, #f59e0b)" }} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package size={15} style={{ color: "var(--accent-light)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--accent-light)" }}>Bulk Generate</span>
            </div>
            <h2 className="text-base font-bold text-slate-100">
              {savedJobs.length} saved job{savedJobs.length !== 1 ? "s" : ""}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors" style={{ color: "var(--muted-foreground)" }}>
            <X size={16} />
          </button>
        </div>

        {/* PRE-FLIGHT SCREEN */}
        {screen === "preflight" && (
          <div className="px-5 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Type selector */}
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Generate</p>
              <div className="flex gap-2">
                {(["both", "resume", "coverLetter"] as GenMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGenMode(mode)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all border"
                    style={{
                      background: genMode === mode ? "var(--accent)" : "var(--muted)",
                      color: genMode === mode ? "white" : "var(--muted-foreground)",
                      borderColor: genMode === mode ? "var(--accent)" : "var(--card-border)",
                    }}
                  >
                    {mode === "both" && <><Wand2 size={11} /><Mail size={11} /> Both</>}
                    {mode === "resume" && <><Wand2 size={11} /> Resume only</>}
                    {mode === "coverLetter" && <><Mail size={11} /> Cover Letter only</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Skip existing toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setSkipExisting(!skipExisting)}
                className="relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0"
                style={{ background: skipExisting ? "var(--accent)" : "var(--muted)" }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: skipExisting ? "translateX(16px)" : "translateX(0)" }}
                />
              </div>
              <span className="text-sm text-slate-300">Skip already-generated documents</span>
            </label>

            {/* Job list preview */}
            <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: "40vh" }}>
              {savedJobs.map((job) => {
                const hasR = !!getLatestTask(job.id, "resume");
                const hasCL = !!getLatestTask(job.id, "coverLetter");
                const skipR = genMode === "coverLetter" || (skipExisting && hasR);
                const skipCL = genMode === "resume" || (skipExisting && hasCL);
                return (
                  <div
                    key={job.id}
                    className="rounded-xl border p-3 flex items-center justify-between gap-2"
                    style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{job.title}</p>
                      <p className="text-xs text-slate-500 truncate">{job.department.slice(0, 50)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {genMode !== "coverLetter" && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: skipR ? "var(--muted-foreground)" : "#c084fc" }}>
                          <Wand2 size={10} /> {skipR ? <span style={{ color: "#10b981" }}>✓</span> : "gen"}
                        </span>
                      )}
                      {genMode !== "resume" && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: skipCL ? "var(--muted-foreground)" : "#fbbf24" }}>
                          <Mail size={10} /> {skipCL ? <span style={{ color: "#10b981" }}>✓</span> : "gen"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={start}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "var(--accent)", color: "white", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}
            >
              <Play size={15} /> Start Generating
            </button>
          </div>
        )}

        {/* RUNNING / DONE SCREEN */}
        {screen !== "preflight" && (
          <>
            {/* Progress */}
            <div className="px-5 pb-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>{doneCount}/{statuses.length} jobs processed</span>
                {screen === "done" && <span style={{ color: "#10b981" }}>✦ Complete</span>}
              </div>
              <div className="rounded-full overflow-hidden h-1.5" style={{ background: "var(--muted)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: statuses.length ? `${(doneCount / statuses.length) * 100}%` : "0%", background: "var(--accent)" }}
                />
              </div>
            </div>

            {/* Job list */}
            <div className="overflow-y-auto flex-1 px-5 pb-3 space-y-2">
              {statuses.map((s) => (
                <div
                  key={s.job.id}
                  className="rounded-xl border p-3"
                  style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{s.job.title}</p>
                      <p className="text-xs text-slate-500 truncate">{s.job.department.slice(0, 50)}</p>
                    </div>
                    {(s.resumeLatex || s.coverLetterLatex) && (
                      <div className="flex gap-1 shrink-0">
                        {s.resumeLatex && (
                          <button
                            onClick={() => downloadSinglePdf(s.resumeLatex!, `Resume_${jobSlug(s.job)}.pdf`)}
                            title="Download resume PDF"
                            className="p-1 rounded-lg hover:bg-slate-600 transition-colors"
                            style={{ color: "#c084fc" }}
                          >
                            <FileText size={12} />
                          </button>
                        )}
                        {s.coverLetterLatex && (
                          <button
                            onClick={() => downloadSinglePdf(s.coverLetterLatex!, `CoverLetter_${jobSlug(s.job)}.pdf`)}
                            title="Download cover letter PDF"
                            className="p-1 rounded-lg hover:bg-slate-600 transition-colors"
                            style={{ color: "#fbbf24" }}
                          >
                            <Mail size={12} />
                          </button>
                        )}
                        {s.resumeLatex && (
                          <button
                            onClick={() => openOverleaf(s.resumeLatex!)}
                            title="Open in Overleaf"
                            className="p-1 rounded-lg hover:bg-slate-600 transition-colors text-xs font-bold"
                            style={{ color: "#4ade80" }}
                          >
                            OL
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4">
                    {s.resume !== "skip" && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <StatusIcon state={s.resume} />
                        <Wand2 size={11} style={{ color: "#c084fc" }} /> Resume
                      </div>
                    )}
                    {s.coverLetter !== "skip" && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <StatusIcon state={s.coverLetter} />
                        <Mail size={11} style={{ color: "#fbbf24" }} /> Cover Letter
                      </div>
                    )}
                    {s.resume === "skip" && s.coverLetter === "skip" && (
                      <span className="text-xs text-slate-600">Skipped (already generated)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {screen === "done" && totalFiles > 0 && (
              <div className="p-4 border-t shrink-0" style={{ borderColor: "var(--card-border)" }}>
                <button
                  onClick={downloadAll}
                  disabled={downloading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}
                >
                  {downloading
                    ? <><Loader2 size={15} className="animate-spin" /> Compiling PDFs... {compileProgress > 0 ? `(${compileProgress}/${totalFiles})` : ""}</>
                    : <><Download size={15} /> Download All as ZIP ({totalFiles} files)</>}
                </button>
                <p className="text-xs text-center text-slate-600 mt-2">
                  PDFs compiled server-side · falls back to .tex if compilation fails
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
