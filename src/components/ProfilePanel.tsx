"use client";

import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Sparkles, CheckCircle2, FileText, Mail, AtSign, Bookmark, ClipboardCheck, Clock, ChevronRight } from "lucide-react";
import { getTasks, subscribe } from "@/lib/generationStore";
import { Job } from "@/types";
import { scoreColor } from "@/lib/utils";
import { LocalUserProfile } from "@/lib/userProfile";

function readSetSize(key: string): number {
  if (typeof window === "undefined") return 0;
  const s = localStorage.getItem(key);
  try { return s ? JSON.parse(s).length : 0; } catch { return 0; }
}

interface ProfilePanelProps {
  profile: LocalUserProfile;
  recentJobs?: { job: Job; score: number }[];
  onJobClick?: (job: Job) => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ME";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "ME";
}

function ProfilePanelInner({ profile, recentJobs = [], onJobClick }: ProfilePanelProps) {
  useSyncExternalStore(subscribe, getTasks, getTasks);
  const tasks = getTasks();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const { resumeDone, clDone, emailDone } = useMemo(() => {
    let r = 0, c = 0, e = 0;
    for (const t of tasks) {
      if (t.status !== "done") continue;
      if (t.type === "resume") r++;
      else if (t.type === "coverLetter") c++;
      else if (t.type === "email") e++;
    }
    return { resumeDone: r, clDone: c, emailDone: e };
  }, [tasks]);

  const savedCount = mounted ? readSetSize("job-assistant-saved") : 0;
  const appliedCount = mounted ? readSetSize("job-assistant-applied") : 0;

  return (
    <aside
      className="rounded-2xl border h-fit sticky top-20 overflow-hidden animate-fade-in-up"
      style={{ background: "var(--card)", borderColor: "var(--card-border)", width: 272, minWidth: 256 }}
    >
      {/* Gradient accent */}
      <div className="h-1 w-full" style={{ background: "var(--gradient-primary)" }} />

      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: "var(--card-border)" }}>
        <div
          className="logo-mark w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 text-white"
        >
          {initials(profile.displayName)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{profile.displayName || "Your Profile"}</p>
          <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
            {[profile.parsedResume?.program, profile.parsedResume?.year].filter(Boolean).join(" · ") || "Upload a resume to personalize"}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Activity stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatTile icon={<Bookmark size={11} />} label="Saved" value={savedCount} color="#f59e0b" />
          <StatTile icon={<ClipboardCheck size={11} />} label="Applied" value={appliedCount} color="#10b981" />
          <StatTile icon={<FileText size={11} />} label="Resumes" value={resumeDone} color="#c084fc" />
          <StatTile icon={<Mail size={11} />} label="Letters" value={clDone} color="#fbbf24" />
          {emailDone > 0 && (
            <div className="col-span-2">
              <StatTile icon={<AtSign size={11} />} label="Emails" value={emailDone} color="#0ea5e9" wide />
            </div>
          )}
        </div>

        {/* Recently viewed */}
        {recentJobs.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--muted-foreground-strong)" }}>
              <Clock size={10} /> Recently viewed
            </p>
            <div className="space-y-1">
              {recentJobs.slice(0, 5).map((r) => (
                <button
                  key={r.job.id}
                  onClick={() => onJobClick?.(r.job)}
                  className="w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2 group hover:-translate-y-0.5 transition-all"
                  style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
                >
                  {r.score > 0 ? (
                    <span
                      className="text-[10px] font-black w-7 text-right shrink-0"
                      style={{ color: scoreColor(r.score) }}
                    >
                      {r.score}
                    </span>
                  ) : (
                    <span className="w-7 shrink-0 text-[10px] text-center" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                  <span className="text-xs text-slate-200 truncate flex-1 group-hover:text-white transition-colors">
                    {r.job.title}
                  </span>
                  <ChevronRight size={10} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Profile snapshot */}
        <div
          className="rounded-xl p-3 border space-y-1.5"
          style={{ background: "rgba(99,102,241,0.05)", borderColor: "rgba(99,102,241,0.18)" }}
        >
          <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--accent-light)" }}>
            <Sparkles size={11} /> Profile snapshot
          </p>
          {(profile.parsedResume
            ? [
                ...profile.parsedResume.skills.slice(0, 4),
                ...profile.parsedResume.interests.slice(0, 2),
              ]
            : ["Add your Gemini key", "Upload your resume", "Generate tailored applications"]
          ).slice(0, 6).map((line) => (
            <div key={line} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground-strong)" }}>
              <CheckCircle2 size={10} className="shrink-0" style={{ color: "#10b981" }} />
              {line}
            </div>
          ))}
        </div>

        {/* Info blurb */}
        <div
          className="rounded-lg p-2.5 border text-xs leading-relaxed"
          style={{ background: "var(--muted)", borderColor: "var(--card-border)", color: "var(--muted-foreground)" }}
        >
          <Sparkles size={11} className="inline mr-1" style={{ color: "var(--accent-light)" }} />
          Gemini scores every job against your full resume, skills, and background — then ranks them for you.
        </div>
      </div>
    </aside>
  );
}

export const ProfilePanel = memo(ProfilePanelInner);

function StatTile({ icon, label, value, color, wide }: { icon: React.ReactNode; label: string; value: number; color: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${wide ? "flex items-center justify-between" : ""}`}
      style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
    >
      <div className="flex items-center gap-1.5 text-xs" style={{ color }}>
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <p className={`font-black ${wide ? "text-base" : "text-lg mt-0.5"}`} style={{ color: value > 0 ? color : "var(--muted-foreground)" }}>
        {value}
      </p>
    </div>
  );
}
