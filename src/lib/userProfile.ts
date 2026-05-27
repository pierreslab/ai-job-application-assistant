import { ParsedResume } from "@/lib/gemini";
import { GENERIC_COVER_LETTER_TEMPLATE_LATEX } from "@/lib/masterResume";

export interface LocalUserProfile {
  apiKey: string;
  parsedResume: ParsedResume | null;
  profileText: string;
  masterResumeLatex: string;
  coverLetterTemplateLatex: string;
  displayName: string;
  resumeFileName: string | null;
}

export const USER_PROFILE_STORAGE_KEY = "job-assistant-user-profile";

export const EMPTY_USER_PROFILE: LocalUserProfile = {
  apiKey: "",
  parsedResume: null,
  profileText: "",
  masterResumeLatex: "",
  coverLetterTemplateLatex: GENERIC_COVER_LETTER_TEMPLATE_LATEX,
  displayName: "",
  resumeFileName: null,
};

export function buildProfileText(parsed: ParsedResume): string {
  return [
    `Candidate: ${parsed.name || "Unnamed candidate"}`,
    parsed.program ? `Program / background: ${parsed.program}` : "",
    parsed.year ? `Level: ${parsed.year}` : "",
    parsed.skills.length ? `Skills: ${parsed.skills.join(", ")}` : "",
    parsed.interests.length ? `Interests: ${parsed.interests.join(", ")}` : "",
    parsed.notes ? `Notes: ${parsed.notes}` : "",
    parsed.rawSummary ? `Resume summary: ${parsed.rawSummary}` : "",
  ].filter(Boolean).join("\n");
}

export function safeFilePrefix(name: string | undefined): string {
  const cleaned = (name || "Candidate")
    .replace(/[^a-z0-9\s_-]/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("_");
  return cleaned || "Candidate";
}

export function loadUserProfile(): LocalUserProfile {
  if (typeof window === "undefined") return EMPTY_USER_PROFILE;
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_USER_PROFILE;
    return { ...EMPTY_USER_PROFILE, ...JSON.parse(raw) } as LocalUserProfile;
  } catch {
    return EMPTY_USER_PROFILE;
  }
}

export function saveUserProfile(profile: LocalUserProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearUserProfile() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
}
