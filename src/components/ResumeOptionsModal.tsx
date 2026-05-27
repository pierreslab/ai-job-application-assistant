"use client";

import { useState } from "react";
import { Job } from "@/types";
import { dispatchResume, GenerationProfile } from "@/lib/generateInBackground";
import { X, Wand2, Sparkles } from "lucide-react";

interface ResumeOptionsModalProps {
  job: Job;
  apiKey: string;
  generationProfile: GenerationProfile;
  onClose: () => void;
}

export function ResumeOptionsModal({ job, apiKey, generationProfile, onClose }: ResumeOptionsModalProps) {
  const [extraInfo, setExtraInfo] = useState("");

  const handleGenerate = () => {
    dispatchResume(job, apiKey, generationProfile, extraInfo);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
      >
        <div className="h-0.5" style={{ background: "linear-gradient(90deg, #a855f7, #6366f1)" }} />

        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wand2 size={14} style={{ color: "#c084fc" }} />
                <span className="text-xs font-semibold" style={{ color: "#c084fc" }}>Tailor Resume</span>
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

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Extra context for Gemini{" "}
              <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={extraInfo}
              onChange={(e) => setExtraInfo(e.target.value)}
              placeholder={`e.g. "Emphasize my Python experience" or "Highlight my tutoring project for this role" or "Focus on leadership"`}
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none resize-none leading-relaxed"
              style={{ background: "var(--muted)", border: "1px solid var(--card-border)" }}
              autoFocus
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Generation runs in the background — check History when done.
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
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "white" }}
            >
              <Sparkles size={14} /> Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
