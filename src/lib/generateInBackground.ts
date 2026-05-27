import { Job } from "@/types";
import { tailorResumeWithGemini, generateCoverLetterWithGemini, generateApplicationEmailWithGemini } from "./gemini";
import { GENERIC_COVER_LETTER_TEMPLATE_LATEX } from "./masterResume";
import { addTask, updateTask } from "./generationStore";
import { enrichJobFromStorage } from "./utils";

export interface GenerationProfile {
  profileText: string;
  masterResumeLatex: string;
  coverLetterTemplateLatex?: string;
}

export function dispatchResume(job: Job, apiKey: string, profile: GenerationProfile, extraInfo = "") {
  const enriched = enrichJobFromStorage(job);
  const id = addTask(enriched, "resume");
  tailorResumeWithGemini(enriched, profile.masterResumeLatex, apiKey, extraInfo)
    .then((result) => {
      updateTask(id, { status: "done", latex: result.latex, changes: result.changes, finishedAt: Date.now() });
    })
    .catch((e) => {
      updateTask(id, { status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    });
}

export function dispatchCoverLetter(job: Job, apiKey: string, profile: GenerationProfile, extraInfo = "") {
  const enriched = enrichJobFromStorage(job);
  const id = addTask(enriched, "coverLetter");
  generateCoverLetterWithGemini(
    enriched,
    profile.coverLetterTemplateLatex || GENERIC_COVER_LETTER_TEMPLATE_LATEX,
    profile.masterResumeLatex,
    extraInfo,
    apiKey
  )
    .then((latex) => {
      updateTask(id, { status: "done", latex, finishedAt: Date.now() });
    })
    .catch((e) => {
      updateTask(id, { status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    });
}

export function dispatchEmail(job: Job, apiKey: string, profile: GenerationProfile, extraInfo = "") {
  const enriched = enrichJobFromStorage(job);
  const id = addTask(enriched, "email");
  generateApplicationEmailWithGemini(enriched, profile.profileText, extraInfo, apiKey)
    .then((result) => {
      updateTask(id, { status: "done", text: JSON.stringify(result), finishedAt: Date.now() });
    })
    .catch((e) => {
      updateTask(id, { status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    });
}

export function dispatchBoth(job: Job, apiKey: string, profile: GenerationProfile, extraInfo = "") {
  dispatchResume(job, apiKey, profile, extraInfo);
  dispatchCoverLetter(job, apiKey, profile, extraInfo);
  dispatchEmail(job, apiKey, profile, extraInfo);
}
