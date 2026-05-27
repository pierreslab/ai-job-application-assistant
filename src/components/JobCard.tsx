"use client";

import { memo, useMemo, useState } from "react";
import { JobMatch } from "@/types";
import { formatWage, formatHours, scoreColor, scoreLabel } from "@/lib/utils";
import { ScoreRing } from "./ScoreRing";
import { CoverLetterModal } from "./CoverLetterModal";
import { AlreadyGeneratedPrompt } from "./AlreadyGeneratedPrompt";
import { ResumeOptionsModal } from "./ResumeOptionsModal";
import { useJobTask } from "@/lib/useJobTask";
import { GenerationProfile } from "@/lib/generateInBackground";
import { MapPin, Clock, DollarSign, Wifi, Star, ChevronRight, Wand2, Mail, ExternalLink, CheckCircle2, Globe } from "lucide-react";

interface JobCardProps {
  match: JobMatch;
  rank: number;
  totalCount: number;
  saved: boolean;
  onSave: () => void;
  onClick: () => void;
  apiKey: string;
  generationProfile: GenerationProfile;
  applied: boolean;
  onApply: () => void;
  onGoToHistory: () => void;
}

const PAGE_LOAD_TIME = Date.now();

function JobCardInner({ match, rank, totalCount, saved, onSave, onClick, apiKey, generationProfile, applied, onApply, onGoToHistory }: JobCardProps) {
  const { job, score, highlights } = match;
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [showResumeOptions, setShowResumeOptions] = useState(false);
  const [showCLPrompt, setShowCLPrompt] = useState(false);

  const daysLeft = useMemo(
    () => job.deadline ? Math.ceil((new Date(job.deadline).getTime() - PAGE_LOAD_TIME) / 86400000) : null,
    [job.deadline]
  );

  const existingResume = useJobTask(job.id, "resume");
  const existingCL = useJobTask(job.id, "coverLetter");
  const isJobBank = job.source === "job-bank";

  const handleResumeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (existingResume) { setShowResumePrompt(true); return; }
    setShowResumeOptions(true);
  };

  const handleCLClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (existingCL) { setShowCLPrompt(true); return; }
    setShowCoverLetter(true);
  };

  return (
    <>
      <div
        className="glow-card lazy-card rounded-2xl border cursor-pointer relative overflow-hidden group"
        style={{
          background: "var(--card)",
          borderColor: applied ? "rgba(16,185,129,0.35)" : "var(--card-border)",
        }}
        onClick={onClick}
      >
        {/* Top score bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px] transition-all duration-700"
          style={{
            width: `${Math.max(score, 3)}%`,
            background: `linear-gradient(90deg, ${scoreColor(score)}, ${scoreColor(score)}66)`,
            boxShadow: score > 0 ? `0 0 12px ${scoreColor(score)}66` : "none",
          }}
        />

        <div className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <h3 className="font-semibold text-[15px] leading-tight text-slate-100 truncate group-hover:text-indigo-200 transition-colors">
                  {job.title}
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  #{job.id}
                </span>
                {isJobBank && (
                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium" style={{ background: "rgba(14,165,233,0.12)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.25)" }}>
                    <Globe size={9} /> JB
                  </span>
                )}
                {applied && (
                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium" style={{ background: "rgba(16,185,129,0.14)", color: "#10b981" }}>
                    <CheckCircle2 size={10} /> Applied
                  </span>
                )}
                {daysLeft !== null && (() => {
                  if (daysLeft > 10) return null;
                  const urgent = daysLeft <= 2;
                  return (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold" style={{
                      background: urgent ? "rgba(239,68,68,0.18)" : "rgba(245,158,11,0.14)",
                      color: urgent ? "#f87171" : "#fbbf24",
                    }}>
                      {daysLeft <= 0 ? "Today" : daysLeft === 1 ? "1d left" : `${daysLeft}d left`}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs truncate" style={{ color: "var(--muted-foreground-strong)" }}>{job.department}</p>
              <p className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--muted-foreground)" }}>
                Rank #{rank} of {totalCount}
              </p>
            </div>

            {/* Score block */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative">
                {score >= 70 && (
                  <div
                    className="absolute inset-0 rounded-full blur-md opacity-50"
                    style={{ background: scoreColor(score), transform: "scale(0.9)" }}
                  />
                )}
                <div className="relative">
                  <ScoreRing score={score} size={54} strokeWidth={4} showLabel={false} />
                </div>
              </div>
              <span className="text-[10px] font-semibold mt-1 whitespace-nowrap" style={{ color: scoreColor(score) }}>
                {scoreLabel(score)}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground-strong)" }}>
              <MapPin size={11} style={{ color: "var(--muted-foreground)" }} /> {job.location}
            </span>
            {job.hours != null && job.hours > 0 && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground-strong)" }}>
                <Clock size={11} style={{ color: "var(--muted-foreground)" }} /> {formatHours(job.hours)}
              </span>
            )}
            {job.wage != null && job.wage > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#4ade80" }}>
                <DollarSign size={11} /> {formatWage(job.wage)}
              </span>
            )}
            {job.isRemote && (
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#10b981" }}>
                <Wifi size={11} /> Remote
              </span>
            )}
          </div>

          {/* Tags */}
          {job.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {job.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="chip">{tag}</span>
              ))}
              {job.tags.length > 4 && (
                <span className="chip" style={{ opacity: 0.6 }}>+{job.tags.length - 4}</span>
              )}
            </div>
          )}

          {/* AI Highlights */}
          {highlights.length > 0 && (
            <div className="space-y-1 mb-3 rounded-lg px-3 py-2" style={{ background: `${scoreColor(score)}0d`, border: `1px solid ${scoreColor(score)}22` }}>
              {highlights.slice(0, 2).map((h, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--muted-foreground-strong)" }}>
                  <span className="mt-0.5 shrink-0" style={{ color: scoreColor(score) }}>✦</span>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t gap-2 flex-wrap" style={{ borderColor: "var(--card-border)" }}>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onSave(); }}
                className="flex items-center gap-1 text-xs font-medium transition-colors shrink-0 hover:text-amber-300"
                style={{ color: saved ? "#f59e0b" : "var(--muted-foreground)" }}
                title={saved ? "Unsave" : "Save"}
              >
                <Star size={13} fill={saved ? "#f59e0b" : "none"} />
                {saved ? "Saved" : "Save"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onApply(); }}
                className="flex items-center gap-1 text-xs font-medium transition-colors shrink-0 hover:text-emerald-300"
                style={{ color: applied ? "#10b981" : "var(--muted-foreground)" }}
              >
                <CheckCircle2 size={13} />
                {applied ? "Applied" : "Apply"}
              </button>
              {job.jobUrl && (
                <a
                  href={job.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs font-medium transition-colors shrink-0 hover:text-indigo-300"
                  style={{ color: "var(--muted-foreground)" }}
                  title="Open application link"
                >
                  <ExternalLink size={12} /> Apply
                </a>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {apiKey && (
                <button
                  onClick={handleResumeClick}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all hover:-translate-y-0.5"
                  style={{
                    background: existingResume ? "rgba(16,185,129,0.1)" : "rgba(168,85,247,0.12)",
                    color: existingResume ? "#10b981" : "#c084fc",
                    border: `1px solid ${existingResume ? "rgba(16,185,129,0.3)" : "rgba(168,85,247,0.3)"}`,
                  }}
                  title={existingResume ? "Resume generated" : "Generate tailored resume"}
                >
                  <Wand2 size={11} /> Resume {existingResume && "✓"}
                </button>
              )}
              {apiKey && (
                <button
                  onClick={handleCLClick}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all hover:-translate-y-0.5"
                  style={{
                    background: existingCL ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                    color: existingCL ? "#10b981" : "#fbbf24",
                    border: `1px solid ${existingCL ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                  }}
                  title={existingCL ? "Cover letter generated" : "Generate cover letter"}
                >
                  <Mail size={11} /> Cover {existingCL && "✓"}
                </button>
              )}
              <button
                className="flex items-center gap-0.5 text-xs font-semibold transition-all px-2 py-1 rounded-lg"
                style={{ color: "var(--accent-light)" }}
              >
                Details
                <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCoverLetter && (
        <CoverLetterModal job={job} apiKey={apiKey} generationProfile={generationProfile} onClose={() => setShowCoverLetter(false)} />
      )}

      {showResumeOptions && (
        <ResumeOptionsModal job={job} apiKey={apiKey} generationProfile={generationProfile} onClose={() => setShowResumeOptions(false)} />
      )}

      {showResumePrompt && existingResume && (
        <AlreadyGeneratedPrompt
          task={existingResume}
          label="Resume"
          color="#c084fc"
          onRegenerate={() => { setShowResumePrompt(false); setShowResumeOptions(true); }}
          onViewHistory={() => { setShowResumePrompt(false); onGoToHistory(); }}
          onClose={() => setShowResumePrompt(false)}
        />
      )}

      {showCLPrompt && existingCL && (
        <AlreadyGeneratedPrompt
          task={existingCL}
          label="Cover Letter"
          color="#fbbf24"
          onRegenerate={() => { setShowCLPrompt(false); setShowCoverLetter(true); }}
          onViewHistory={() => { setShowCLPrompt(false); onGoToHistory(); }}
          onClose={() => setShowCLPrompt(false)}
        />
      )}
    </>
  );
}

export const JobCard = memo(JobCardInner, (prev, next) => (
  prev.match === next.match &&
  prev.saved === next.saved &&
  prev.applied === next.applied &&
  prev.rank === next.rank &&
  prev.totalCount === next.totalCount &&
  prev.apiKey === next.apiKey &&
  prev.generationProfile === next.generationProfile
  // onSave/onClick/onApply/onGoToHistory are intentionally not compared;
  // they change identity every render but their behavior is stable per job.
));
