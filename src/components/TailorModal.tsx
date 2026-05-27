"use client";

import { useState, useEffect } from "react";
import { Job } from "@/types";
import { tailorResumeWithGemini, TailoredResume } from "@/lib/gemini";
import { GenerationProfile } from "@/lib/generateInBackground";
import { compileLatexToPdf, downloadBlob, downloadTex } from "@/lib/latexCompiler";
import {
  X, Loader2, CheckCircle2, Download, ExternalLink,
  FileText, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";

interface TailorModalProps {
  job: Job;
  apiKey: string;
  generationProfile: GenerationProfile;
  onClose: () => void;
}

function jobSlug(job: Job) {
  return job.title.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 40);
}

export function TailorModal({ job, apiKey, generationProfile, onClose }: TailorModalProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("loading");
  const [result, setResult] = useState<TailoredResume | null>(null);
  const [error, setError] = useState("");
  const [showLatex, setShowLatex] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState("");

  useEffect(() => {
    tailorResumeWithGemini(job, generationProfile.masterResumeLatex, apiKey)
      .then((res) => {
        setResult(res);
        setState("done");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadPdf = async () => {
    if (!result) return;
    setCompiling(true);
    setCompileError("");
    try {
      const blob = await compileLatexToPdf(result.latex);
      downloadBlob(blob, `Resume_${jobSlug(job)}.pdf`);
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : "PDF compilation failed");
      downloadTex(result.latex, `Resume_${jobSlug(job)}.tex`);
    } finally {
      setCompiling(false);
    }
  };

  const openInOverleaf = () => {
    if (!result) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "snip";
    input.value = result.latex;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
      >
        {/* Accent bar */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #a855f7, #6366f1, #10b981)" }} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={15} style={{ color: "#a855f7" }} />
              <span className="text-xs font-semibold" style={{ color: "#a855f7" }}>Resume Tailor</span>
            </div>
            <h2 className="text-base font-bold text-slate-100 leading-snug">
              {job.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-sm">{job.department}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-700 shrink-0 ml-3"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">

          {/* Loading */}
          {state === "loading" && (
            <div
              className="rounded-xl p-5 flex items-center gap-4 border"
              style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}
            >
              <Loader2 size={22} className="animate-spin shrink-0" style={{ color: "var(--accent-light)" }} />
              <div>
                <p className="text-sm font-semibold text-slate-200">Tailoring your resume...</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gemini is rewriting your summary and reordering your projects to match this role
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div
              className="rounded-xl p-4 border text-sm"
              style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}
            >
              <p className="font-semibold mb-1">Tailoring failed</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
          )}

          {/* Done */}
          {state === "done" && result && (
            <>
              {/* What changed */}
              <div
                className="rounded-xl p-4 border"
                style={{ background: "rgba(168,85,247,0.06)", borderColor: "rgba(168,85,247,0.2)" }}
              >
                <p className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: "#a855f7" }}>
                  <CheckCircle2 size={13} /> What Gemini changed
                </p>
                <ul className="space-y-1.5">
                  {result.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: "#a855f7" }} />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={compiling}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {compiling ? <><Loader2 size={15} className="animate-spin" /> Compiling...</> : <><Download size={15} /> Download PDF</>}
                </button>
                <button
                  onClick={openInOverleaf}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 border"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", borderColor: "rgba(34,197,94,0.25)" }}
                >
                  <ExternalLink size={15} /> Open in Overleaf
                </button>
              </div>

              {compileError && (
                <p className="text-xs text-center" style={{ color: "#fbbf24" }}>
                  PDF compile failed — downloaded .tex instead. Open in Overleaf for PDF.
                </p>
              )}

              <p className="text-xs text-center text-slate-600">
                PDF compiled server-side · Overleaf available as backup
              </p>

              {/* Collapsible LaTeX preview */}
              <div>
                <button
                  onClick={() => setShowLatex(!showLatex)}
                  className="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} /> View tailored LaTeX source
                  </span>
                  {showLatex ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showLatex && (
                  <div
                    className="mt-2 rounded-xl p-3 overflow-auto text-xs font-mono leading-relaxed border"
                    style={{
                      background: "#0d0d1a",
                      borderColor: "var(--card-border)",
                      color: "#94a3b8",
                      maxHeight: 280,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {result.latex}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
