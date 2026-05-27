"use client";

import { useState } from "react";
import { Job, JobMatch } from "@/types";
import {
  X, Sparkles, Plus, Loader2, CheckCircle2, AlertCircle,
  MapPin, Tag, ExternalLink,
} from "lucide-react";

interface CustomJobModalProps {
  apiKey: string;
  profileText: string;
  onAdd: (match: JobMatch) => void;
  onClose: () => void;
}

export function CustomJobModal({ apiKey, profileText, onAdd, onClose }: CustomJobModalProps) {
  const [rawText, setRawText] = useState("");
  const [step, setStep] = useState<"paste" | "parsing" | "preview" | "scoring" | "done" | "error">("paste");
  const [parsed, setParsed] = useState<Job | null>(null);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleParse = async () => {
    if (!rawText.trim()) return;
    if (!apiKey) { setErrorMsg("Add your Gemini API key in the sidebar first."); setStep("error"); return; }
    setStep("parsing");
    setErrorMsg("");
    try {
      const { parseJobPosting } = await import("@/lib/gemini");
      const job = await parseJobPosting(rawText, apiKey);
      setParsed(job);
      setStep("preview");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const handleAdd = async () => {
    if (!parsed) return;
    setStep("scoring");
    try {
      const { scoreCustomJob } = await import("@/lib/gemini");
      const scored = await scoreCustomJob(parsed, profileText, apiKey);
      setMatch(scored);
      setStep("done");
      onAdd(scored);
    } catch {
      // Add without score if scoring fails
      const fallback: JobMatch = { job: parsed, score: 0, reasoning: "", highlights: [], concerns: [] };
      setMatch(fallback);
      setStep("done");
      onAdd(fallback);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="relative w-full max-w-2xl rounded-2xl border overflow-hidden flex flex-col"
        style={{ background: "var(--card)", borderColor: "var(--card-border)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b shrink-0" style={{ borderColor: "var(--card-border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)" }}>
              <Plus size={15} style={{ color: "var(--accent-light)" }} />
            </div>
            <h2 className="font-bold text-slate-100">Add Custom Job</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              any job, anywhere
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors" style={{ color: "var(--muted-foreground)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Step: paste */}
          {(step === "paste" || step === "error") && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Paste any job posting below — LinkedIn, Indeed, company website, anywhere. Gemini will extract the details.
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste the full job posting here..."
                rows={14}
                className="w-full rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none resize-none border"
                style={{ background: "var(--muted)", borderColor: "var(--card-border)", lineHeight: 1.6 }}
              />
              {step === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm border" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              <button
                onClick={handleParse}
                disabled={!rawText.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                <Sparkles size={15} /> Parse with AI
              </button>
            </div>
          )}

          {/* Step: parsing */}
          {step === "parsing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-light)" }} />
              <p className="text-sm text-slate-400">Extracting job details...</p>
            </div>
          )}

          {/* Step: preview */}
          {step === "preview" && parsed && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Review the extracted details before adding:</p>

              <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Job Title</p>
                  <input
                    value={parsed.title}
                    onChange={(e) => setParsed({ ...parsed, title: e.target.value })}
                    className="w-full bg-transparent outline-none text-sm font-bold text-slate-100 border-b pb-1"
                    style={{ borderColor: "var(--card-border)" }}
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Company / Department</p>
                  <input
                    value={parsed.department}
                    onChange={(e) => setParsed({ ...parsed, department: e.target.value })}
                    className="w-full bg-transparent outline-none text-sm text-slate-300 border-b pb-1"
                    style={{ borderColor: "var(--card-border)" }}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><MapPin size={11} />{parsed.location}</span>
                  {parsed.isRemote && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Remote</span>}
                  {parsed.wage && <span>${parsed.wage}/hr</span>}
                  {parsed.hours && <span>{parsed.hours}h/wk</span>}
                  {parsed.deadline && <span>Due {new Date(parsed.deadline).toLocaleDateString()}</span>}
                </div>

                {parsed.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "var(--accent-light)" }}>
                        <Tag size={9} />{t}
                      </span>
                    ))}
                  </div>
                )}

                {parsed.requirements.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Key Requirements</p>
                    <ul className="space-y-1">
                      {parsed.requirements.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                          <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-slate-600" />
                          {r}
                        </li>
                      ))}
                      {parsed.requirements.length > 5 && (
                        <li className="text-xs text-slate-600">+{parsed.requirements.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {parsed.jobUrl && (
                  <a href={parsed.jobUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "var(--accent-light)" }}>
                    <ExternalLink size={11} /> View original posting
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("paste")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
                >
                  Back
                </button>
                <button
                  onClick={handleAdd}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  <Plus size={14} /> Add & Score Job
                </button>
              </div>
            </div>
          )}

          {/* Step: scoring */}
          {step === "scoring" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: "#10b981" }} />
              <p className="text-sm text-slate-400">Scoring match against your profile...</p>
            </div>
          )}

          {/* Step: done */}
          {step === "done" && match && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <CheckCircle2 size={32} style={{ color: "#10b981" }} />
              </div>
              <div>
                <p className="font-bold text-slate-100 text-lg">{match.job.title}</p>
                <p className="text-sm text-slate-500 mt-0.5">{match.job.department}</p>
              </div>
              {match.score > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-black" style={{ color: match.score >= 75 ? "#10b981" : match.score >= 60 ? "var(--accent-light)" : "#f59e0b" }}>
                    {match.score}
                  </span>
                  <span className="text-sm text-slate-500">/ 100 match score</span>
                </div>
              )}
              {match.reasoning && <p className="text-sm text-slate-400 max-w-sm">{match.reasoning}</p>}
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "var(--accent)", color: "white" }}
              >
                View in Job List
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
