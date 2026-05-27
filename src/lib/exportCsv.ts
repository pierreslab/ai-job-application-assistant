import { JobMatch } from "@/types";

function esc(s: unknown): string {
  const str = s == null ? "" : String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function jobMatchesToCsv(matches: JobMatch[]): string {
  const headers = [
    "id", "title", "department", "location", "hours", "wage",
    "isRemote", "deadline", "contactEmail", "source", "hiringManager",
    "score", "rank", "tags", "jobUrl", "reasoning",
  ];
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const rows = sorted.map((m, i) => [
    m.job.id,
    m.job.title,
    m.job.department,
    m.job.location,
    m.job.hours ?? "",
    m.job.wage ?? "",
    m.job.isRemote ? "yes" : "no",
    m.job.deadline ?? "",
    m.job.contactEmail ?? "",
    m.job.source ?? "manual",
    m.job.hiringManager ?? "",
    m.score,
    m.score > 0 ? i + 1 : "",
    m.job.tags.join("; "),
    m.job.jobUrl ?? "",
    m.reasoning.replace(/\s+/g, " ").trim(),
  ].map(esc).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
