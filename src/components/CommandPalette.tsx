"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Job, JobMatch } from "@/types";
import { scoreColor } from "@/lib/utils";
import {
  Search, Sparkles, Briefcase, Bookmark, ClipboardCheck, History, Building2,
  Plus, Package, Wand2, Mail, CornerDownLeft, ArrowUp, ArrowDown,
} from "lucide-react";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  group: "view" | "action" | "job";
  keywords?: string;
  shortcut?: string;
  color?: string;
  onRun: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  matches: JobMatch[];
  jobBankJobs: Job[];
  savedJobs: Set<string>;
  appliedJobs: Set<string>;
  recentIds: string[];
  apiKey: string;
  hasMatches: boolean;
  unmatchedCount: number;
  onOpenJob: (match: JobMatch) => void;
  onSwitchView: (view: "jobs" | "saved" | "applied" | "jobbank" | "history") => void;
  onRunMatch: (mode: "all" | "new") => void;
  onOpenBulk: () => void;
  onOpenCustomJob: () => void;
}

export function CommandPalette({
  open, onClose,
  matches, jobBankJobs, savedJobs, appliedJobs, recentIds,
  apiKey, hasMatches, unmatchedCount,
  onOpenJob, onSwitchView, onRunMatch, onOpenBulk, onOpenCustomJob,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setQuery("");
        setActiveIdx(0);
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const actions: CommandAction[] = useMemo(() => {
    const a: CommandAction[] = [];

    // View switching
    a.push(
      { id: "view-jobs", group: "view", label: "Go to Jobs", icon: <Briefcase size={14} />, keywords: "jobs home all", shortcut: "1", color: "var(--accent-light)", onRun: () => onSwitchView("jobs") },
      { id: "view-saved", group: "view", label: "Go to Saved", description: `${savedJobs.size} jobs`, icon: <Bookmark size={14} />, keywords: "saved starred", shortcut: "2", color: "#f59e0b", onRun: () => onSwitchView("saved") },
      { id: "view-applied", group: "view", label: "Go to Applied", description: `${appliedJobs.size} jobs`, icon: <ClipboardCheck size={14} />, keywords: "applied done", shortcut: "3", color: "#10b981", onRun: () => onSwitchView("applied") },
      { id: "view-jobbank", group: "view", label: "Go to Imported", description: `${jobBankJobs.length} imported postings`, icon: <Building2 size={14} />, keywords: "imported job applications postings", shortcut: "4", color: "#38bdf8", onRun: () => onSwitchView("jobbank") },
      { id: "view-history", group: "view", label: "Go to History", icon: <History size={14} />, keywords: "history generations", shortcut: "5", color: "var(--accent-light)", onRun: () => onSwitchView("history") },
    );

    // Actions
    if (jobsAvailable(matches.length, jobBankJobs.length)) {
      a.push({
        id: "action-match-all",
        group: "action",
        label: hasMatches ? "Re-match all jobs with AI" : "Match all jobs with AI",
        description: "Score every job against your profile",
        icon: <Sparkles size={14} />,
        keywords: "match ai score rematch rank",
        shortcut: "R",
        color: "var(--accent-light)",
        onRun: () => onRunMatch("all"),
      });
    }
    if (hasMatches && unmatchedCount > 0) {
      a.push({
        id: "action-match-new",
        group: "action",
        label: `Match new jobs (${unmatchedCount})`,
        description: "Score only unmatched jobs",
        icon: <Sparkles size={14} />,
        keywords: "match new incremental",
        color: "var(--accent-light)",
        onRun: () => onRunMatch("new"),
      });
    }
    if (savedJobs.size > 0 && apiKey && hasMatches) {
      a.push({
        id: "action-bulk",
        group: "action",
        label: "Bulk generate for saved jobs",
        description: `${savedJobs.size} saved`,
        icon: <Package size={14} />,
        keywords: "bulk generate batch",
        color: "#c084fc",
        onRun: onOpenBulk,
      });
    }
    a.push({
      id: "action-custom",
      group: "action",
      label: "Add a CS job application",
      description: "Paste a regular job posting",
      icon: <Plus size={14} />,
      keywords: "add custom new job url",
      color: "#10b981",
      onRun: onOpenCustomJob,
    });

    // Jobs — recently viewed first, then all matches
    const jobMap = new Map<string, JobMatch>();
    for (const m of matches) jobMap.set(m.job.id, m);
    for (const j of jobBankJobs) if (!jobMap.has(j.id)) jobMap.set(j.id, { job: j, score: 0, reasoning: "", highlights: [], concerns: [] });

    const orderedJobs: JobMatch[] = [];
    for (const id of recentIds) {
      const m = jobMap.get(id);
      if (m) { orderedJobs.push(m); jobMap.delete(id); }
    }
    for (const m of jobMap.values()) orderedJobs.push(m);

    for (const m of orderedJobs) {
      a.push({
        id: `job-${m.job.id}`,
        group: "job",
        label: m.job.title,
        description: m.job.department,
        icon: m.score > 0 ? (
          <span className="text-[11px] font-black w-7 text-right" style={{ color: scoreColor(m.score) }}>{m.score}</span>
        ) : m.job.source === "job-bank" ? (
          <Building2 size={14} />
        ) : (
          <Briefcase size={14} />
        ),
        keywords: `${m.job.title} ${m.job.department} ${m.job.location} ${m.job.tags.join(" ")} ${m.job.id}`,
        color: m.score > 0 ? scoreColor(m.score) : m.job.source === "job-bank" ? "#38bdf8" : "var(--muted-foreground-strong)",
        onRun: () => onOpenJob(m),
      });
    }

    return a;
  }, [matches, jobBankJobs, savedJobs, appliedJobs, recentIds, hasMatches, unmatchedCount, apiKey, onSwitchView, onRunMatch, onOpenBulk, onOpenCustomJob, onOpenJob]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: show top actions + recently viewed jobs
      const views = actions.filter((a) => a.group === "view");
      const acts = actions.filter((a) => a.group === "action");
      const jobs = actions.filter((a) => a.group === "job").slice(0, 8);
      return [...views, ...acts, ...jobs];
    }
    return actions
      .filter((a) => {
        const haystack = `${a.label} ${a.description ?? ""} ${a.keywords ?? ""}`.toLowerCase();
        return q.split(/\s+/).every((part) => haystack.includes(part));
      })
      .slice(0, 40);
  }, [actions, query]);

  const safeActiveIdx = filtered.length === 0 ? 0 : Math.min(activeIdx, filtered.length - 1);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActiveIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeActiveIdx]);

  const run = (a: CommandAction) => { a.onRun(); onClose(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const a = filtered[safeActiveIdx]; if (a) run(a); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-4 animate-fade-in-up"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-xl rounded-2xl border overflow-hidden flex flex-col"
        style={{ background: "var(--card)", borderColor: "var(--card-border-strong)", boxShadow: "var(--shadow-lg)", maxHeight: "70vh" }}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0" style={{ borderColor: "var(--card-border)" }}>
          <Search size={16} style={{ color: "var(--muted-foreground)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKey}
            placeholder="Search jobs, views, or actions…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-100 placeholder-slate-600"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--card-border)" }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1 py-1">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map((a, i) => {
            const showHeader = a.group !== lastGroup;
            lastGroup = a.group;
            const isActive = i === safeActiveIdx;
            return (
              <div key={a.id}>
                {showHeader && (
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    {a.group === "view" ? "Views" : a.group === "action" ? "Actions" : "Jobs"}
                  </div>
                )}
                <button
                  data-idx={i}
                  onClick={() => run(a)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className="w-full flex items-center gap-3 px-3 py-2 transition-colors text-left"
                  style={{
                    background: isActive ? "rgba(99,102,241,0.14)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${a.color}15`, color: a.color ?? "var(--muted-foreground-strong)" }}
                  >
                    {a.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-100 truncate">{a.label}</p>
                    {a.description && (
                      <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{a.description}</p>
                    )}
                  </div>
                  {a.shortcut && (
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground-strong)", border: "1px solid var(--card-border)" }}>
                      {a.shortcut}
                    </kbd>
                  )}
                  {isActive && (
                    <CornerDownLeft size={12} className="shrink-0" style={{ color: "var(--accent-light)" }} />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 h-9 border-t text-[10px] shrink-0" style={{ borderColor: "var(--card-border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><ArrowUp size={9} /><ArrowDown size={9} /> Navigate</span>
            <span className="flex items-center gap-1"><CornerDownLeft size={9} /> Select</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={9} style={{ color: "var(--accent-light)" }} />
            <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            <Wand2 size={9} />
            <Mail size={9} />
          </div>
        </div>
      </div>
    </div>
  );
}

function jobsAvailable(matchCount: number, bankCount: number) {
  return matchCount + bankCount > 0;
}
