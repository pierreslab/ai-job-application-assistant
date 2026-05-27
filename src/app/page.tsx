"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Job, JobMatch } from "@/types";
import { SAMPLE_JOBS } from "@/lib/utils";
import { JobCard } from "@/components/JobCard";
import { JobDetailModal } from "@/components/JobDetailModal";
import { ProfilePanel } from "@/components/ProfilePanel";
import { ResumeUpload } from "@/components/ResumeUpload";
import { ToastContainer } from "@/components/Toast";
import { CommandPalette } from "@/components/CommandPalette";
import {
  Sparkles, Search, Star, ChevronRight, Download,
  Briefcase, Zap, AlertCircle, CheckCircle2, Loader2, Package, History, Wifi, Bookmark, Plus, ClipboardCheck, Building2, Globe, Command,
} from "lucide-react";
import { generateJobBankDescription } from "@/lib/gemini";
import { ParsedResume } from "@/lib/gemini";
import { BulkGenerateModal } from "@/components/BulkGenerateModal";
import { GenerationHistory } from "@/components/GenerationHistory";
import { HistoryView } from "@/components/HistoryView";
import { CustomJobModal } from "@/components/CustomJobModal";
import { pushRecent, getRecentIds, subscribeRecent } from "@/lib/recent";
import { jobMatchesToCsv, downloadCsv } from "@/lib/exportCsv";
import { sanitizeHiringManager } from "@/lib/utils";
import {
  EMPTY_USER_PROFILE,
  LocalUserProfile,
  buildProfileText,
  clearUserProfile,
  loadUserProfile,
  saveUserProfile,
} from "@/lib/userProfile";
import { GENERIC_COVER_LETTER_TEMPLATE_LATEX } from "@/lib/masterResume";

type SortMode = "match" | "wage" | "hours";
type FilterMode = "all" | "saved" | "remote" | "applied" | "deadline";
type ViewMode = "jobs" | "history" | "saved" | "applied" | "jobbank";

const SORT_STORAGE = "job-assistant-sort-mode";
const FILTER_STORAGE = "job-assistant-filter-mode";
const MIN_SCORE_STORAGE = "job-assistant-min-score";
const JOB_BANK_SORT_STORAGE = "job-assistant-jobbank-sort-mode";

function isSortMode(value: string | null): value is SortMode {
  return value === "match" || value === "wage" || value === "hours";
}

function isFilterMode(value: string | null): value is FilterMode {
  return value === "all" || value === "saved" || value === "remote" || value === "applied" || value === "deadline";
}

function JobBankView({
  jobs,
  matches,
  savedJobs,
  appliedJobs,
  apiKey,
  generationProfile,
  onSave,
  onApply,
  onClick,
  onGoToHistory,
}: {
  jobs: Job[];
  matches: JobMatch[];
  savedJobs: Set<string>;
  appliedJobs: Set<string>;
  apiKey: string;
  generationProfile: { profileText: string; masterResumeLatex: string; coverLetterTemplateLatex?: string };
  onSave: (id: string) => void;
  onApply: (id: string) => void;
  onClick: (match: JobMatch) => void;
  onGoToHistory: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("wage");

  useEffect(() => {
    const t = setTimeout(() => {
      const stored = localStorage.getItem(JOB_BANK_SORT_STORAGE);
      if (isSortMode(stored)) setSortMode(stored);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    localStorage.setItem(JOB_BANK_SORT_STORAGE, sortMode);
  }, [sortMode]);

  // Bulk research state
  const [bulkResearching, setBulkResearching] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkError, setBulkError] = useState("");
  const [, forceRefresh] = useState(0);

  const getResearchedCount = () =>
    jobs.filter((j) => !!localStorage.getItem(`job-assistant-jb-desc-${j.id}`)).length;

  const handleBulkResearch = async () => {
    if (!apiKey || bulkResearching) return;
    setBulkError("");
    const unresearched = jobs.filter((j) => !localStorage.getItem(`job-assistant-jb-desc-${j.id}`));
    if (unresearched.length === 0) {
      setBulkError("All jobs already researched.");
      return;
    }
    setBulkResearching(true);
    setBulkDone(0);
    setBulkTotal(unresearched.length);

    // Process 2 at a time to avoid rate limits
    const CONCURRENCY = 2;
    for (let i = 0; i < unresearched.length; i += CONCURRENCY) {
      const batch = unresearched.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (job) => {
          try {
            const res = await generateJobBankDescription(job, apiKey);
            localStorage.setItem(`job-assistant-jb-desc-${job.id}`, res.description);
            // Only auto-save HM if user hasn't already set one for this job
            const existingHm = localStorage.getItem(`job-assistant-jb-hm-${job.id}`);
            if (res.hiringManager && existingHm === null) {
              localStorage.setItem(`job-assistant-jb-hm-${job.id}`, res.hiringManager);
            }
          } catch {
            // skip failed — user can redo individually
          } finally {
            setBulkDone((prev) => prev + 1);
          }
        })
      );
    }
    setBulkResearching(false);
    forceRefresh((n) => n + 1); // re-render to update count
  };

  const scoreMap = useMemo(() => new Map(matches.map((m) => [m.job.id, m])), [matches]);

  const displayJobs: JobMatch[] = useMemo(() => {
    let list: JobMatch[] = jobs.map((job) => {
      const m = scoreMap.get(job.id);
      return m ?? { job, score: 0, reasoning: "", highlights: [], concerns: [] };
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.job.title.toLowerCase().includes(q) ||
          m.job.department.toLowerCase().includes(q) ||
          m.job.location.toLowerCase().includes(q) ||
          m.job.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (sortMode === "match") return b.score - a.score;
      if (sortMode === "wage") return (b.job.wage ?? 0) - (a.job.wage ?? 0);
      if (sortMode === "hours") return (a.job.hours ?? 999) - (b.job.hours ?? 999);
      return 0;
    });
  }, [jobs, search, sortMode, scoreMap]);

  const totalRankMap = useMemo(() => {
    const sorted = [...matches].sort((a, b) => b.score - a.score);
    return new Map(sorted.map((m, i) => [m.job.id, i + 1]));
  }, [matches]);

  const researchedCount = getResearchedCount();

  return (
    <div>
      {/* Header */}
      <div className="rounded-2xl border p-5 mb-5 relative overflow-hidden" style={{ background: "var(--card)", borderColor: "rgba(14,165,233,0.25)" }}>
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #0ea5e9, transparent)" }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Building2 size={15} style={{ color: "#0ea5e9" }} />
              <span className="text-sm font-semibold" style={{ color: "#0ea5e9" }}>Imported Opportunities</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-1">Imported Applications</h2>
            <p className="text-sm text-slate-400 max-w-xl">
              Paste job postings through Add Custom Job, then use AI matching to rank and tailor applications.
            </p>
            <div className="flex gap-3 mt-3 flex-wrap items-center">
              <div className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>
                {jobs.length} postings
              </div>
              <div className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                Internships · Early career · Projects
              </div>
              <div className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                Custom applications
              </div>
              {researchedCount > 0 && (
                <div className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.25)" }}>
                  <Globe size={10} className="inline mr-1" />
                  {researchedCount}/{jobs.length} researched
                </div>
              )}
            </div>
          </div>

          {/* Bulk Research button */}
          {apiKey && (
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <button
                onClick={handleBulkResearch}
                disabled={bulkResearching || !apiKey}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(14,165,233,0.15)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.3)" }}
              >
                {bulkResearching ? (
                  <><Loader2 size={12} className="animate-spin" /> {bulkDone}/{bulkTotal} done...</>
                ) : (
                  <><Globe size={12} /> Bulk Research All</>
                )}
              </button>
              {bulkError && <p className="text-xs text-slate-500">{bulkError}</p>}
              {bulkResearching && (
                <div className="w-full rounded-full overflow-hidden h-1" style={{ background: "var(--muted)", minWidth: 120 }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${bulkTotal > 0 ? Math.round((bulkDone / bulkTotal) * 100) : 0}%`, background: "#0ea5e9" }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2 border" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
          <Search size={14} className="text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, employer, location, tags..."
            className="bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600 flex-1"
          />
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="rounded-xl px-3 py-2 text-sm outline-none border"
          style={{ background: "var(--card)", color: "var(--muted-foreground)", borderColor: "var(--card-border)" }}
        >
          <option value="wage">Sort: Highest Wage</option>
          <option value="match">Sort: Best AI Match</option>
          <option value="hours">Sort: Fewest Hours</option>
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500 mb-3">
        <span className="font-semibold text-slate-300">{displayJobs.length}</span> {displayJobs.length === 1 ? "posting" : "postings"}
        {search && <span className="ml-1 text-slate-600">matching &ldquo;{search}&rdquo;</span>}
      </p>

      {/* Grid */}
      {displayJobs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Building2 size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No postings found</p>
          <p className="text-sm mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {displayJobs.map((match) => (
            <JobCard
              key={match.job.id}
              match={match}
              rank={totalRankMap.get(match.job.id) ?? 0}
              totalCount={matches.length || jobs.length}
              saved={savedJobs.has(match.job.id)}
              onSave={() => onSave(match.job.id)}
              onClick={() => onClick(match)}
              apiKey={apiKey}
              generationProfile={generationProfile}
              applied={appliedJobs.has(match.job.id)}
              onApply={() => onApply(match.job.id)}
              onGoToHistory={onGoToHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function isDeadlineSoon(deadline?: string): boolean {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 10);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return d >= today && d <= end;
}

function AppliedView({
  appliedJobMatches,
  rankMap,
  totalCount,
  apiKey,
  generationProfile,
  onUnapply,
  onClick,
  onGoToHistory,
  onExport,
}: {
  appliedJobMatches: JobMatch[];
  rankMap: Map<string, number>;
  totalCount: number;
  apiKey: string;
  generationProfile: { profileText: string; masterResumeLatex: string; coverLetterTemplateLatex?: string };
  onUnapply: (id: string) => void;
  onClick: (match: JobMatch) => void;
  onGoToHistory: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} style={{ color: "#10b981" }} />
          <h2 className="text-xl font-bold text-slate-100">Applied Jobs</h2>
          <span className="chip" style={{ color: "#10b981" }}>{appliedJobMatches.length}</span>
        </div>
        {appliedJobMatches.length > 0 && onExport && (
          <button
            onClick={onExport}
            className="btn-ghost flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold"
            title="Export as CSV"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>
      {appliedJobMatches.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
          <ClipboardCheck size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-slate-400 font-semibold">No applied jobs yet</p>
          <p className="text-slate-600 text-sm mt-1">Hit <span className="font-semibold text-emerald-400">Mark Applied</span> on any job card to track it here.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {appliedJobMatches.map((match) => (
            <JobCard
              key={match.job.id}
              match={match}
              rank={rankMap.get(match.job.id) ?? 0}
              totalCount={totalCount}
              saved={false}
              onSave={() => {}}
              onClick={() => onClick(match)}
              apiKey={apiKey}
              generationProfile={generationProfile}
              applied={true}
              onApply={() => onUnapply(match.job.id)}
              onGoToHistory={onGoToHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedView({
  savedJobMatches,
  rankMap,
  totalCount,
  appliedJobs,
  apiKey,
  generationProfile,
  onUnsave,
  onApply,
  onClick,
  onGoToHistory,
  onBulkGenerate,
  onExport,
}: {
  savedJobMatches: JobMatch[];
  rankMap: Map<string, number>;
  totalCount: number;
  appliedJobs: Set<string>;
  apiKey: string;
  generationProfile: { profileText: string; masterResumeLatex: string; coverLetterTemplateLatex?: string };
  onUnsave: (id: string) => void;
  onApply: (id: string) => void;
  onClick: (match: JobMatch) => void;
  onGoToHistory: () => void;
  onBulkGenerate?: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bookmark size={20} style={{ color: "#f59e0b" }} />
          <h2 className="text-xl font-bold text-slate-100">Saved Jobs</h2>
          <span className="chip" style={{ color: "#f59e0b" }}>{savedJobMatches.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {savedJobMatches.length > 0 && onExport && (
            <button
              onClick={onExport}
              className="btn-ghost flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold"
              title="Export as CSV"
            >
              <Download size={13} /> Export CSV
            </button>
          )}
          {onBulkGenerate && (
            <button
              onClick={onBulkGenerate}
              className="btn-warm flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold"
            >
              <Package size={13} /> Bulk Generate
            </button>
          )}
        </div>
      </div>

      {savedJobMatches.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
          <Bookmark size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-slate-400 font-semibold">No saved jobs yet</p>
          <p className="text-slate-600 text-sm mt-1">Hit the <span className="font-semibold text-amber-400">star</span> on any job card to save it here.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {savedJobMatches.map((match) => (
            <JobCard
              key={match.job.id}
              match={match}
              rank={rankMap.get(match.job.id) ?? 0}
              totalCount={totalCount}
              saved={true}
              onSave={() => onUnsave(match.job.id)}
              onClick={() => onClick(match)}
              apiKey={apiKey}
              generationProfile={generationProfile}
              applied={appliedJobs.has(match.job.id)}
              onApply={() => onApply(match.job.id)}
              onGoToHistory={onGoToHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const DATA_VERSION = "3";

function HeroStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="rounded-xl border p-3 text-center" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-[10px] uppercase font-semibold tracking-wider mt-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</p>
    </div>
  );
}

function NavPill({
  icon, label, count, active, onClick, activeColor,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all"
      style={
        active
          ? { background: activeColor, color: "white", boxShadow: `0 0 16px ${activeColor === "var(--accent)" ? "rgba(99,102,241,0.3)" : activeColor + "55"}` }
          : { background: "transparent", color: "var(--muted-foreground-strong)" }
      }
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
          style={{
            background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)",
            color: active ? "white" : activeColor,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function Home() {
  useState<void>(() => {
    if (typeof window !== "undefined") {
      const version = DATA_VERSION;
      if (localStorage.getItem("job-assistant-data-version") !== version) {
        ["job-assistant-saved", "job-assistant-applied", "job-assistant-matches", "job-assistant-history"].forEach((k) => localStorage.removeItem(k));
        localStorage.setItem("job-assistant-data-version", version);
      }
    }
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [userProfile, setUserProfile] = useState<LocalUserProfile>(EMPTY_USER_PROFILE);
  const [profileDraftKey, setProfileDraftKey] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const apiKey = userProfile.apiKey;
  const profileReady = Boolean(apiKey && userProfile.profileText && userProfile.masterResumeLatex);
  const generationProfile = useMemo(() => ({
    profileText: userProfile.profileText,
    masterResumeLatex: userProfile.masterResumeLatex,
    coverLetterTemplateLatex: userProfile.coverLetterTemplateLatex || GENERIC_COVER_LETTER_TEMPLATE_LATEX,
  }), [userProfile.coverLetterTemplateLatex, userProfile.masterResumeLatex, userProfile.profileText]);

  useEffect(() => {
    const stored = loadUserProfile();
    setUserProfile(stored);
    setProfileDraftKey(stored.apiKey);
  }, []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobBankJobs, setJobBankJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<JobMatch | null>(null);

  const [savedJobs, setSavedJobs] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const s = localStorage.getItem("job-assistant-saved");
      return s ? new Set(JSON.parse(s)) : new Set();
    }
    return new Set();
  });

  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const s = localStorage.getItem("job-assistant-applied");
      return s ? new Set(JSON.parse(s)) : new Set();
    }
    return new Set();
  });

  const [minScore, setMinScore] = useState<number>(0);

  type StoredMatch = { id: string; score: number; reasoning: string; highlights: string[]; concerns: string[] };

  useEffect(() => {
    Promise.all([
      fetch("/jobs.json").then((r) => r.json()).catch(() => SAMPLE_JOBS),
      fetch("/job-bank.json").then((r) => r.json()).catch(() => []),
    ]).then(([data, jbData]: [Job[], Job[]]) => {
      setJobs(data);
      setJobBankJobs(jbData);
      setJobsLoaded(true);
      const stored = localStorage.getItem("job-assistant-matches");
      if (stored) {
        const storedMatches: StoredMatch[] = JSON.parse(stored);
        const jobMap = new Map([...data, ...jbData].map((job) => [job.id, job] as const));
        const restored: JobMatch[] = storedMatches
          .map((m) => {
            const job = jobMap.get(m.id);
            return job
              ? { job, score: m.score, reasoning: m.reasoning, highlights: m.highlights, concerns: m.concerns }
              : null;
          })
          .filter((m): m is JobMatch => m !== null);
        if (restored.length > 0) {
          restored.sort((a, b) => b.score - a.score);
          setMatches(restored);
        }
      }
    });
  }, []);

  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 120);
    return () => clearTimeout(t);
  }, [search]);
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("jobs");
  const [showBulk, setShowBulk] = useState(false);
  const [showCustomJob, setShowCustomJob] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const allJobs = useMemo(() => [...jobs, ...jobBankJobs], [jobs, jobBankJobs]);
  const totalJobs = allJobs.length;

  useEffect(() => {
    setRecentIds(getRecentIds());
    return subscribeRecent(() => setRecentIds(getRecentIds()));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const storedSort = localStorage.getItem(SORT_STORAGE);
      const storedFilter = localStorage.getItem(FILTER_STORAGE);
      const storedMinScore = Number(localStorage.getItem(MIN_SCORE_STORAGE) || 0);
      if (isSortMode(storedSort)) setSortMode(storedSort);
      if (isFilterMode(storedFilter)) setFilterMode(storedFilter);
      if ([0, 60, 70, 80].includes(storedMinScore)) setMinScore(storedMinScore);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // One-time cleanup: strip stored hiring-manager overrides that aren't real
  // human names (leftover company-name / phone-number garbage from old data).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("job-assistant-hm-cleanup-v1")) return;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("job-assistant-jb-hm-")) continue;
      const val = localStorage.getItem(key);
      if (val === null || val === "") continue;
      if (!sanitizeHiringManager(val)) {
        localStorage.removeItem(key);
        i--;
      }
    }
    localStorage.setItem("job-assistant-hm-cleanup-v1", "1");
  }, []);

  useEffect(() => {
    const onOpenHistory = () => setViewMode("history");
    window.addEventListener("job-assistant-open-history", onOpenHistory);
    return () => window.removeEventListener("job-assistant-open-history", onOpenHistory);
  }, []);

  // Persist
  useEffect(() => { localStorage.setItem("job-assistant-saved", JSON.stringify([...savedJobs])); }, [savedJobs]);
  useEffect(() => { localStorage.setItem("job-assistant-applied", JSON.stringify([...appliedJobs])); }, [appliedJobs]);
  useEffect(() => { localStorage.setItem(SORT_STORAGE, sortMode); }, [sortMode]);
  useEffect(() => { localStorage.setItem(FILTER_STORAGE, filterMode); }, [filterMode]);
  useEffect(() => { localStorage.setItem(MIN_SCORE_STORAGE, String(minScore)); }, [minScore]);
  const persistMatches = useCallback((nextMatches: JobMatch[]) => {
    if (typeof window === "undefined") return;
    const toStore = nextMatches.map(({ job, score, reasoning, highlights, concerns }) => ({
      id: job.id, score, reasoning, highlights, concerns,
    }));
    localStorage.setItem("job-assistant-matches", JSON.stringify(toStore));
  }, []);

  useEffect(() => {
    if (!jobsLoaded) return;
    persistMatches(matches);
  }, [jobsLoaded, matches, persistMatches]);

  const saveApiKey = useCallback(() => {
    const next = { ...userProfile, apiKey: profileDraftKey.trim() };
    setUserProfile(next);
    saveUserProfile(next);
    setProfileError(null);
  }, [profileDraftKey, userProfile]);

  const handleResumeParsed = useCallback((parsed: ParsedResume, file: File, masterResumeLatex: string) => {
    const next: LocalUserProfile = {
      ...userProfile,
      parsedResume: parsed,
      profileText: buildProfileText(parsed),
      masterResumeLatex,
      coverLetterTemplateLatex: userProfile.coverLetterTemplateLatex || GENERIC_COVER_LETTER_TEMPLATE_LATEX,
      displayName: parsed.name || userProfile.displayName || "Candidate",
      resumeFileName: file.name,
    };
    setUserProfile(next);
    saveUserProfile(next);
    setProfileError(null);
  }, [userProfile]);

  const resetProfile = useCallback(() => {
    clearUserProfile();
    setUserProfile(EMPTY_USER_PROFILE);
    setProfileDraftKey("");
    setMatches([]);
    localStorage.removeItem("job-assistant-matches");
  }, []);

  const runMatching = useCallback(async (mode: "all" | "new" = "all") => {
    if (!profileReady) {
      setError("Add your Gemini API key and upload a resume before matching jobs.");
      return;
    }
    setLoading(true);
    setError(null);

    const existingScoreMap = new Map(matches.map((m) => [m.job.id, m]));

    const jobsToMatch =
      mode === "new"
        ? allJobs.filter((j) => !existingScoreMap.has(j.id))
        : allJobs;

    if (jobsToMatch.length === 0) {
      setError("No new jobs to match — all jobs already have scores.");
      setLoading(false);
      return;
    }

    setLoadingStatus(`Analyzing ${jobsToMatch.length} job${jobsToMatch.length !== 1 ? "s" : ""}…`);

    try {
      const { matchJobsWithGemini } = await import("@/lib/gemini");
      const results = await matchJobsWithGemini(jobsToMatch, userProfile.profileText, apiKey, (status) => setLoadingStatus(status));

      if (mode === "new") {
        // Merge: keep existing scores, overlay new ones
        const newMap = new Map(results.map((r) => [r.job.id, r]));
        const merged: JobMatch[] = allJobs.map((job) => {
          const fresh = newMap.get(job.id);
          if (fresh) return fresh;
          return existingScoreMap.get(job.id) ?? { job, score: 0, reasoning: "", highlights: [], concerns: [] };
        });
        merged.sort((a, b) => b.score - a.score);
        persistMatches(merged);
        setMatches(merged);
      } else {
        results.sort((a, b) => b.score - a.score);
        persistMatches(results);
        setMatches(results);
      }
    } catch (e: unknown) {
      setError(`AI matching failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  }, [apiKey, allJobs, matches, persistMatches, profileReady, userProfile.profileText]);

  const openJob = useCallback((m: JobMatch) => {
    setSelectedMatch(m);
    pushRecent(m.job.id);
  }, []);

  const doExport = useCallback((kind: "saved" | "applied" | "all") => {
    const base = matches.length > 0
      ? matches
      : allJobs.map((job) => ({ job, score: 0, reasoning: "", highlights: [], concerns: [] } as JobMatch));
    let rows: JobMatch[];
    if (kind === "saved") rows = base.filter((m) => savedJobs.has(m.job.id));
    else if (kind === "applied") rows = base.filter((m) => appliedJobs.has(m.job.id));
    else rows = base;
    if (rows.length === 0) return;
    const csv = jobMatchesToCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `job-applications-${kind}-${stamp}.csv`);
  }, [matches, allJobs, savedJobs, appliedJobs]);

  // Stable refs for values the global key handler needs, so we only register once.
  const kbdStateRef = useRef({ loading, jobsLen: totalJobs, runMatching, showPalette });
  useEffect(() => { kbdStateRef.current = { loading, jobsLen: totalJobs, runMatching, showPalette }; },
    [loading, totalJobs, runMatching, showPalette]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if (typing) return;

      if (e.key === "/") { e.preventDefault(); searchInputRef.current?.focus(); }
      else if (e.key === "?") { e.preventDefault(); setShowPalette(true); }
      else if (e.key === "1") setViewMode("jobs");
      else if (e.key === "2") setViewMode("saved");
      else if (e.key === "3") setViewMode("applied");
      else if (e.key === "4") setViewMode("jobbank");
      else if (e.key === "5") setViewMode("history");
      else if (e.key.toLowerCase() === "r") {
        const s = kbdStateRef.current;
        if (!s.loading && s.jobsLen > 0) s.runMatching("all");
      } else if (e.key === "Escape") {
        if (kbdStateRef.current.showPalette) setShowPalette(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSave = (jobId: string) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const addCustomJob = (newMatch: import("@/types").JobMatch) => {
    setJobs((prev) => [newMatch.job, ...prev.filter((j) => j.id !== newMatch.job.id)]);
    setMatches((prev) => [newMatch, ...prev.filter((m) => m.job.id !== newMatch.job.id)]);
    setShowCustomJob(false);
  };

  const toggleApply = (jobId: string) => {
    setAppliedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
        // auto-move: remove from saved when marked applied
        setSavedJobs((prevSaved) => {
          if (!prevSaved.has(jobId)) return prevSaved;
          const nextSaved = new Set(prevSaved);
          nextSaved.delete(jobId);
          return nextSaved;
        });
      }
      return next;
    });
  };

  const displayMatches: JobMatch[] = useMemo(() => {
    const base: JobMatch[] =
      matches.length > 0
        ? matches
        : allJobs.map((job) => ({ job, score: 0, reasoning: "", highlights: [], concerns: [] }));

    let filtered = base;
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.job.title.toLowerCase().includes(q) ||
          m.job.department.toLowerCase().includes(q) ||
          m.job.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filterMode === "saved") filtered = filtered.filter((m) => savedJobs.has(m.job.id));
    if (filterMode === "remote") filtered = filtered.filter((m) => m.job.isRemote);
    if (filterMode === "applied") filtered = filtered.filter((m) => appliedJobs.has(m.job.id));
    if (filterMode === "deadline") {
      filtered = filtered.filter((m) => isDeadlineSoon(m.job.deadline));
    }
    if (minScore > 0) filtered = filtered.filter((m) => m.score >= minScore);

    return [...filtered].sort((a, b) => {
      if (sortMode === "match") return b.score - a.score;
      if (sortMode === "wage") return (b.job.wage ?? 0) - (a.job.wage ?? 0);
      if (sortMode === "hours") return (a.job.hours ?? 999) - (b.job.hours ?? 999);
      return 0;
    });
  }, [matches, allJobs, searchDebounced, sortMode, filterMode, savedJobs, appliedJobs, minScore]);

  // Build rank map (global rank in sorted matches)
  const rankMap = useMemo(() => {
    const sorted = [...matches].sort((a, b) => b.score - a.score);
    return new Map(sorted.map((m, i) => [m.job.id, i + 1]));
  }, [matches]);

  const hasMatches = matches.length > 0;
  const topMatches = useMemo(
    () => (matches.length > 0 ? [...matches].sort((a, b) => b.score - a.score).slice(0, 3) : []),
    [matches]
  );

  const recentPanelJobs = useMemo(() => {
    const scoreMap = new Map<string, number>();
    matches.forEach((m) => scoreMap.set(m.job.id, m.score));
    return recentIds
      .map((id) => allJobs.find((j) => j.id === id))
      .filter((j): j is Job => !!j)
      .map((job) => ({ job, score: scoreMap.get(job.id) ?? 0 }));
  }, [recentIds, allJobs, matches]);

  const handleProfileRecentClick = useCallback((job: Job) => {
    const match = matches.find((m) => m.job.id === job.id) ?? { job, score: 0, reasoning: "", highlights: [], concerns: [] };
    setViewMode("jobs");
    openJob(match);
  }, [matches, openJob]);

  const navList: JobMatch[] = useMemo(() => {
    const asMatch = (job: Job) => matches.find((m) => m.job.id === job.id) ?? { job, score: 0, reasoning: "", highlights: [], concerns: [] };
    if (viewMode === "jobs") return displayMatches;
    if (viewMode === "saved") {
      return (matches.length > 0 ? matches.filter((m) => savedJobs.has(m.job.id)) : [...savedJobs].map((id) => allJobs.find((j) => j.id === id)).filter((j): j is Job => !!j).map(asMatch));
    }
    if (viewMode === "applied") {
      return (matches.length > 0 ? matches.filter((m) => appliedJobs.has(m.job.id)) : [...appliedJobs].map((id) => allJobs.find((j) => j.id === id)).filter((j): j is Job => !!j).map(asMatch));
    }
    if (viewMode === "jobbank") return jobBankJobs.map(asMatch);
    return [];
  }, [viewMode, displayMatches, matches, allJobs, jobBankJobs, savedJobs, appliedJobs]);

  const navIndex = selectedMatch ? navList.findIndex((m) => m.job.id === selectedMatch.job.id) : -1;
  const handleNavigate = useCallback((dir: "prev" | "next") => {
    if (navIndex < 0) return;
    const next = dir === "next" ? navIndex + 1 : navIndex - 1;
    if (next < 0 || next >= navList.length) return;
    openJob(navList[next]);
  }, [navIndex, navList, openJob]);
  // Count jobs that have no score yet across seeded, imported, and custom postings.
  const unmatchedCount = useMemo(() => {
    const matchedIds = new Set(matches.map((m) => m.job.id));
    return allJobs.filter((j) => !matchedIds.has(j.id)).length;
  }, [matches, allJobs]);

  // Filter badge counts
  const filterCounts = useMemo(() => {
    const base = matches.length > 0 ? matches : allJobs.map((job) => ({ job, score: 0, reasoning: "", highlights: [], concerns: [] }));
    return {
      all: base.length,
      saved: base.filter((m) => savedJobs.has(m.job.id)).length,
      remote: base.filter((m) => m.job.isRemote).length,
      applied: base.filter((m) => appliedJobs.has(m.job.id)).length,
      deadline: base.filter((m) => isDeadlineSoon(m.job.deadline)).length,
    };
  }, [matches, allJobs, savedJobs, appliedJobs]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b glass-strong" style={{ borderColor: "var(--card-border)" }}>
        <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => setViewMode("jobs")}
            className="flex items-center gap-3 shrink-0 transition-opacity hover:opacity-90"
          >
            <div className="logo-mark w-9 h-9 rounded-xl flex items-center justify-center font-black text-white">
              AI
            </div>
            <div className="text-left">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-slate-100 text-sm">Job</span>
                <span className="gradient-text text-sm font-bold tracking-tight">Assistant</span>
              </div>
              <p className="text-[10px] font-medium tracking-wide uppercase" style={{ color: "var(--muted-foreground)" }}>AI Job Matcher</p>
            </div>
          </button>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {/* AI Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => runMatching("all")}
                disabled={loading || totalJobs === 0 || !profileReady}
                className="btn-primary flex items-center gap-1.5 px-4 h-9 rounded-xl text-sm font-semibold"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
                  : <><Sparkles size={14} /> {hasMatches ? "Re-match" : "Match with AI"}</>}
              </button>

              {hasMatches && unmatchedCount > 0 && !loading && (
                <button
                  onClick={() => runMatching("new")}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold transition-all hover:-translate-y-0.5"
                  style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent-light)", border: "1px solid rgba(99,102,241,0.35)" }}
                  title={`Match ${unmatchedCount} new job${unmatchedCount === 1 ? "" : "s"}`}
                >
                  <Sparkles size={12} /> New
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(99,102,241,0.3)", color: "white" }}>
                    {unmatchedCount}
                  </span>
                </button>
              )}

              {savedJobs.size > 0 && hasMatches && profileReady && (
                <button
                  onClick={() => setShowBulk(true)}
                  className="btn-warm flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold"
                  title="Bulk generate for saved jobs"
                >
                  <Package size={14} /> Bulk <span className="text-[11px] opacity-80">· {savedJobs.size}</span>
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="h-6 w-px mx-1" style={{ background: "var(--card-border-strong)" }} />

            {/* View pills */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl border" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
              <NavPill
                icon={<Briefcase size={13} />}
                label="Jobs"
                active={viewMode === "jobs"}
                onClick={() => setViewMode("jobs")}
                activeColor="var(--accent)"
              />
              <NavPill
                icon={<Bookmark size={13} />}
                label="Saved"
                count={mounted ? savedJobs.size : 0}
                active={viewMode === "saved"}
                onClick={() => setViewMode(viewMode === "saved" ? "jobs" : "saved")}
                activeColor="#f59e0b"
              />
              <NavPill
                icon={<ClipboardCheck size={13} />}
                label="Applied"
                count={mounted ? appliedJobs.size : 0}
                active={viewMode === "applied"}
                onClick={() => setViewMode(viewMode === "applied" ? "jobs" : "applied")}
                activeColor="#10b981"
              />
              <NavPill
                icon={<Building2 size={13} />}
                label="Imported"
                count={mounted ? jobBankJobs.length : 0}
                active={viewMode === "jobbank"}
                onClick={() => setViewMode(viewMode === "jobbank" ? "jobs" : "jobbank")}
                activeColor="#0ea5e9"
              />
              <NavPill
                icon={<History size={13} />}
                label="History"
                active={viewMode === "history"}
                onClick={() => setViewMode(viewMode === "history" ? "jobs" : "history")}
                activeColor="var(--accent)"
              />
            </div>

            <button
              onClick={() => setShowCustomJob(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:-translate-y-0.5"
              style={{ background: "rgba(16,185,129,0.14)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}
              title="Add a custom job"
            >
              <Plus size={14} />
            </button>

            <button
              onClick={() => setShowPalette(true)}
              className="hidden md:flex items-center gap-1.5 h-9 px-2.5 rounded-xl transition-all hover:-translate-y-0.5"
              style={{ background: "var(--muted)", color: "var(--muted-foreground-strong)", border: "1px solid var(--card-border)" }}
              title="Command palette  (⌘K)"
            >
              <Command size={12} />
              <kbd className="text-[10px] font-mono" style={{ color: "var(--muted-foreground)" }}>K</kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 mb-4 text-sm border" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        <div className="flex gap-6 items-start">
          <ProfilePanel
            profile={userProfile}
            recentJobs={recentPanelJobs}
            onJobClick={handleProfileRecentClick}
          />

          <div className="flex-1 min-w-0">
            {!profileReady && (
              <div className="rounded-2xl border p-6 mb-6 relative overflow-hidden animate-fade-in-up" style={{ background: "linear-gradient(135deg, var(--card) 0%, var(--card-raised) 100%)", borderColor: "var(--card-border)" }}>
                <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 pointer-events-none blur-2xl" style={{ background: "radial-gradient(circle, var(--accent), transparent)" }} />
                <div className="relative">
                  <div className="chip mb-3" style={{ background: "rgba(99,102,241,0.12)", borderColor: "rgba(99,102,241,0.3)", color: "var(--accent-light)" }}>
                    <Sparkles size={10} /> First-time setup
                  </div>
                  <h1 className="text-2xl font-black text-slate-50 mb-2">Personalize this app for your resume</h1>
                  <p className="text-sm max-w-2xl mb-5 leading-relaxed" style={{ color: "var(--muted-foreground-strong)" }}>
                    Add your own Gemini API key, then upload your resume. Gemini will parse your background and create a Jake Gutierrez template-based LaTeX master resume for matching and generation.
                  </p>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl border p-4" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground-strong)" }}>
                        Gemini API key
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={profileDraftKey}
                          onChange={(e) => setProfileDraftKey(e.target.value)}
                          placeholder="Paste your Gemini API key"
                          className="flex-1 rounded-xl px-3 h-10 text-sm outline-none"
                          style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--card-border)" }}
                        />
                        <button
                          onClick={saveApiKey}
                          disabled={!profileDraftKey.trim()}
                          className="btn-primary px-4 rounded-xl text-sm font-bold disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                        Stored only in your browser. It is not committed to the project.
                      </p>
                    </div>

                    <div className="rounded-xl border p-4" style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}>
                      <ResumeUpload
                        apiKey={apiKey}
                        onParsed={handleResumeParsed}
                        isParsing={false}
                        parsedFile={userProfile.resumeFileName}
                        parseError={profileError}
                        onClear={resetProfile}
                      />
                    </div>
                  </div>

                  {profileError && (
                    <p className="mt-3 text-xs" style={{ color: "#f87171" }}>{profileError}</p>
                  )}
                </div>
              </div>
            )}

            {viewMode === "jobbank" ? (
              <JobBankView
                jobs={jobBankJobs}
                matches={matches}
                savedJobs={savedJobs}
                appliedJobs={appliedJobs}
                apiKey={apiKey}
                generationProfile={generationProfile}
                onSave={(id) => toggleSave(id)}
                onApply={(id) => toggleApply(id)}
                onClick={openJob}
                onGoToHistory={() => setViewMode("history")}
              />
            ) : viewMode === "history" ? (
              <HistoryView
                onJobClick={(job) => {
                  const match = matches.find((m) => m.job.id === job.id) ?? { job, score: 0, reasoning: "", highlights: [], concerns: [] };
                  setViewMode("jobs");
                  openJob(match);
                }}
              />
            ) : viewMode === "applied" ? (
              <AppliedView
                appliedJobMatches={matches.length > 0
                  ? matches.filter((m) => appliedJobs.has(m.job.id))
                  : allJobs.filter((j) => appliedJobs.has(j.id)).map((job) => ({ job, score: 0, reasoning: "", highlights: [], concerns: [] }))}
                rankMap={rankMap}
                totalCount={matches.length || totalJobs}
                apiKey={apiKey}
                generationProfile={generationProfile}
                onUnapply={(id) => toggleApply(id)}
                onClick={openJob}
                onGoToHistory={() => setViewMode("history")}
                onExport={() => doExport("applied")}
              />
            ) : viewMode === "saved" ? (
              <SavedView
                savedJobMatches={matches.length > 0
                  ? matches.filter((m) => savedJobs.has(m.job.id))
                  : allJobs.filter((j) => savedJobs.has(j.id)).map((job) => ({ job, score: 0, reasoning: "", highlights: [], concerns: [] }))}
                rankMap={rankMap}
                totalCount={matches.length || totalJobs}
                appliedJobs={appliedJobs}
                apiKey={apiKey}
                generationProfile={generationProfile}
                onUnsave={(id) => toggleSave(id)}
                onApply={(id) => toggleApply(id)}
                onClick={openJob}
                onGoToHistory={() => setViewMode("history")}
                onBulkGenerate={savedJobs.size > 0 && hasMatches && profileReady ? () => setShowBulk(true) : undefined}
                onExport={() => doExport("saved")}
              />
            ) : (
              <>
                {/* Onboarding */}
                {!hasMatches && !loading && (
                  <div className="rounded-2xl border p-8 mb-6 relative overflow-hidden animate-fade-in-up" style={{ background: "linear-gradient(135deg, var(--card) 0%, var(--card-raised) 100%)", borderColor: "var(--card-border)" }}>
                    <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-20 pointer-events-none blur-2xl" style={{ background: "radial-gradient(circle, var(--accent), transparent)" }} />
                    <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10 pointer-events-none blur-2xl" style={{ background: "radial-gradient(circle, var(--violet), transparent)" }} />

                    <div className="relative flex items-start justify-between gap-6 flex-wrap">
                      <div className="flex-1 min-w-[280px]">
                        <div className="chip mb-3" style={{ background: "rgba(99,102,241,0.12)", borderColor: "rgba(99,102,241,0.3)", color: "var(--accent-light)" }}>
                          <Zap size={10} /> {totalJobs} opportunities · ranked for your profile
                        </div>
                        <h1 className="text-3xl font-black text-slate-50 mb-3 leading-tight">
                          Find your <span className="gradient-text-ai">best</span> applications
                        </h1>
                        <p className="text-sm max-w-lg mb-5 leading-relaxed" style={{ color: "var(--muted-foreground-strong)" }}>
                          Add regular job postings, then hit <span className="font-semibold gradient-text">Match with AI</span> and Gemini will score every application against your uploaded resume, skills, and career goals.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setShowCustomJob(true)}
                            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                          >
                            <Plus size={15} /> Add Job
                            <ChevronRight size={14} />
                          </button>
                          <button
                            onClick={() => runMatching("all")}
                            disabled={loading || totalJobs === 0 || !profileReady}
                            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                          >
                            <Sparkles size={15} /> Match with AI
                          </button>
                        </div>
                      </div>

                      {/* Stats block */}
                      <div className="grid grid-cols-2 gap-3 min-w-[220px]">
                        <HeroStat value={jobs.length.toString()} label="Sample Jobs" color="var(--accent-light)" />
                        <HeroStat value={jobBankJobs.length.toString()} label="Imported" color="#38bdf8" />
                        <HeroStat value="AI" label="Gemini 3" color="#c084fc" />
                        <HeroStat value="Live" label="Resume" color="#10b981" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {loading && (
                  <div className="rounded-2xl border p-6 mb-6 relative overflow-hidden animate-fade-in-up" style={{ background: "var(--card)", borderColor: "rgba(99,102,241,0.3)" }}>
                    <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(600px 120px at 50% 0%, var(--accent-glow), transparent)" }} />
                    <div className="flex items-center gap-4 mb-4 relative">
                      <div className="relative w-12 h-12 shrink-0">
                        <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent) transparent transparent transparent" }} />
                        <div className="absolute inset-1 rounded-full animate-pulse-ring" />
                        <Sparkles size={18} className="absolute inset-0 m-auto" style={{ color: "var(--accent-light)" }} />
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-100">
                          {loadingStatus || "Gemini is analyzing your profile…"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          {totalJobs > 15 ? `Scoring ${totalJobs} opportunities in parallel batches` : "Scoring each opportunity"}
                        </p>
                      </div>
                    </div>
                    {loadingStatus && (() => {
                      const m = loadingStatus.match(/Batch (\d+)\/(\d+)/);
                      if (m) {
                        const pct = Math.round((+m[1] / +m[2]) * 100);
                        return (
                          <div className="rounded-full overflow-hidden h-2 relative" style={{ background: "var(--muted)" }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "var(--gradient-primary)", boxShadow: "0 0 12px var(--accent-glow)" }} />
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Top 3 matches */}
                {hasMatches && topMatches.length > 0 && (
                  <div className="rounded-2xl border p-5 mb-5 relative overflow-hidden animate-fade-in-up" style={{ background: "var(--card)", borderColor: "rgba(99,102,241,0.3)" }}>
                    <div className="absolute -top-10 right-10 w-40 h-40 rounded-full opacity-10 pointer-events-none blur-2xl" style={{ background: "radial-gradient(circle, var(--accent), transparent)" }} />
                    <div className="flex items-center justify-between mb-3 relative">
                      <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--accent-light)" }}>
                        <Sparkles size={13} /> Top matches for your profile
                      </p>
                      <span className="chip" style={{ background: "rgba(99,102,241,0.12)", borderColor: "rgba(99,102,241,0.3)", color: "var(--accent-light)" }}>
                        {matches.length} scored
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 relative">
                      {topMatches.map((m, i) => {
                        const medal = ["🥇", "🥈", "🥉"][i];
                        const colors = ["#10b981", "var(--accent-light)", "#f59e0b"];
                        return (
                          <button
                            key={m.job.id}
                            onClick={() => openJob(m)}
                            className="rounded-xl p-3 text-left transition-all border group hover:-translate-y-1 relative overflow-hidden"
                            style={{ background: "var(--muted)", borderColor: "var(--card-border)" }}
                          >
                            <div
                              className="absolute inset-x-0 top-0 h-0.5"
                              style={{ background: `linear-gradient(90deg, ${colors[i]}, transparent)` }}
                            />
                            <div className="flex items-start justify-between mb-1.5">
                              <div className="text-3xl font-black leading-none" style={{ color: colors[i] }}>
                                {m.score}
                              </div>
                              <span className="text-lg leading-none">{medal}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-100 leading-tight line-clamp-2 mb-0.5 group-hover:text-indigo-200 transition-colors">
                              {m.job.title}
                            </p>
                            <p className="text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>
                              {m.job.department}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search + Sort */}
                {!loading && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div
                      className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3.5 h-11 border focus-ring transition-all"
                      style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
                    >
                      <Search size={15} style={{ color: "var(--muted-foreground)" }} />
                      <input
                        ref={searchInputRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search title, division, tags…  ( / )"
                        className="bg-transparent outline-none text-sm flex-1"
                        style={{ color: "var(--foreground)" }}
                      />
                      {search && (
                        <button
                          onClick={() => setSearch("")}
                          className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as SortMode)}
                      className="rounded-xl px-3.5 h-11 text-sm outline-none border cursor-pointer transition-colors hover:border-indigo-500"
                      style={{ background: "var(--card)", color: "var(--muted-foreground-strong)", borderColor: "var(--card-border)" }}
                    >
                      <option value="match">Best Match</option>
                      <option value="wage">Highest Wage</option>
                      <option value="hours">Fewest Hours</option>
                    </select>
                  </div>
                )}

                {/* Filter pills */}
                {!loading && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(["all", "saved", "remote", "applied", "deadline"] as FilterMode[]).map((f) => {
                      const count = filterCounts[f];
                      const icons: Record<FilterMode, React.ReactNode> = {
                        all: null,
                        saved: <Star size={10} />,
                        remote: <Wifi size={10} />,
                        applied: <CheckCircle2 size={10} />,
                        deadline: <span style={{ fontSize: 10 }}>🔥</span>,
                      };
                      const labels: Record<FilterMode, string> = { all: "All", saved: "Saved", remote: "Remote", applied: "Applied", deadline: "Deadline Soon" };
                      const activeColors: Record<FilterMode, string> = {
                        all: "var(--accent)",
                        saved: "#f59e0b",
                        remote: "#10b981",
                        applied: "#10b981",
                        deadline: "#ef4444",
                      };
                      const active = filterMode === f;
                      return (
                        <button
                          key={f}
                          onClick={() => setFilterMode(f)}
                          className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition-all"
                          style={{
                            background: active ? activeColors[f] : "var(--muted)",
                            color: active ? "white" : "var(--muted-foreground-strong)",
                            border: `1px solid ${active ? activeColors[f] : "var(--card-border)"}`,
                            boxShadow: active ? `0 0 14px ${activeColors[f]}44` : "none",
                          }}
                        >
                          {icons[f]}
                          {labels[f]}
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}

                    {hasMatches && (
                      <div className="w-px mx-1 self-stretch" style={{ background: "var(--card-border)" }} />
                    )}

                    {hasMatches && ([60, 70, 80] as const).map((score) => (
                      <button
                        key={score}
                        onClick={() => setMinScore(minScore === score ? 0 : score)}
                        className="flex items-center gap-1 px-3 h-8 rounded-full text-xs font-semibold transition-all"
                        style={{
                          background: minScore === score ? "rgba(16,185,129,0.18)" : "var(--muted)",
                          color: minScore === score ? "#10b981" : "var(--muted-foreground-strong)",
                          border: `1px solid ${minScore === score ? "rgba(16,185,129,0.4)" : "var(--card-border)"}`,
                        }}
                      >
                        ≥ {score}
                      </button>
                    ))}
                  </div>
                )}

                {/* Stats bar */}
                {!loading && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="chip">
                      <span className="font-bold" style={{ color: "var(--foreground)" }}>{displayMatches.length}</span>
                      {displayMatches.length === 1 ? " job" : " jobs"}
                      {(filterMode !== "all" || minScore > 0) && (
                        <span className="opacity-60">
                          · {filterMode !== "all" ? filterMode : ""}{minScore > 0 ? ` ≥${minScore}` : ""}
                        </span>
                      )}
                    </span>
                    {hasMatches && (
                      <>
                        <span className="chip" style={{ color: "var(--accent-light)" }}>
                          Avg <span className="font-bold">{Math.round(matches.reduce((a, m) => a + m.score, 0) / matches.length)}</span>
                        </span>
                        <span className="chip" style={{ color: "#10b981" }}>
                          Best <span className="font-bold">{Math.max(...matches.map((m) => m.score))}</span>
                        </span>
                        <span className="chip" style={{ color: "#10b981" }}>
                          <span className="font-bold">{matches.filter((m) => m.score >= 70).length}</span> strong (≥70)
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Job Grid */}
                {!loading && displayMatches.length === 0 && (
                  <div className="text-center py-16 rounded-2xl border" style={{ background: "var(--card)", borderColor: "var(--card-border)" }}>
                    <Briefcase size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="font-semibold text-slate-300">No jobs match your filters</p>
                    <p className="text-sm mt-1 text-slate-500">Try adjusting your search or filter settings.</p>
                    <div className="flex items-center gap-2 justify-center mt-4">
                      {(search || filterMode !== "all" || minScore > 0) && (
                        <button
                          onClick={() => { setSearch(""); setFilterMode("all"); setMinScore(0); }}
                          className="btn-ghost px-3 h-8 rounded-lg text-xs font-semibold"
                        >
                          Reset filters
                        </button>
                      )}
                      <button
                        onClick={() => setShowCustomJob(true)}
                        className="btn-primary px-3 h-8 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Plus size={12} /> Add custom job
                      </button>
                    </div>
                  </div>
                )}

                {!loading && displayMatches.length > 0 && (
                  <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                    {displayMatches.map((match) => (
                      <JobCard
                        key={match.job.id}
                        match={match}
                        rank={rankMap.get(match.job.id) ?? 0}
                        totalCount={matches.length || totalJobs}
                        saved={savedJobs.has(match.job.id)}
                        onSave={() => toggleSave(match.job.id)}
                        onClick={() => openJob(match)}
                        apiKey={apiKey}
                        generationProfile={generationProfile}
                        applied={appliedJobs.has(match.job.id)}
                        onApply={() => toggleApply(match.job.id)}
                        onGoToHistory={() => setViewMode("history")}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {selectedMatch && (
        <JobDetailModal
          match={selectedMatch}
          saved={savedJobs.has(selectedMatch.job.id)}
          onSave={() => toggleSave(selectedMatch.job.id)}
          onClose={() => setSelectedMatch(null)}
          profileText={userProfile.profileText}
          apiKey={apiKey}
          generationProfile={generationProfile}
          applied={appliedJobs.has(selectedMatch.job.id)}
          onApply={() => toggleApply(selectedMatch.job.id)}
          onGoToHistory={() => { setSelectedMatch(null); setViewMode("history"); }}
          onNavigate={navList.length > 1 ? handleNavigate : undefined}
          hasPrev={navIndex > 0}
          hasNext={navIndex >= 0 && navIndex < navList.length - 1}
          position={navIndex >= 0 ? { current: navIndex + 1, total: navList.length } : undefined}
        />
      )}

      {showCustomJob && (
        <CustomJobModal
          apiKey={apiKey}
          profileText={userProfile.profileText}
          onAdd={addCustomJob}
          onClose={() => setShowCustomJob(false)}
        />
      )}

      {showBulk && (
        <BulkGenerateModal
          savedJobs={matches.filter((m) => savedJobs.has(m.job.id)).map((m) => m.job)}
          appliedJobs={appliedJobs}
          apiKey={apiKey}
          generationProfile={generationProfile}
          onClose={() => setShowBulk(false)}
        />
      )}

      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        matches={matches}
        jobBankJobs={jobBankJobs}
        savedJobs={savedJobs}
        appliedJobs={appliedJobs}
        recentIds={recentIds}
        apiKey={apiKey}
        hasMatches={hasMatches}
        unmatchedCount={unmatchedCount}
        onOpenJob={openJob}
        onSwitchView={(v) => setViewMode(v)}
        onRunMatch={(mode) => runMatching(mode)}
        onOpenBulk={() => setShowBulk(true)}
        onOpenCustomJob={() => setShowCustomJob(true)}
      />

      <GenerationHistory />
      <ToastContainer />
    </div>
  );
}
