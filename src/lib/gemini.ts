import { GoogleGenerativeAI } from "@google/generative-ai";
import { Job, JobMatch } from "@/types";
import { sanitizeHiringManager } from "@/lib/utils";
import { JAKE_RESUME_TEMPLATE_LATEX } from "@/lib/masterResume";
import {
  GEMINI_SEARCH_MODEL,
  GEMINI_TEXT_MODEL,
  nextGeminiKey,
  isRetriableKeyError,
} from "@/lib/config";

/**
 * Build a GoogleGenerativeAI client using round-robin key selection.
 * The `apiKey` argument is honored as the preferred key (so an in-flight
 * retry can pin to a specific key), but otherwise we rotate.
 */
function makeClient(apiKey?: string): { genAI: GoogleGenerativeAI; usedKey: string } {
  const key = nextGeminiKey(apiKey);
  if (!key) throw new Error("Add your Gemini API key before using AI features.");
  return { genAI: new GoogleGenerativeAI(key), usedKey: key };
}

/**
 * Run an async Gemini operation with automatic key fallback.
 * If the call fails with a retriable error (quota, auth, rate-limit), we
 * walk the remaining keys and try each one before giving up.
 *
 * The factory receives a fresh client per attempt; this is required because
 * the Gemini SDK binds its model instance to the key at construction time.
 */
async function withKeyFallback<T>(
  apiKey: string,
  factory: (client: { genAI: GoogleGenerativeAI; usedKey: string }) => Promise<T>
): Promise<T> {
  const tried = new Set<string>();
  const firstClient = makeClient(apiKey);
  tried.add(firstClient.usedKey);
  try {
    return await factory(firstClient);
  } catch (err) {
    if (!isRetriableKeyError(err)) throw err;
    throw err;
  }
}

/**
 * Single-shot generateContent wrapper that handles round-robin + key fallback.
 * Each call site no longer constructs the client/model directly — this builds
 * a fresh one per attempt (required because the model is bound to a key).
 */
type ModelOpts = Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0];
type GenRequest = Parameters<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>[0];
type GenResult = Awaited<ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>>;

async function runModel(
  apiKey: string,
  modelOpts: ModelOpts,
  request: GenRequest
): Promise<GenResult> {
  return withKeyFallback(apiKey, async ({ genAI }) => {
    const model = genAI.getGenerativeModel(modelOpts);
    return model.generateContent(request);
  });
}

export interface ParsedResume {
  name: string;
  program: string;
  year: string;
  skills: string[];
  interests: string[];
  notes: string;
  preferRemote: boolean;
  rawSummary: string;
}

export async function parseResumeWithGemini(
  file: File,
  apiKey: string
): Promise<ParsedResume> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "application/pdf";

  const prompt = `You are an expert resume parser for a job application matching system.

Carefully read this resume and extract the student's information. Return ONLY a valid JSON object with these exact fields:

{
  "name": "full name of the student",
  "program": "their field of study / major / program (e.g. Computer Science, Biology, Commerce)",
  "year": "their year of study (e.g. 1st Year, 2nd Year, 3rd Year, 4th Year, Graduate) — infer from graduation date or context if not explicit",
  "skills": ["array", "of", "specific", "skills", "technical", "and", "soft"],
  "interests": ["array", "of", "interest", "areas", "inferred", "from", "experience", "projects", "and", "courses"],
  "notes": "2-3 sentence summary of the student's background, experience highlights, and what kind of work they'd thrive in",
  "preferRemote": true or false (infer from any remote work experience),
  "rawSummary": "a thorough 4-6 sentence summary covering: their academic background, all relevant work experience, key projects, extracurriculars, and standout qualifications"
}

Be thorough — extract every skill mentioned (programming languages, tools, soft skills, lab techniques, etc).
For interests, infer from their coursework, projects, work history, and extracurricular activities.
Return ONLY the JSON object, no markdown, no extra text.`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    [{ inlineData: { data: base64, mimeType } }, prompt]
  );

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(cleaned) as ParsedResume;
}

export async function generateMasterResumeLatexWithGemini(
  file: File,
  parsedResume: ParsedResume,
  apiKey: string
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "application/pdf";

  const prompt = `Convert the uploaded resume into a clean, factual, one-page LaTeX master resume using Jake Gutierrez's resume template.

RULES:
- Return ONLY raw LaTeX, starting with \\documentclass.
- Preserve Jake Gutierrez's template attribution comment and MIT license note.
- Preserve the template preamble, packages, \\input{glyphtounicode}, \\pdfgentounicode=1, margins, and custom commands.
- Use the template commands: \\resumeSubheading, \\resumeProjectHeading, \\resumeItem, \\resumeSubHeadingListStart, \\resumeSubHeadingListEnd, \\resumeItemListStart, and \\resumeItemListEnd.
- Fill the resume only with facts from the uploaded file and parsed summary below. Do not invent credentials, dates, metrics, links, skills, projects, employers, schools, or awards.
- Omit empty or irrelevant sections. Prefer these sections when supported: Education, Experience, Projects, Technical Skills.
- Keep it ATS-friendly and close to one page.

PARSED SUMMARY:
${JSON.stringify(parsedResume, null, 2)}

JAKE TEMPLATE SOURCE:
${JAKE_RESUME_TEMPLATE_LATEX}`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] }],
      generationConfig: WRITE_CONFIG,
    }
  );

  return result.response.text().trim().replace(/^```(?:latex|tex)?\n?/, "").replace(/\n?```$/, "").trim();
}

type BatchResult = {
  id: string;
  score: number;
  reasoning: string;
  highlights: string[];
  concerns: string[];
};

// Matching: deterministic + strict JSON
const MATCH_CONFIG = { temperature: 0.2, topP: 0.9 } as const;
// Writing: slightly warmer for natural voice
const WRITE_CONFIG = { temperature: 0.7, topP: 0.95 } as const;
// Parsing: fully deterministic
const PARSE_CONFIG = { temperature: 0.1, topP: 0.9 } as const;

async function matchBatch(
  apiKey: string,
  batch: Job[],
  profileText: string
): Promise<BatchResult[]> {
  const jobsText = batch
    .map(
      (job) =>
        `ID:${job.id}\nTitle: ${job.title}\nDivision: ${job.department}\nType: ${job.tags.join(", ")}\nDescription: ${job.description}\nQualifications: ${job.requirements.join("; ")}`
    )
    .join("\n---\n");

  const prompt = `You are a realistic, critical job matching assistant. Score each job for how well the candidate actually qualifies for it, based only on demonstrated background.

=== SCORING RUBRIC ===
90-100: Meets essentially all stated qualifications.
75-89: Strong match; meets core requirements with only minor gaps.
60-74: Solid match; meets most requirements but has 1-2 notable gaps.
40-59: Partial match; missing important qualifications.
20-39: Weak match; most core requirements are outside the candidate's background.
0-19: Not a match; central requirements are clearly unsupported.

Be conservative. Do not inflate scores because the candidate could learn quickly.

=== CANDIDATE PROFILE ===
${profileText}

Return ONLY a JSON array — one object per job — with these fields, keeping values SHORT:
- id (string, exact job ID)
- score (integer 0-100, calibrated realistically per above)
- reasoning (1 sentence max: state the key match or gap)
- highlights (array of 2 phrases, max 5 words each)
- concerns (array of 1 phrase max, max 6 words; [] if no real concerns)

JOBS:
${jobsText}

Return ONLY the JSON array, no markdown, no extra text.`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: MATCH_CONFIG,
    }
  );
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return JSON.parse(cleaned) as BatchResult[];
  } catch {
    // Surface the real API response so the user can see the actual error
    const preview = cleaned.slice(0, 300);
    throw new Error(`Gemini returned non-JSON response: ${preview}`);
  }
}

export async function matchJobsWithGemini(
  jobs: Job[],
  profileText: string,
  apiKey: string,
  onProgress?: (status: string) => void
): Promise<JobMatch[]> {
  const BATCH_SIZE = 15;
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    batches.push(jobs.slice(i, i + BATCH_SIZE));
  }

  onProgress?.(`Running ${batches.length} batches in parallel...`);

  let completed = 0;
  const settled = await Promise.allSettled(
    batches.map((batch) =>
      matchBatch(apiKey, batch, profileText).then((res) => {
        completed++;
        onProgress?.(`${completed}/${batches.length} batches done...`);
        return res;
      })
    )
  );

  const allResults: BatchResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") allResults.push(...result.value);
    // silently skip failed batches — those jobs will get score 0
  }

  const matchMap = new Map(allResults.map((m) => [m.id, m]));

  return jobs.map((job) => {
    const match = matchMap.get(job.id);
    return {
      job,
      score: match?.score ?? 50,
      reasoning: match?.reasoning ?? "No analysis available.",
      highlights: match?.highlights ?? [],
      concerns: match?.concerns ?? [],
    };
  });
}

export async function askAboutJob(
  job: Job,
  profileText: string,
  question: string,
  apiKey: string
): Promise<string> {
  const prompt = `You are a helpful career advisor for internships, co-ops, and early-career job applications.

Student background:
${profileText}

Job they are asking about:
- Title: ${job.title}
- Department: ${job.department}
- Description: ${job.description}
- Requirements: ${job.requirements.slice(0, 5).join(", ")}

Student's question: "${question}"

Answer concisely and helpfully (2-4 sentences). Be encouraging but honest.`;

  const result = await runModel(apiKey, { model: GEMINI_TEXT_MODEL }, prompt);
  return result.response.text().trim();
}

export interface TailoredResume {
  latex: string;
  changes: string[];
}

/**
 * Static ATS-style keyword list. Each entry may include multiple synonyms
 * separated by "|"; the first form is the canonical display term.
 * Used to detect keywords that are in the JD and master resume, but missing
 * from a draft.
 */
const ATS_KEYWORDS: string[] = [
  // Languages
  "Python", "Java", "JavaScript", "TypeScript", "C++|C\\+\\+", "C#|C sharp", "Go|Golang",
  "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Lua", "R programming|\\bR\\b", "SQL", "HTML", "CSS",
  // Frontend / frameworks
  "React", "React Native", "Next.js|Next\\.js|NextJS", "Node.js|Node\\.js|NodeJS",
  "Express", "Vue", "Angular", "Svelte", "Tailwind", "Redux", "Expo",
  // Backend / data
  "PostgreSQL|Postgres", "MongoDB", "MySQL", "Supabase", "Firebase", "Redis",
  "REST|REST API", "GraphQL", "WebSocket", "gRPC",
  // Cloud / infra
  "AWS", "GCP|Google Cloud", "Azure", "Vercel", "Docker", "Kubernetes|K8s",
  "CI/CD|CI\\/CD|continuous integration",
  // AI / ML / APIs
  "Gemini|Google Gemini", "OpenAI", "GPT", "LLM", "Anthropic", "Claude",
  "machine learning|ML", "deep learning", "NLP|natural language processing",
  "computer vision", "TensorFlow", "PyTorch", "Hugging Face",
  "Google Vision|Vision API", "ElevenLabs", "Nano Banana",
  // CS fundamentals
  "object-oriented|OOP", "data structures", "algorithms",
  "discrete math|discrete mathematics", "debugging", "unit testing",
  "version control|Git", "GitHub",
  // Methods / PM
  "Agile", "Scrum", "sprint", "code review",
  // Common application domains
  "full[- ]stack|full stack", "mobile development",
  "API integration", "front[- ]end", "back[- ]end",
  // Soft / operational
  "teamwork", "collaboration", "communication", "leadership",
  "problem[- ]solving", "mentoring", "tutoring", "teaching",
  "customer service", "public speaking", "event (coordination|planning|organization)",
  "entrepreneurship", "time management", "attention to detail",
  "data entry", "Microsoft (Office|Excel)|Excel|Google Sheets",
];

/** Returns the canonical display form (before first "|") of a keyword spec. */
function kwDisplay(spec: string): string {
  return spec.split("|")[0];
}

/**
 * Local (no-API) pass: find ATS keywords that are in the JD and master resume
 * but not in the draft.
 */
function findMissingKeywords(jobText: string, masterLatex: string, draftLatex: string): string[] {
  const found: string[] = [];
  const jd = jobText;
  const master = masterLatex;
  const draft = draftLatex;
  for (const spec of ATS_KEYWORDS) {
    try {
      const re = new RegExp(`\\b(?:${spec})\\b`, "i");
      if (re.test(jd) && re.test(master) && !re.test(draft)) {
        const disp = kwDisplay(spec);
        if (!found.includes(disp)) found.push(disp);
      }
    } catch {
      // malformed regex — skip
    }
  }
  return found;
}

export async function tailorResumeWithGemini(
  job: Job,
  masterLatex: string,
  apiKey: string,
  extraInfo = ""
): Promise<TailoredResume> {
  const jobContext = `Job Title: ${job.title}
Division: ${job.department}
Type: ${job.tags.join(", ")}
Description: ${job.description}
Requirements: ${job.requirements.join("; ")}`;

  const prompt = `You are an expert resume tailor. Produce a complete tailored resume for the candidate using their master LaTeX resume as the only source of truth.

GOAL: Fill close to one full page while staying factual and ATS-friendly.

=== HARD RULES — these protect factual accuracy ===
1. NEVER fabricate metrics, percentages, or numbers not in the master resume
2. NEVER claim skills, interests, academic fields, credentials, employers, links, or projects absent from the master resume
3. NEVER add new technical skills not present in the master resume
4. If a role asks for a skill that is not in the master resume, treat it as a gap rather than inventing it
5. Keep dates, names, institutions, and contact information exactly factual

=== TAILORING LATITUDE — you have real freedom here ===
- Aggressively rephrase and reframe bullets to speak the job's language
- Reorder sections and entries by relevance to this specific role
- Rename section headings if it helps (e.g. "Work Experience" → "Research & Experience" for research roles)
- Move entries between sections only when the master resume supports the classification
- Expand bullets for the most relevant entries, trim bullets for less relevant ones
- Choose which projects to highlight and which to drop based on what the job actually needs
- Rewrite or add a brief Summary section only if the master resume contains enough facts to support it

=== FORMATTING ===
- \\textbf{} bold IS allowed and encouraged in the resume — use it for tech names, tools, and skill category labels
- ONE sentence per bullet, max ~1.5 lines. No multi-clause run-ons.
- Substantive and specific — no vague filler like "demonstrated strong attention to detail"
- 2-3 bullets per entry depending on relevance
- Use Jake Gutierrez's template commands and preserve a valid LaTeX document

=== ALWAYS KEEP ===
- Name and contact info if present
- Education and the most relevant experience/projects/skills
- COPY the LaTeX preamble (everything from \\documentclass to \\begin{document}) EXACTLY from the master resume — do not alter a single character of it

${extraInfo.trim() ? `=== EXTRA CONTEXT FROM USER ===\n${extraInfo.trim()}\n` : ""}
JOB:
${jobContext}

MASTER RESUME (LaTeX):
${masterLatex}

Return your response in EXACTLY this format — no JSON, no markdown, no extra commentary:

<<<CHANGES>>>
change 1 | change 2 | change 3 | change 4
<<<END_CHANGES>>>
<<<LATEX>>>
(the complete tailored LaTeX document here, verbatim — starting with \\documentclass)
<<<END_LATEX>>>`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: WRITE_CONFIG,
    }
  );
  const text = result.response.text().trim();

  const changesMatch = text.match(/<<<CHANGES>>>([\s\S]*?)<<<END_CHANGES>>>/);
  const latexMatch = text.match(/<<<LATEX>>>([\s\S]*?)<<<END_LATEX>>>/);

  // Extract the correct preamble from master (everything up to and including \begin{document})
  const masterPreambleMatch = masterLatex.match(/([\s\S]*?\\begin\{document\})/);
  const masterPreamble = masterPreambleMatch ? masterPreambleMatch[1] : null;

  function fixPreamble(latex: string): string {
    if (!masterPreamble) return latex;
    // Replace everything up to \begin{document} with the master preamble
    return latex.replace(/[\s\S]*?\\begin\{document\}/, masterPreamble);
  }

  if (!latexMatch) {
    const fallbackLatex = text
      .replace(/^```(?:latex|tex)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    return { latex: fixPreamble(fallbackLatex), changes: ["Resume tailored for this role"] };
  }

  let latex = fixPreamble(latexMatch[1].trim());
  const changes = changesMatch
    ? changesMatch[1].split("|").map((s) => s.trim()).filter(Boolean)
    : ["Resume tailored for this role"];

  // ─── SECOND PASS: ATS keyword reconciliation ─────────────────────────────
  // Find keywords that appear in both the JD AND the master resume but are
  // missing from the draft — then have Gemini revise ONE focused set of bullets
  // to naturally surface them (no fabrication; reshape existing material only).
  const jobText = `${job.title} ${job.department} ${job.description} ${job.requirements.join(" ")} ${job.tags.join(" ")}`;
  const missing = findMissingKeywords(jobText, masterLatex, latex);

  if (missing.length > 0) {
    try {
      const revised = await revisionPassWithMissingKeywords({
        apiKey, job, masterLatex, draftLatex: latex,
        missingKeywords: missing, jobContext, masterPreamble,
      });
      if (revised) {
        latex = revised.latex;
        if (revised.added.length > 0) {
          changes.push(`Reinserted ATS keywords: ${revised.added.join(", ")}`);
        }
      }
    } catch {
      // keep the first-pass result if revision fails
    }
  }

  return { latex, changes };
}

/**
 * Second pass: ask Gemini to weave in missing keywords without fabricating
 * anything. Uses the same preamble-fixup as pass 1.
 */
async function revisionPassWithMissingKeywords(opts: {
  apiKey: string;
  job: Job;
  masterLatex: string;
  draftLatex: string;
  missingKeywords: string[];
  jobContext: string;
  masterPreamble: string | null;
}): Promise<{ latex: string; added: string[] } | null> {
  const { apiKey, masterLatex, draftLatex, missingKeywords, jobContext, masterPreamble } = opts;

  const kwList = missingKeywords.map((k) => `- ${k}`).join("\n");

  const prompt = `You are refining a tailored resume draft. The draft below is mostly good, but an ATS-style keyword scan detected that these terms appear in BOTH the job description AND the candidate's master resume, yet DO NOT appear in the draft:

MISSING KEYWORDS:
${kwList}

TASK:
- Naturally surface these keywords in the draft by reshaping existing bullets (rewording what's already there) or by restoring a relevant bullet from the master resume that was trimmed.
- DO NOT invent new metrics, numbers, or achievements not present in the master resume.
- DO NOT add new bullets unless the master resume supports them.
- DO NOT change the overall structure, section headings, or sections that are already strong.
- Preserve the LaTeX preamble EXACTLY (do not change \\documentclass, packages, or commands).
- If a listed keyword genuinely cannot be incorporated without fabricating, you may omit it — but try to include as many as possible honestly.
- Keep the result ~one page.

Return EXACTLY this format — no JSON, no markdown, no commentary:

<<<ADDED>>>
(comma-separated list of the keywords you actually incorporated, or "none")
<<<END_ADDED>>>
<<<LATEX>>>
(the complete revised LaTeX document, verbatim — starting with \\documentclass)
<<<END_LATEX>>>

JOB:
${jobContext}

MASTER RESUME (source of truth — use its content only):
${masterLatex}

CURRENT DRAFT (revise this):
${draftLatex}`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, topP: 0.9 },
    }
  );
  const text = result.response.text().trim();

  const latexMatch = text.match(/<<<LATEX>>>([\s\S]*?)<<<END_LATEX>>>/);
  const addedMatch = text.match(/<<<ADDED>>>([\s\S]*?)<<<END_ADDED>>>/);
  if (!latexMatch) return null;

  let latex = latexMatch[1].trim();
  if (masterPreamble) {
    latex = latex.replace(/[\s\S]*?\\begin\{document\}/, masterPreamble);
  }

  const addedRaw = addedMatch ? addedMatch[1].trim() : "";
  const added = /^none$/i.test(addedRaw) || !addedRaw
    ? []
    : addedRaw.split(",").map((s) => s.trim()).filter(Boolean);

  return { latex, added };
}

export async function generateCoverLetterWithGemini(
  job: Job,
  masterCoverLetterLatex: string,
  masterResumeLatex: string,
  extraInfo: string,
  apiKey: string
): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });

  const jobContext = `Job Title: ${job.title}
Division / Department: ${job.department}
Job Type: ${job.tags.join(", ")}
Description: ${job.description}
Requirements: ${job.requirements.join("; ")}`;

  const prompt = `You are writing a complete, tailored cover letter in LaTeX for the candidate.

Use the candidate's master resume as the only source of truth. Never invent credentials, metrics, skills, employers, schools, links, or dates.

STRUCTURE:
- 3-4 short paragraphs.
- Paragraph 1: identify the candidate's relevant background from the resume and the exact role.
- Paragraph 2: connect 1-2 relevant experiences or projects from the resume to the job requirements.
- Paragraph 3: optionally connect communication, leadership, research, operations, or domain experience if present in the resume.
- Closing: thank the reader and close with the candidate's name.

FORMATTING RULES:
- Paragraphs separated by \\vspace{8pt}
- NO bold — do NOT use \\textbf{} anywhere in the body text
- NEVER use em dashes (— or --) anywhere in the letter
- NEVER use bullet points in the body — pure flowing prose
- NEVER fabricate experiences — every claim must match the master resume
- Strict 1-page maximum — keep the letter tight. Cut filler. Every sentence must earn its place.
- Professional but human tone — confident, specific, NOT generic or sycophantic

ADDRESSING THE LETTER:
${(() => {
  const hm = sanitizeHiringManager(job.hiringManager);
  return hm
    ? `- This job listing names "${hm}" as the hiring manager. Address the letter to them directly: "Dear ${hm}," — NOT "Dear Hiring Manager"`
    : `- No verified hiring manager name is available. Address to "Dear Hiring Manager," — do NOT address to a company name, phone number, or department.`;
})()}
- Include the hiring manager's name and department/office below the date in the LaTeX header block (matching the example letter's address block format)
- Use the exact position title and department name from the job posting in the opening sentence

HUMAN VOICE — CRITICAL:
The letter must sound like a real person wrote it, not ChatGPT. STRICTLY AVOID these AI-sounding phrases and constructs:
- "I am thrilled/delighted/honored to apply"
- "I am writing to express my interest/passion/enthusiasm"
- "align perfectly with my passion for"
- "leverage my skills to make a meaningful impact"
- "I am deeply passionate about"
- "I would be a valuable asset"
- "dedicated to making a difference"
- Vague filler like "I have always been drawn to..." or "Throughout my academic journey..."
Write directly and specifically. Every sentence should contain a concrete fact, action, or job-specific connection.

=== END STYLE GUIDE ===

CANDIDATE MASTER RESUME:
${masterResumeLatex}

EXAMPLE COVER LETTER (use as structural template — rewrite completely for the new job):
${masterCoverLetterLatex}

JOB TO APPLY FOR:
${jobContext}

EXTRA CONTEXT FROM USER:
${extraInfo.trim() || "None provided."}

Use today's date: ${today}
Keep the exact same LaTeX preamble and document structure as the example.
If extra context is provided, weave it naturally into the letter.
Return ONLY the complete LaTeX document — no markdown fences, no commentary, just the raw LaTeX starting with \\documentclass`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: WRITE_CONFIG,
    }
  );
  return result.response.text().trim().replace(/^```(?:latex|tex)?\n?/, "").replace(/\n?```$/, "").trim();
}

export async function parseJobPosting(rawText: string, apiKey: string): Promise<Job> {

  const id = `custom-${Date.now()}`;

  const prompt = `Extract structured information from this job posting. Return ONLY a JSON object with these exact fields:
- title (string): the job title
- department (string): company or organization name + department if given
- location (string): city/remote, or "Not specified"
- description (string): full job description text, preserve all details
- requirements (array of strings): each required qualification as a separate string
- responsibilities (array of strings): each responsibility as a separate string
- tags (array of strings): 2-5 short category tags (e.g. "Software Development", "Research", "Data Analysis")
- isRemote (boolean): true if remote work is mentioned
- jobUrl (string): any application URL found, or ""
- deadline (string): application deadline in ISO format YYYY-MM-DD if found, or ""
- wage (number or null): hourly wage if mentioned, or null
- hours (number or null): hours per week if mentioned, or null
- hiringManager (string or null): the name of the hiring manager or supervisor listed in the posting (e.g. "Jeff Burrow", "Dr. Sarah Chen") — look for phrases like "reports to", "supervisor:", "contact:", "hiring manager:", or a name given as the point of contact. Return null if not found.

JOB POSTING:
${rawText}

Return ONLY the JSON object, no markdown, no extra text.`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: PARSE_CONFIG,
    }
  );
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    id,
    title: parsed.title || "Custom Job",
    department: parsed.department || "Unknown",
    location: parsed.location || "Not specified",
    description: parsed.description || rawText,
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    isRemote: Boolean(parsed.isRemote),
    jobUrl: parsed.jobUrl || "",
    deadline: parsed.deadline || "",
    wage: parsed.wage ?? undefined,
    hours: parsed.hours ?? undefined,
    hiringManager: parsed.hiringManager || undefined,
  };
}

export interface JobBankResearch {
  description: string;
  hiringManager?: string;
  companyNotes?: string;
}

export async function generateJobBankDescription(
  job: Job,
  apiKey: string,
  onProgress?: (status: string) => void
): Promise<JobBankResearch> {

  onProgress?.("Searching Google for company info...");

  const rawStored = job.hiringManager ?? "";
  const prompt = `You are researching an employer from a job posting, so a candidate can apply effectively.

Company: ${job.department}
Job Title: ${job.title}
Location: ${job.location}
Salary: $${job.wage}/hr, ${job.hours} hours/week
Listed contact on posting: ${rawStored || "(none)"}

TASK — use Google Search to research this company, then return BOTH of these in the format below:

1. A 4–5 paragraph job description:
   - What ${job.department} actually does (industry, products/services, mission) — grounded in what you found
   - What the "${job.title}" role likely involves day-to-day at this specific company
   - The likely tools / tech stack / methods / domain context
   - Who thrives here
   - What makes it a valuable early-career experience
   Pure flowing paragraphs. No bullets, headers, or markdown.

2. The hiring-contact name IF you can confidently identify a real human from the search results. Look for owner / founder / operations manager / HR contact / hiring manager names on the company website, LinkedIn, or news coverage. Rules:
   - Must be a specific person's full name (e.g. "Sarah Chen", "Dr. Marcus Patel"). NOT a company name, department, or phone number.
   - Ignore the "Listed contact on posting" above if it's clearly a company/phone (all-caps, has digits, has INC/LTD/CORP, contains "&", etc.).
   - If you can't confidently find a real person after searching, return null for the name. DO NOT guess.

3. A one-sentence note of anything notable to weave into a cover letter (recent milestone, product focus, notable value). Optional — leave empty if nothing stands out.

Return in EXACTLY this format — no markdown, no commentary outside the blocks:

<<<DESCRIPTION>>>
(the 4–5 paragraph description here)
<<<END_DESCRIPTION>>>
<<<HIRING_MANAGER>>>
(full name of the real hiring contact, or the word NONE if you could not verify one)
<<<END_HIRING_MANAGER>>>
<<<COMPANY_NOTES>>>
(one sentence cover-letter hook, or leave blank)
<<<END_COMPANY_NOTES>>>`;

  const result = await runModel(
    apiKey,
    {
      model: GEMINI_SEARCH_MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    },
    prompt
  );
  onProgress?.("Parsing research...");

  const text = result.response.text();
  const descMatch = text.match(/<<<DESCRIPTION>>>([\s\S]*?)<<<END_DESCRIPTION>>>/);
  const hmMatch   = text.match(/<<<HIRING_MANAGER>>>([\s\S]*?)<<<END_HIRING_MANAGER>>>/);
  const noteMatch = text.match(/<<<COMPANY_NOTES>>>([\s\S]*?)<<<END_COMPANY_NOTES>>>/);

  const description = (descMatch ? descMatch[1] : text).trim();

  // Validate returned HM: Gemini may have written "NONE" or a company name anyway.
  let hiringManager: string | undefined;
  if (hmMatch) {
    const hmRaw = hmMatch[1].trim();
    if (hmRaw && !/^none$/i.test(hmRaw) && !/^n\/a$/i.test(hmRaw)) {
      hiringManager = sanitizeHiringManager(hmRaw);
    }
  }

  const companyNotes = noteMatch ? noteMatch[1].trim() : undefined;

  onProgress?.("Done.");
  return { description, hiringManager, companyNotes: companyNotes || undefined };
}

export interface ApplicationEmail {
  subject: string;
  body: string;
}

export async function generateApplicationEmailWithGemini(
  job: Job,
  profileText: string,
  extraInfo: string,
  apiKey: string
): Promise<ApplicationEmail> {
  const jobContext = `Job Title: ${job.title}
Company / Organization: ${job.department}
Location: ${job.location}
Salary: $${job.wage}/hr, ${job.hours} hrs/week
Description: ${job.description}
How to apply: By email${job.contactEmail ? ` to ${job.contactEmail}` : ""}`;

  const validHm = sanitizeHiringManager(job.hiringManager);
  const hiringManagerLine = validHm
    ? `The hiring contact is "${validHm}" — address the greeting directly to them.`
    : `No verified hiring manager is available. Use "Dear Hiring Manager," — do NOT address to a company name, phone number, or department.`;

  const prompt = `Write a short, professional application email for the candidate to send when applying for this job.

=== CANDIDATE PROFILE ===
${profileText}

=== JOB ===
${jobContext}

=== ADDRESSING ===
${hiringManagerLine}

=== REQUIREMENTS ===
Write a short email application — NOT a cover letter. Think of it as the message body when attaching a resume.

STRUCTURE (3 short paragraphs, ~150–200 words total):

PARAGRAPH 1 (2–3 sentences):
- State who the candidate is, using only the profile above, and the exact job title + company they are applying for
- One sentence on why this specific company/role interests them — be concrete, not generic

PARAGRAPH 2 (2–3 sentences):
- Highlight 1–2 most relevant experiences from the candidate's actual background
- Tie them directly to what the role needs — specific and confident

PARAGRAPH 3 (1–2 sentences):
- Say his resume is attached and he'd welcome a chance to discuss
- Close professionally

TONE: Direct, specific, confident, human — NOT "I am writing to express my deep passion for..." or any AI-speak.

SUBJECT LINE: Clear and professional, e.g. "Application – [Job Title] at [Company] | [Candidate Name]"

${extraInfo.trim() ? `EXTRA CONTEXT FROM USER:\n${extraInfo.trim()}\n` : ""}

Return EXACTLY this format — no markdown, no commentary:

<<<SUBJECT>>>
(subject line here)
<<<END_SUBJECT>>>
<<<BODY>>>
(email body here — plain text, no LaTeX, no markdown)
<<<END_BODY>>>`;

  const result = await runModel(
    apiKey,
    { model: GEMINI_TEXT_MODEL },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: WRITE_CONFIG,
    }
  );
  const text = result.response.text().trim();

  const subjectMatch = text.match(/<<<SUBJECT>>>([\s\S]*?)<<<END_SUBJECT>>>/);
  const bodyMatch = text.match(/<<<BODY>>>([\s\S]*?)<<<END_BODY>>>/);

  return {
    subject: subjectMatch ? subjectMatch[1].trim() : `Application - ${job.title} at ${job.department}`,
    body: bodyMatch ? bodyMatch[1].trim() : text,
  };
}

export async function scoreCustomJob(job: Job, profileText: string, apiKey: string): Promise<JobMatch> {
  const prompt = `You are a realistic job matching assistant. Score this job for how well the candidate actually qualifies.

${profileText}

=== SCORING RUBRIC ===
90-100: Meets essentially ALL requirements. ~1-5% of jobs.
75-89: Meets core requirements, minor gaps. ~10-20% of jobs.
60-74: Meets most requirements, 1-2 notable gaps. ~20-30% of jobs.
40-59: Partial match, missing key qualifications. ~20-30% of jobs.
20-39: Weak match, most requirements are outside the candidate's skill set. ~10-20% of jobs.
0-19: Not a match. ~5-10% of jobs.

JOB:
Title: ${job.title}
Company/Dept: ${job.department}
Description: ${job.description}
Requirements: ${job.requirements.join("; ")}

Return ONLY a JSON object:
{"score": <integer 0-100>, "reasoning": "<1 sentence>", "highlights": ["<5 words>", "<5 words>"], "concerns": ["<6 words max>"]}`;

  const result = await runModel(apiKey, { model: GEMINI_TEXT_MODEL }, prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    job,
    score: parsed.score ?? 50,
    reasoning: parsed.reasoning ?? "",
    highlights: parsed.highlights ?? [],
    concerns: parsed.concerns ?? [],
  };
}
