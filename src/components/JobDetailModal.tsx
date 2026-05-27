"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { JobMatch } from "@/types";
import { formatWage, formatHours, scoreColor, scoreLabel } from "@/lib/utils";
import { ScoreRing } from "./ScoreRing";
import { CoverLetterModal } from "./CoverLetterModal";
import { AlreadyGeneratedPrompt } from "./AlreadyGeneratedPrompt";
import { ResumeOptionsModal } from "./ResumeOptionsModal";
import { EmailModal } from "./EmailModal";
import { askAboutJob, generateJobBankDescription } from "@/lib/gemini";
import { dispatchBoth, dispatchCoverLetter, dispatchEmail, dispatchResume, GenerationProfile } from "@/lib/generateInBackground";
import { getTasks, subscribe, getLatestTask } from "@/lib/generationStore";
import { compileLatexToPdf, downloadBlob } from "@/lib/latexCompiler";
import {
  X, MapPin, Clock, DollarSign, Wifi, Mail, Calendar,
  CheckCircle2, AlertCircle, Sparkles, Send, Star, Wand2, ExternalLink,
  Globe, Loader2, RefreshCw, Pencil, Check, AtSign, Package,
  ChevronLeft, ChevronRight, Copy, Share2, Download,
} from "lucide-react";

interface JobDetailModalProps {
  match: JobMatch;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  profileText: string;
  apiKey: string;
  generationProfile: GenerationProfile;
  applied: boolean;
  onApply: () => void;
  onGoToHistory: () => void;
  onNavigate?: (dir: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: { current: number; total: number };
}

const STORAGE_DESC = (id: string) => `job-assistant-jb-desc-${id}`;
const STORAGE_HM   = (id: string) => `job-assistant-jb-hm-${id}`;

function slugPart(value: string, fallback = "company") {
  const slug = value
    .replace(/[^a-z0-9\s-]/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("_");
  return slug || fallback;
}

async function compileSafe(latex: string): Promise<Blob | null> {
  try {
    return await compileLatexToPdf(latex);
  } catch {
    return null;
  }
}

export function JobDetailModal({ match, saved, onSave, onClose, profileText, apiKey, generationProfile, applied, onApply, onGoToHistory, onNavigate, hasPrev, hasNext, position }: JobDetailModalProps) {
  const { job, score, reasoning, highlights, concerns } = match;
  const isJobBank = job.source === "job-bank";

  // ── Persisted: enriched description ──────────────────────────────────────
  const [enrichedDescription, setEnrichedDescriptionState] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchStatus, setResearchStatus] = useState("");
  const [researchError, setResearchError] = useState("");

  const setEnrichedDescription = (desc: string | null) => {
    setEnrichedDescriptionState(desc);
    if (desc) localStorage.setItem(STORAGE_DESC(job.id), desc);
    else localStorage.removeItem(STORAGE_DESC(job.id));
  };

  // ── Persisted: hiring manager override ───────────────────────────────────
  // undefined = not overridden (use job default); "" = explicitly cleared; "Name" = set
  const [hmOverride, setHmOverrideState] = useState<string | undefined>(undefined);
  const [editingHM, setEditingHM] = useState(false);
  const [hmInput, setHmInput] = useState("");

  const setHmOverride = (val: string | undefined) => {
    setHmOverrideState(val);
    if (val !== undefined) localStorage.setItem(STORAGE_HM(job.id), val);
    else localStorage.removeItem(STORAGE_HM(job.id));
  };

  // Load from localStorage on mount
  useEffect(() => {
    const savedDesc = localStorage.getItem(STORAGE_DESC(job.id));
    if (savedDesc) setEnrichedDescriptionState(savedDesc); else setEnrichedDescriptionState(null);

    const savedHm = localStorage.getItem(STORAGE_HM(job.id));
    if (savedHm !== null) setHmOverrideState(savedHm); else setHmOverrideState(undefined);
  }, [job.id]);

  // Keyboard shortcuts: arrows to navigate, Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowRight" && hasNext && onNavigate) { e.preventDefault(); onNavigate("next"); }
      else if (e.key === "ArrowLeft" && hasPrev && onNavigate) { e.preventDefault(); onNavigate("prev"); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasNext, hasPrev, onNavigate, onClose]);

  const handleResearch = async () => {
    if (!apiKey) return;
    setResearching(true);
    setResearchError("");
    setResearchStatus("Starting Google Search...");
    try {
      const res = await generateJobBankDescription(job, apiKey, (s) => setResearchStatus(s));
      setEnrichedDescription(res.description);
      // Only auto-apply HM if the user hasn't already set one
      if (res.hiringManager && hmOverride === undefined) {
        setHmOverride(res.hiringManager);
      }
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : "Research failed. Check your API key.");
    } finally {
      setResearching(false);
      setResearchStatus("");
    }
  };

  // For job bank jobs the stored hiringManager is "COMPANY — PHONE", not a person name.
  // We only use the HM override (user-set) as the addressee.
  const displayHM = hmOverride !== undefined
    ? hmOverride
    : (isJobBank ? undefined : job.hiringManager);

  const effectiveJob = {
    ...job,
    ...(enrichedDescription ? { description: enrichedDescription } : {}),
    hiringManager: displayHM || undefined,
  };

  // ── Other state ───────────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "requirements" |   "ai">("overview");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [showResumeOptions, setShowResumeOptions] = useState(false);
  const [showCLPrompt, setShowCLPrompt] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showBothPrompt, setShowBothPrompt] = useState(false);
  const [downloadingPackage, setDownloadingPackage] = useState(false);
  const [copied, setCopied] = useState<"reasoning" | "share" | null>(null);

  const copyText = async (text: string, kind: "reasoning" | "share") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  };

  const handleShare = () => {
    const url = job.jobUrl || (typeof window !== "undefined" ? `${window.location.origin}/?job=${job.id}` : "");
    const text = `${job.title} — ${job.department}${url ? `\n${url}` : ""}`;
    if (typeof navigator !== "undefined" && (navigator as unknown as { share?: (d: ShareData) => Promise<void> }).share) {
      (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({ title: job.title, text: job.department, url }).catch(() => copyText(text, "share"));
    } else {
      copyText(text, "share");
    }
  };

  useSyncExternalStore(subscribe, getTasks, getTasks);
  const existingResume = getLatestTask(job.id, "resume");
  const existingCL = getLatestTask(job.id, "coverLetter");
  const existingEmail = getLatestTask(job.id, "email");
  const hasFullPackage = !!existingResume && !!existingCL && !!existingEmail;

  const downloadExistingPackage = async () => {
    if (!existingResume?.latex || !existingCL?.latex || downloadingPackage) return;
    setDownloadingPackage(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const [resumePdf, clPdf] = await Promise.all([
        compileSafe(existingResume.latex),
        compileSafe(existingCL.latex),
      ]);

      zip.file(resumePdf ? "Resume.pdf" : "Resume.tex", resumePdf ?? existingResume.latex);
      zip.file(clPdf ? "Cover_Letter.pdf" : "Cover_Letter.tex", clPdf ?? existingCL.latex);

      if (existingEmail?.text) {
        try {
          const parsed = JSON.parse(existingEmail.text) as { subject?: string; body?: string };
          zip.file("Email.txt", `Subject: ${parsed.subject ?? ""}\n\n${parsed.body ?? existingEmail.text}`);
        } catch {
          zip.file("Email.txt", existingEmail.text);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${slugPart(job.department)}.zip`);
    } finally {
      setDownloadingPackage(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || !apiKey) return;
    setAsking(true);
    try {
      const resp = await askAboutJob(job, profileText, question, apiKey);
      setAnswer(resp);
    } catch {
      setAnswer("Sorry, couldn't get an answer right now. Check your API key.");
    } finally {
      setAsking(false);
    }
  };

  const handleResumeClick = () => {
    if (existingResume) { setShowResumePrompt(true); return; }
    setShowResumeOptions(true);
  };

  const handleCLClick = () => {
    if (existingCL) { setShowCLPrompt(true); return; }
    setShowCoverLetter(true);
  };

  const saveHM = () => {
    setHmOverride(hmInput.trim() || "");
    setEditingHM(false);
  };

  const handleBothClick = () => {
    if (existingResume || existingCL || existingEmail) {
      setShowBothPrompt(true);
      return;
    }
    dispatchBoth(effectiveJob, apiKey, generationProfile);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border flex flex-col overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border-strong)", maxHeight: "90vh", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Score accent bar */}
        <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg, ${scoreColor(score)}, ${scoreColor(score)}66, transparent)` }} />

        {/* Header */}
        <div className="flex items-start gap-4 p-5 pb-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-xl font-bold text-slate-100">{job.title}</h2>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                #{job.id}
              </span>
              {isJobBank && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>
                  <Globe size={10} /> Imported
                </span>
              )}
              {applied && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
                  <CheckCircle2 size={11} /> Applied
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{job.department}</p>
          </div>
          <div className="flex items-center gap-2">
            <ScoreRing score={score} size={60} strokeWidth={5} />
            {onNavigate && (hasPrev || hasNext) && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={() => onNavigate("prev")}
                  disabled={!hasPrev}
                  className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
                  style={{ color: "var(--muted-foreground-strong)" }}
                  title="Previous job (←)"
                >
                  <ChevronLeft size={16} />
                </button>
                {position && (
                  <span className="text-[10px] font-mono tabular-nums w-10 text-center" style={{ color: "var(--muted-foreground)" }}>
                    {position.current}/{position.total}
                  </span>
                )}
                <button
                  onClick={() => onNavigate("next")}
                  disabled={!hasNext}
                  className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
                  style={{ color: "var(--muted-foreground-strong)" }}
                  title="Next job (→)"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-slate-700" style={{ color: "var(--muted-foreground)" }} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 px-5 py-3 border-y shrink-0" style={{ borderColor: "var(--card-border)", background: "var(--muted)" }}>
          <span className="flex items-center gap-1.5 text-sm text-slate-300">
            <MapPin size={14} className="text-slate-500" /> {job.location}
          </span>
          {job.hours != null && job.hours > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-slate-300">
              <Clock size={14} className="text-slate-500" /> {formatHours(job.hours)}
            </span>
          )}
          {job.wage != null && job.wage > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-slate-300">
              <DollarSign size={14} className="text-slate-500" /> {formatWage(job.wage)}
            </span>
          )}
          {job.isRemote && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: "#10b981" }}>
              <Wifi size={14} /> Remote Available
            </span>
          )}
          {job.deadline && (
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <Calendar size={14} className="text-slate-500" /> Apply by {job.deadline}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0 relative" style={{ borderColor: "var(--card-border)" }}>
          {(["overview", "requirements", "ai"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-3 text-sm font-semibold capitalize transition-colors relative"
              style={{
                color: activeTab === tab ? "var(--accent-light)" : "var(--muted-foreground)",
                background: activeTab === tab ? "rgba(99,102,241,0.05)" : "transparent",
              }}
            >
              {tab === "ai" ? "✦ AI Analysis" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "var(--gradient-primary)" }} />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto p-5 flex-1">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-4">

              {/* Imported listing research banner */}
              {isJobBank && !enrichedDescription && (
                <div className="rounded-xl p-3 border flex items-start gap-3" style={{ background: "rgba(14,165,233,0.07)", borderColor: "rgba(14,165,233,0.25)" }}>
                  <Globe size={15} className="mt-0.5 shrink-0" style={{ color: "#0ea5e9" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#0ea5e9" }}>Imported listing — brief description</p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Look up <span className="text-slate-300 font-medium">{job.department}</span> with Google Search to generate a richer description for resume & cover letter generation.
                    </p>
                  </div>
                  <button
                    onClick={handleResearch}
                    disabled={researching || !apiKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all disabled:opacity-50 hover:opacity-90"
                    style={{ background: "#0ea5e9", color: "white" }}
                  >
                    {researching ? <><Loader2 size={12} className="animate-spin" /> {researchStatus || "Searching..."}</> : <><Globe size={12} /> Research</>}
                  </button>
                </div>
              )}

              {researchError && (
                <div className="rounded-xl p-3 border text-xs" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}>
                  {researchError}
                </div>
              )}

              {/* Enriched description panel */}
              {enrichedDescription && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(14,165,233,0.3)" }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: "rgba(14,165,233,0.1)" }}>
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#0ea5e9" }}>
                      <Globe size={12} /> Researched via Google Search · saved
                    </span>
                    <button
                      onClick={handleResearch}
                      disabled={researching}
                      className="text-xs flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                      style={{ color: "#0ea5e9" }}
                    >
                      <RefreshCw size={11} className={researching ? "animate-spin" : ""} />
                      {researching ? researchStatus || "Re-searching..." : "Redo"}
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{enrichedDescription}</p>
                  </div>
                  <div className="px-3 pb-2">
                    <p className="text-xs text-slate-500 italic">Used automatically when tailoring your resume and cover letter.</p>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                  {enrichedDescription ? "Original Description" : "Description"}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">{job.description}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Responsibilities</h3>
                <ul className="space-y-1.5">
                  {job.responsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {job.tags.map((tag) => (
                    <span key={tag} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "var(--muted)", color: "#94a3b8", border: "1px solid var(--card-border)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {job.contactEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-slate-500" />
                  <a href={`mailto:${job.contactEmail}`} className="text-indigo-400 hover:underline">
                    {job.contactEmail}
                  </a>
                </div>
              )}

              {/* ── Hiring Manager row (always shown, editable) ── */}
              <div className="rounded-xl border p-3" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-400">Hiring Manager</span>
                  {!editingHM && (
                    <button
                      onClick={() => { setHmInput(displayHM ?? ""); setEditingHM(true); }}
                      className="flex items-center gap-1 text-xs opacity-50 hover:opacity-100 transition-opacity"
                      style={{ color: "var(--accent-light)" }}
                    >
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                </div>

                {editingHM ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={hmInput}
                      onChange={(e) => setHmInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveHM(); if (e.key === "Escape") setEditingHM(false); }}
                      placeholder="e.g. Jane Smith"
                      autoFocus
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 outline-none"
                      style={{ background: "var(--card)", border: "1px solid var(--accent)" }}
                    />
                    <button onClick={saveHM} className="p-1.5 rounded-lg transition-colors" style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent-light)" }}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingHM(false)} className="p-1.5 rounded-lg transition-colors hover:bg-slate-700" style={{ color: "var(--muted-foreground)" }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : displayHM ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 font-medium">{displayHM}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.12)", color: "#4ade80" }}>
                      Cover letter addressed to them
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Not set — cover letter will say &quot;Dear Hiring Manager&quot;. Click Edit to add a name.
                  </p>
                )}
              </div>

            </div>
          )}

          {/* ── REQUIREMENTS ─────────────────────────────────────────────── */}
          {activeTab === "requirements" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Requirements</h3>
                <ul className="space-y-2">
                  {job.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-400">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── AI ANALYSIS ──────────────────────────────────────────────── */}
          {activeTab === "ai" && (
            <div className="space-y-4">
              <div className="rounded-xl p-4 border" style={{ background: `${scoreColor(score)}0d`, borderColor: `${scoreColor(score)}33` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} style={{ color: scoreColor(score) }} />
                    <span className="text-sm font-semibold" style={{ color: scoreColor(score) }}>
                      {scoreLabel(score)} · {score}/100
                    </span>
                  </div>
                  {reasoning && (
                    <button
                      onClick={() => {
                        const full = [
                          `${job.title} — ${job.department}`,
                          `Score: ${score}/100 (${scoreLabel(score)})`,
                          "",
                          reasoning,
                          highlights.length ? `\nWhy it fits:\n${highlights.map((h) => `• ${h}`).join("\n")}` : "",
                          concerns.length ? `\nConsider:\n${concerns.map((c) => `• ${c}`).join("\n")}` : "",
                        ].filter(Boolean).join("\n");
                        copyText(full, "reasoning");
                      }}
                      className="text-[10px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
                      style={{ background: "rgba(255,255,255,0.04)", color: "var(--muted-foreground-strong)", border: "1px solid var(--card-border)" }}
                      title="Copy AI analysis"
                    >
                      {copied === "reasoning" ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{reasoning}</p>
              </div>

              {highlights.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Why it fits you</h3>
                  <ul className="space-y-2">
                    {highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "#10b981" }} />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {concerns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Things to consider</h3>
                  <ul className="space-y-2">
                    {concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Ask AI about this job</h3>
                <div className="flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                    placeholder={apiKey ? "e.g. How can I prepare for this role?" : "Add API key in profile to ask questions"}
                    disabled={!apiKey}
                    className="flex-1 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none disabled:opacity-50"
                    style={{ background: "var(--muted)", border: "1px solid var(--card-border)" }}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={!apiKey || !question.trim() || asking}
                    className="px-3 py-2 rounded-xl font-medium text-sm transition-opacity disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    {asking ? "..." : <Send size={15} />}
                  </button>
                </div>
                {answer && (
                  <div className="mt-3 rounded-xl p-3 text-sm text-slate-300 leading-relaxed border" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--accent-light)" }}>✦ Gemini</p>
                    {answer}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t gap-2 flex-wrap shrink-0" style={{ borderColor: "var(--card-border)" }}>
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all shrink-0"
              style={saved ? { background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" } : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
            >
              <Star size={15} fill={saved ? "#f59e0b" : "none"} />
              {saved ? "Saved" : "Save"}
            </button>
            <button
              onClick={onApply}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all shrink-0"
              style={applied ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" } : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
            >
              <CheckCircle2 size={15} />
              {applied ? "Applied ✓" : "Mark Applied"}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground-strong)", border: "1px solid var(--card-border)" }}
              title="Share job"
            >
              {copied === "share" ? <><Check size={15} style={{ color: "#10b981" }} /> Copied</> : <><Share2 size={15} /> Share</>}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {apiKey && (
              <button
                onClick={() => setShowEmail(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={existingEmail ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" } : { background: "rgba(14,165,233,0.12)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.3)" }}
              >
                <AtSign size={15} /> {existingEmail ? "Email ✓" : "Email"}
              </button>
            )}
            {apiKey && isJobBank && (
              <button
                onClick={handleBothClick}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={
                  hasFullPackage
                    ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }
                    : { background: "linear-gradient(135deg, #a855f7, #f59e0b)", color: "white", boxShadow: "0 0 12px rgba(168,85,247,0.2)" }
                }
              >
                <Package size={15} /> {hasFullPackage ? "Package ✓" : "Both + Email"}
              </button>
            )}
            {apiKey && (
              <button
                onClick={handleResumeClick}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={existingResume ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" } : { background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                <Wand2 size={15} />
                {existingResume ? "Resume ✓" : (enrichedDescription ? "Tailor Resume ✦" : "Tailor Resume")}
              </button>
            )}
            {apiKey && (
              <button
                onClick={handleCLClick}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={existingCL ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" } : { background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}
              >
                <Mail size={15} />
                {existingCL ? "Cover Letter ✓" : (enrichedDescription ? "Cover Letter ✦" : "Cover Letter")}
              </button>
            )}

            {job.jobUrl && (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "white" }}
              >
                <ExternalLink size={15} /> Open application
              </a>
            )}
          </div>
        </div>
      </div>

      {showEmail && (
        <EmailModal job={effectiveJob} apiKey={apiKey} generationProfile={generationProfile} onClose={() => setShowEmail(false)} />
      )}

      {showCoverLetter && (
        <CoverLetterModal job={effectiveJob} apiKey={apiKey} generationProfile={generationProfile} onClose={() => setShowCoverLetter(false)} />
      )}

      {showResumeOptions && (
        <ResumeOptionsModal job={effectiveJob} apiKey={apiKey} generationProfile={generationProfile} onClose={() => setShowResumeOptions(false)} />
      )}

      {showResumePrompt && existingResume && (
        <AlreadyGeneratedPrompt
          task={existingResume}
          label="Resume"
          color="#c084fc"
          onRegenerate={() => { setShowResumePrompt(false); setShowResumeOptions(true); }}
          onViewHistory={() => { setShowResumePrompt(false); onGoToHistory(); onClose(); }}
          onClose={() => setShowResumePrompt(false)}
        />
      )}

      {showCLPrompt && existingCL && (
        <AlreadyGeneratedPrompt
          task={existingCL}
          label="Cover Letter"
          color="#fbbf24"
          onRegenerate={() => { setShowCLPrompt(false); setShowCoverLetter(true); }}
          onViewHistory={() => { setShowCLPrompt(false); onGoToHistory(); onClose(); }}
          onClose={() => setShowCLPrompt(false)}
        />
      )}

      {showBothPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && setShowBothPrompt(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
            <div>
              <p className="text-sm font-bold text-slate-100 mb-1">Already generated</p>
              <p className="text-xs text-slate-400">
                {hasFullPackage
                  ? "A resume, cover letter, and application email have already been generated for this job."
                  : existingResume && existingCL
                  ? "A resume and cover letter already exist. Only the email is missing."
                  : existingResume
                  ? "A resume has already been generated. Missing items will be queued."
                  : existingCL
                  ? "A cover letter has already been generated. Missing items will be queued."
                  : "An email has already been generated. Missing documents will be queued."}
              </p>
            </div>
            <div className="space-y-2">
              {existingResume && existingCL && (
                <button
                  onClick={downloadExistingPackage}
                  disabled={downloadingPackage}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(14,165,233,0.14)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.35)" }}
                >
                  {downloadingPackage ? <><Loader2 size={14} className="animate-spin" /> Building ZIP…</> : <><Download size={14} /> Download {slugPart(job.department)}.zip</>}
                </button>
              )}
              {(existingResume || existingCL || existingEmail) && (
                <button
                  onClick={() => {
                    setShowBothPrompt(false);
                    dispatchBoth(effectiveJob, apiKey, generationProfile);
                  }}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #a855f7, #f59e0b)", color: "white" }}
                >
                  Regenerate Package
                </button>
              )}
              {!hasFullPackage && (
                <button
                  onClick={() => {
                    setShowBothPrompt(false);
                    if (!existingResume) dispatchResume(effectiveJob, apiKey, generationProfile);
                    if (!existingCL) dispatchCoverLetter(effectiveJob, apiKey, generationProfile);
                    if (!existingEmail) dispatchEmail(effectiveJob, apiKey, generationProfile);
                  }}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #a855f7, #f59e0b)", color: "white" }}
                >
                  Generate Missing
                </button>
              )}
              <button
                onClick={() => { setShowBothPrompt(false); onGoToHistory(); onClose(); }}
                className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}
              >
                View in History
              </button>
              <button
                onClick={() => setShowBothPrompt(false)}
                className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                style={{ background: "transparent", color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
