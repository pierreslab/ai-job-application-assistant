"use client";

import { useRef, useCallback, useState } from "react";
import { ParsedResume } from "@/lib/gemini";
import { FileText, Upload, X, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface ResumeUploadProps {
  onParsed: (data: ParsedResume, file: File, masterResumeLatex: string) => void;
  apiKey: string;
  isParsing: boolean;
  parsedFile: string | null;
  parseError: string | null;
  onClear: () => void;
}

export function ResumeUpload({
  onParsed,
  apiKey,
  isParsing,
  parsedFile,
  parseError,
  onClear,
}: ResumeUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!apiKey) return;
      setLocalLoading(true);
      setLocalError(null);
      try {
        const { parseResumeWithGemini, generateMasterResumeLatexWithGemini } = await import("@/lib/gemini");
        const parsed = await parseResumeWithGemini(file, apiKey);
        const masterResumeLatex = await generateMasterResumeLatexWithGemini(file, parsed, apiKey);
        onParsed(parsed, file, masterResumeLatex);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLocalError(msg);
      } finally {
        setLocalLoading(false);
      }
    },
    [apiKey, onParsed]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // reset so same file can be re-uploaded
      e.target.value = "";
    },
    [processFile]
  );

  const isLoading = localLoading || isParsing;
  const displayError = localError || parseError;

  if (parsedFile && !isLoading) {
    return (
      <div
        className="rounded-xl border p-3 flex items-center gap-3"
        style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.25)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(16,185,129,0.15)" }}
        >
          <CheckCircle2 size={16} style={{ color: "#10b981" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: "#10b981" }}>Resume parsed</p>
          <p className="text-xs text-slate-400 truncate">{parsedFile}</p>
        </div>
        <button
          onClick={onClear}
          className="p-1 rounded-lg transition-colors hover:bg-slate-700 shrink-0"
          style={{ color: "var(--muted-foreground)" }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}
      >
        <Loader2 size={18} className="animate-spin shrink-0" style={{ color: "var(--accent-light)" }} />
        <div>
          <p className="text-xs font-semibold text-slate-200">Reading your resume...</p>
          <p className="text-xs text-slate-500">Gemini is extracting your qualifications and building a Jake-template resume</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={onFileChange}
      />
      <div
        onClick={() => { if (apiKey) { setLocalError(null); fileInputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (apiKey) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="rounded-xl border-2 border-dashed p-5 text-center transition-all select-none"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--card-border)",
          background: dragging ? "var(--accent-glow)" : "transparent",
          cursor: apiKey ? "pointer" : "not-allowed",
          opacity: apiKey ? 1 : 0.5,
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 transition-colors"
          style={{ background: dragging ? "var(--accent-glow)" : "var(--muted)" }}
        >
          {dragging ? (
            <Upload size={18} style={{ color: "var(--accent-light)" }} />
          ) : (
            <FileText size={18} style={{ color: "var(--muted-foreground)" }} />
          )}
        </div>
        <p className="text-xs font-semibold text-slate-300 mb-0.5">
          {dragging ? "Drop to upload" : "Upload your resume"}
        </p>
        <p className="text-xs text-slate-500">
          {apiKey ? "PDF or DOCX · Gemini will read it" : "Add your API key first"}
        </p>
      </div>

      {displayError && (
        <div
          className="mt-2 flex items-start gap-1.5 text-xs rounded-lg p-2 border"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="break-all">{displayError}</span>
        </div>
      )}
    </div>
  );
}
