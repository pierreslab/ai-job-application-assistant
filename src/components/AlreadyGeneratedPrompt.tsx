"use client";

import { useState } from "react";
import { GenerationTask } from "@/lib/generationStore";
import { compileLatexToPdf, downloadBlob, downloadTex } from "@/lib/latexCompiler";
import { CheckCircle2, Download, ExternalLink, RefreshCw, Loader2, History } from "lucide-react";

interface AlreadyGeneratedPromptProps {
  task: GenerationTask;
  label: string;
  color: string;
  onRegenerate: () => void;
  onViewHistory: () => void;
  onClose: () => void;
}

function timeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function makeSlug(title: string) {
  return title.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 40);
}

export function AlreadyGeneratedPrompt({
  task, label, color, onRegenerate, onViewHistory, onClose,
}: AlreadyGeneratedPromptProps) {
  const [compiling, setCompiling] = useState(false);
  const slug = makeSlug(task.job.title);
  const prefix = task.type === "resume" ? "Resume" : "CoverLetter";

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
      onClose();
    }
  };

  const openOverleaf = () => {
    if (!task.latex) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "snip";
    input.value = task.latex;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: color + "44" }}
      >
        <div className="h-0.5" style={{ background: color }} />
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
            <span className="text-sm font-bold text-slate-100">{label} already generated</span>
          </div>
          <p className="text-xs text-slate-400 mb-1">
            <span className="font-medium text-slate-200">{task.job.title}</span>
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Generated {task.finishedAt ? timeAgo(task.finishedAt) : "recently"}
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleDownload}
              disabled={compiling}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: color + "22", color, border: `1px solid ${color}44` }}
            >
              {compiling ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download PDF
            </button>
            <button
              onClick={openOverleaf}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <ExternalLink size={14} /> Open in Overleaf
            </button>
            <div className="flex gap-2">
              <button
                onClick={onViewHistory}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
              >
                <History size={14} /> History
              </button>
              <button
                onClick={onRegenerate}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
              >
                <RefreshCw size={14} /> Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
