"use client";

import { useState } from "react";
import { Job } from "@/types";
import { dispatchEmail, GenerationProfile } from "@/lib/generateInBackground";
import { X, Mail, Globe, Sparkles } from "lucide-react";

interface EmailModalProps {
  job: Job;
  apiKey: string;
  generationProfile: GenerationProfile;
  onClose: () => void;
}

export function EmailModal({ job, apiKey, generationProfile, onClose }: EmailModalProps) {
  const [extraInfo, setExtraInfo] = useState("");
  const isJobBank = job.source === "job-bank";
  const hasEnrichedDesc = typeof window !== "undefined" && !!localStorage.getItem(`job-assistant-jb-desc-${job.id}`);

  const handleGenerate = () => {
    dispatchEmail(job, apiKey, generationProfile, extraInfo);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
      >
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #0ea5e9, #6366f1)" }} />

        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Mail size={14} style={{ color: "#0ea5e9" }} />
                <span className="text-xs font-semibold" style={{ color: "#0ea5e9" }}>Application Email</span>
              </div>
              <h2 className="text-sm font-bold text-slate-100 leading-snug">{job.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{job.department}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors shrink-0"
              style={{ color: "var(--muted-foreground)" }}
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-3 mb-4">
            {job.contactEmail && (
              <div className="rounded-xl p-2.5 border text-xs flex items-center gap-2" style={{ background: "rgba(14,165,233,0.07)", borderColor: "rgba(14,165,233,0.2)", color: "#7dd3fc" }}>
                <Mail size={11} className="shrink-0" />
                Send to: <span className="font-medium ml-1">{job.contactEmail}</span>
              </div>
            )}
            {isJobBank && !hasEnrichedDesc && (
              <div className="rounded-xl p-2.5 border text-xs flex items-center gap-2" style={{ background: "rgba(245,158,11,0.07)", borderColor: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                <Globe size={11} className="shrink-0" />
                Tip: Research the company first (Overview tab) for a more targeted email.
              </div>
            )}
            {hasEnrichedDesc && (
              <div className="rounded-xl p-2.5 border text-xs flex items-center gap-2" style={{ background: "rgba(14,165,233,0.07)", borderColor: "rgba(14,165,233,0.2)", color: "#7dd3fc" }}>
                <Globe size={11} className="shrink-0" />
                Using researched company description.
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Extra context <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={extraInfo}
              onChange={(e) => setExtraInfo(e.target.value)}
              placeholder={`e.g. "Mention my Python experience" or "Keep it very brief" or "I'm especially interested in their AI work"`}
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none resize-none leading-relaxed"
              style={{ background: "var(--muted)", border: "1px solid var(--card-border)" }}
              autoFocus
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Generates in the background — check History when done.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #0ea5e9, #6366f1)", color: "white" }}
            >
              <Sparkles size={14} /> Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline display component used in HistoryView for a completed email task
export function EmailDisplay({ text }: { text: string }) {
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expanded, setExpanded] = useState(false);

  let subject = "";
  let body = "";
  try {
    const parsed = JSON.parse(text);
    subject = parsed.subject ?? "";
    body = parsed.body ?? "";
  } catch {
    body = text;
  }

  const copy = async (val: string, setter: (b: boolean) => void) => {
    await navigator.clipboard.writeText(val);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">Subject:</span>
        <span className="text-xs text-slate-300 flex-1 truncate">{subject}</span>
        <button
          onClick={() => copy(subject, setCopiedSubject)}
          className="text-xs px-2 py-0.5 rounded-md shrink-0 transition-all"
          style={copiedSubject ? { background: "rgba(16,185,129,0.15)", color: "#10b981" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          {copiedSubject ? "✓" : "Copy"}
        </button>
      </div>

      {!expanded ? (
        <button onClick={() => setExpanded(true)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Show body ▾
        </button>
      ) : (
        <div className="space-y-1.5">
          <div
            className="rounded-lg p-2.5 text-xs text-slate-300 leading-relaxed border font-mono whitespace-pre-wrap"
            style={{ background: "#0d0d1a", borderColor: "var(--card-border)", maxHeight: 200, overflowY: "auto" }}
          >
            {body}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(body, setCopiedBody)}
              className="text-xs px-2 py-0.5 rounded-md transition-all"
              style={copiedBody ? { background: "rgba(16,185,129,0.15)", color: "#10b981" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              {copiedBody ? "✓ Copied" : "Copy body"}
            </button>
            <button
              onClick={() => copy(`Subject: ${subject}\n\n${body}`, setCopiedAll)}
              className="text-xs px-2 py-0.5 rounded-md transition-all"
              style={copiedAll ? { background: "rgba(16,185,129,0.15)", color: "#10b981" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              {copiedAll ? "✓ Copied" : "Copy all"}
            </button>
            <button onClick={() => setExpanded(false)} className="text-xs text-slate-500 hover:text-slate-300 ml-auto transition-colors">
              Hide ▴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
