"use client";

import { useState } from "react";
import { Job } from "@/types";
import { generateCoverLetterWithGemini } from "@/lib/gemini";
import { GenerationProfile } from "@/lib/generateInBackground";
import { enrichJobFromStorage } from "@/lib/utils";
import { compileLatexToPdf, downloadBlob, downloadTex as downloadTexFile } from "@/lib/latexCompiler";
import { addTask, updateTask } from "@/lib/generationStore";
import {
  X, Loader2, CheckCircle2, Download, ExternalLink,
  FileText, Sparkles, ChevronDown, ChevronUp, Send,
} from "lucide-react";

interface CoverLetterModalProps {
  job: Job;
  apiKey: string;
  generationProfile: GenerationProfile;
  onClose: () => void;
}

function makeSlug(job: Job) {
  return job.title.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 40);
}

export function CoverLetterModal({ job, apiKey, generationProfile, onClose }: CoverLetterModalProps) {
  const [state, setState] = useState<"input" | "loading" | "done" | "error">("input");
  const [extraInfo, setExtraInfo] = useState("");
  const [latex, setLatex] = useState("");
  const [error, setError] = useState("");
  const [showLatex, setShowLatex] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState("");

  const generate = async () => {
    setState("loading");
    setError("");
    const enriched = enrichJobFromStorage(job);
    const storeId = addTask(enriched, "coverLetter");
    try {
      const result = await generateCoverLetterWithGemini(
        enriched,
        generationProfile.coverLetterTemplateLatex || "",
        generationProfile.masterResumeLatex,
        extraInfo,
        apiKey
      );
      setLatex(result);
      setState("done");
      updateTask(storeId, { status: "done", latex: result, finishedAt: Date.now() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      updateTask(storeId, { status: "error", error: msg, finishedAt: Date.now() });
    }
  };

  const handleClose = () => onClose();

  const handleDownloadPdf = async () => {
    if (!latex) return;
    setCompiling(true);
    setCompileError("");
    try {
      const blob = await compileLatexToPdf(latex);
      downloadBlob(blob, `CoverLetter_${makeSlug(job)}.pdf`);
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : "PDF compilation failed");
      downloadTexFile(latex, `CoverLetter_${makeSlug(job)}.tex`);
    } finally {
      setCompiling(false);
    }
  };

  const openInOverleaf = () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "snip";
    input.value = latex;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
      >
        {/* Accent bar */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #f59e0b, #ef4444, #ec4899)" }} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={15} style={{ color: "#f59e0b" }} />
              <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Cover Letter</span>
            </div>
            <h2 className="text-base font-bold text-slate-100 leading-snug">{job.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-sm">{job.department}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-700 shrink-0 ml-3"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">

          {/* Input state */}
          {(state === "input" || state === "error") && (
            <>
              {!job.hiringManager && (
                <div
                  className="rounded-xl p-3 border text-xs flex items-start gap-2"
                  style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", color: "#fbbf24" }}
                >
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>
                    No hiring manager name found for this job. Addressing to &quot;Hiring Manager&quot; generically —
                    if you know their name, add it in the extra context below (e.g. &quot;Address the letter to Jeff Burrow&quot;).
                  </span>
                </div>
              )}
              {job.hiringManager && (
                <div
                  className="rounded-xl p-3 border text-xs flex items-center gap-2"
                  style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)", color: "#4ade80" }}
                >
                  <span>✓</span>
                  <span>Will address to <strong>{job.hiringManager}</strong></span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Extra context for Gemini{" "}
                  <span className="text-slate-600 font-normal">(optional)</span>
                </label>
                <textarea
                  value={extraInfo}
                  onChange={(e) => setExtraInfo(e.target.value)}
                  placeholder={`e.g. "I'm drawn to the research side of this role" or "Emphasize my leadership experience"\n\nFor research or student-success roles, include a specific idea for how you would contribute.`}
                  rows={5}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none resize-none leading-relaxed"
                  style={{ background: "var(--muted)", border: "1px solid var(--card-border)" }}
                  autoFocus
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  Gemini will weave this into the letter naturally, in your voice.
                </p>
              </div>

              {state === "error" && (
                <div
                  className="rounded-xl p-3 border text-xs"
                  style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}
                >
                  <p className="font-semibold mb-0.5">Generation failed</p>
                  <p className="opacity-80">{error}</p>
                </div>
              )}

              <button
                onClick={generate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "white" }}
              >
                <Send size={15} /> Generate Cover Letter
              </button>
            </>
          )}

          {/* Loading */}
          {state === "loading" && (
            <div
              className="rounded-xl p-5 flex items-center gap-4 border"
              style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.2)" }}
            >
              <Loader2 size={22} className="animate-spin shrink-0" style={{ color: "#f59e0b" }} />
              <div>
                <p className="text-sm font-semibold text-slate-200">Writing your cover letter...</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gemini 3 Flash is crafting a tailored letter in your voice
                </p>
              </div>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <>
              <div
                className="rounded-xl p-4 border"
                style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.2)" }}
              >
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
                  <CheckCircle2 size={13} /> Cover letter ready
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tailored to <span className="text-slate-200 font-medium">{job.title}</span> at{" "}
                  <span className="text-slate-200 font-medium">{job.department}</span>.
                  Written in your style with relevant projects highlighted.
                </p>
              </div>

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

              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-600">
                  PDF compiled server-side · Overleaf available as backup
                </p>
                <button
                  onClick={() => { setState("input"); setLatex(""); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Regenerate
                </button>
              </div>

              {/* Collapsible LaTeX preview */}
              <div>
                <button
                  onClick={() => setShowLatex(!showLatex)}
                  className="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} /> View LaTeX source
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
                    {latex}
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
