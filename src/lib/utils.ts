import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Job } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Reads enriched description and hiring-manager override from localStorage
 * (saved by the "Research" feature) and injects them into a copy of the job.
 * Safe to call on any job — no-ops if nothing is saved.
 */
/**
 * Heuristics for "does this look like a real human name?"
 * Rejects: empty, contains digits, contains phone punctuation, email addresses,
 * company suffixes (INC, LTD, CORP, LLC, CO., ENTERPRISE, HOLDINGS, GROUP, &),
 * all-caps strings longer than 3 words, anything under 2 chars, or just a single
 * word that's clearly a company (e.g. "MCDONALDS").
 *
 * Returns the CLEANED name, or undefined if it isn't a plausible person.
 */
export function sanitizeHiringManager(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).trim();
  // Strip leading honorifics we don't want to keep normalising against
  s = s.replace(/\s*[—–-]\s*\d[\d\s().-]*$/i, ""); // drop trailing " — 416-555-1234"
  s = s.replace(/\s*\(\s*\d[\d\s().-]*\)\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 2) return undefined;
  if (/\d/.test(s)) return undefined;                            // phone, address, etc.
  if (/@/.test(s)) return undefined;                             // email
  if (/[|/]/.test(s)) return undefined;                          // structural garbage
  if (/\b(INC|LTD|LLC|LLP|CORP|CORPORATION|CO\.|ENTERPRISES?|HOLDINGS?|GROUP|SERVICES?|LIMITED|INDUSTRIES|SOLUTIONS|INTERNATIONAL|INTL|TECHNOLOGIES|TECH|SOCIETY|FOUNDATION|ASSOCIATION|COOP|CO-OPERATIVE|COOPERATIVE|COUNCIL|BOARD|AGENCY|DEPARTMENT|MINISTRY|COMMITTEE)\b/i.test(s)) return undefined;
  if (/&/.test(s)) return undefined;                             // "SMITH & SONS"
  const words = s.split(" ").filter(Boolean);
  if (words.length > 4) return undefined;                        // long phrases aren't names
  // All-caps ≥3 words is almost certainly a company
  const allCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  if (allCaps && words.length >= 2) {
    // Title-case it so it addresses politely; still reject if it looks corporate
    s = words.map(titleCaseWord).join(" ");
  }
  // A single word is a weak signal for a human — accept if it looks like a first name
  if (words.length === 1 && s.length < 3) return undefined;
  return s;
}

function titleCaseWord(w: string): string {
  if (!w) return w;
  if (w.length <= 2) return w.toUpperCase(); // preserve initials like "JP"
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export function enrichJobFromStorage(job: Job): Job {
  if (typeof window === "undefined") return job;
  const enrichedDesc = localStorage.getItem(`job-assistant-jb-desc-${job.id}`);
  const hmOverride   = localStorage.getItem(`job-assistant-jb-hm-${job.id}`);

  // Resolve the HM source:
  // - user override wins (including explicit clear "")
  // - else job-bank source: never trust raw value (it's often "COMPANY — PHONE")
  // - else use raw if present
  const rawHm =
    hmOverride !== null
      ? hmOverride                              // "" or a name
      : job.source === "job-bank"
        ? null                                  // ignore raw job-bank HM
        : job.hiringManager ?? null;

  const cleaned = rawHm === "" ? undefined : sanitizeHiringManager(rawHm ?? undefined);

  return {
    ...job,
    ...(enrichedDesc ? { description: enrichedDesc } : {}),
    hiringManager: cleaned,
  };
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#6366f1";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent Match";
  if (score >= 70) return "Great Match";
  if (score >= 55) return "Good Match";
  if (score >= 40) return "Fair Match";
  return "Low Match";
}

export function formatWage(wage: number): string {
  return `$${wage.toFixed(2)}/hr`;
}

export function formatHours(hours: number): string {
  return `${hours} hrs/wk`;
}

export const SAMPLE_JOBS = [
  {
    id: "1",
    title: "Library Research Assistant",
    department: "Campus Library",
    location: "Main Campus",
    hours: 10,
    wage: 17.20,
    description: "Assist library staff with research support, database management, and helping students find resources. Great opportunity to develop research and information literacy skills.",
    requirements: ["Strong organizational skills", "Comfort with databases", "Excellent communication"],
    responsibilities: ["Help students locate resources", "Assist with cataloguing", "Support library events", "Maintain digital databases"],
    tags: ["Research", "Library", "Administrative"],
    postedDate: "2026-03-20",
    deadline: "2026-04-15",
    contactEmail: "library@example.edu",
    isRemote: false,
  },
  {
    id: "2",
    title: "IT Help Desk Student Tech",
    department: "Information & Instructional Technology Services",
    location: "Main Campus / Remote",
    hours: 15,
    wage: 18.50,
    description: "Provide first-line technical support to students, staff and faculty. Troubleshoot hardware/software issues, manage tickets, and assist with AV equipment.",
    requirements: ["Basic IT knowledge", "Problem-solving ability", "Patience and communication skills"],
    responsibilities: ["Answer help desk tickets", "Troubleshoot tech issues", "Set up AV for events", "Document solutions"],
    tags: ["IT", "Tech Support", "Remote-friendly"],
    postedDate: "2026-03-25",
    deadline: "2026-04-20",
    contactEmail: "helpdesk@example.edu",
    isRemote: true,
  },
  {
    id: "3",
    title: "Peer Tutor - Programming",
    department: "Academic Advising & Career Centre",
    location: "Main Campus",
    hours: 8,
    wage: 17.00,
    description: "Provide one-on-one and group tutoring for introductory programming courses. Help students understand core software development concepts.",
    requirements: ["B+ or higher in relevant CS courses", "Strong communication", "Patience"],
    responsibilities: ["Hold tutoring sessions", "Create study resources", "Report student progress"],
    tags: ["Tutoring", "Programming", "Education"],
    postedDate: "2026-03-18",
    deadline: "2026-04-10",
    isRemote: false,
  },
  {
    id: "4",
    title: "Research Lab Assistant – Biology",
    department: "Biological Sciences",
    location: "Main Campus",
    hours: 12,
    wage: 19.00,
    description: "Assist faculty researchers with lab experiments, data collection, and analysis in molecular biology or ecology projects.",
    requirements: ["Enrolled in Life Sciences or related", "Lab safety certification", "Detail-oriented"],
    responsibilities: ["Prepare lab samples", "Collect and enter data", "Maintain lab equipment", "Assist with literature reviews"],
    tags: ["Research", "Biology", "Science", "Lab"],
    postedDate: "2026-03-22",
    deadline: "2026-04-18",
    isRemote: false,
  },
  {
    id: "5",
    title: "Social Media & Communications Assistant",
    department: "Student Life & Learning",
    location: "Main Campus / Remote",
    hours: 10,
    wage: 17.50,
    description: "Help manage a student engagement team's social media channels. Create content, monitor engagement, and help plan events.",
    requirements: ["Social media savvy", "Basic graphic design (Canva/Adobe)", "Strong writing"],
    responsibilities: ["Draft and schedule posts", "Design graphics", "Respond to messages", "Track analytics"],
    tags: ["Social Media", "Communications", "Creative", "Remote-friendly"],
    postedDate: "2026-03-28",
    deadline: "2026-04-25",
    isRemote: true,
  },
  {
    id: "6",
    title: "Athletics & Recreation Facility Assistant",
    department: "Athletics & Recreation",
    location: "Main Campus",
    hours: 14,
    wage: 16.55,
    description: "Support daily operations at the Athletics Centre. Assist with equipment rentals, facility monitoring, and intramural sports coordination.",
    requirements: ["Interest in fitness/sports", "First Aid certification (or willing to obtain)", "Reliable and punctual"],
    responsibilities: ["Monitor gym facilities", "Manage equipment rentals", "Assist with intramural events", "Enforce safety rules"],
    tags: ["Athletics", "Recreation", "Physical"],
    postedDate: "2026-03-15",
    deadline: "2026-04-08",
    isRemote: false,
  },
  {
    id: "7",
    title: "Data Entry & Administrative Assistant",
    department: "Registrar's Office",
    location: "Main Campus / Remote",
    hours: 10,
    wage: 17.00,
    description: "Assist the Registrar's office with data entry, document processing, and administrative tasks supporting enrollment and graduation processes.",
    requirements: ["Strong attention to detail", "Proficiency in Excel/Google Sheets", "Discretion with confidential data"],
    responsibilities: ["Enter and verify student records", "Process graduation applications", "Respond to email inquiries", "File documents"],
    tags: ["Administrative", "Data Entry", "Remote-friendly"],
    postedDate: "2026-03-30",
    deadline: "2026-04-22",
    isRemote: true,
  },
  {
    id: "8",
    title: "Student Welcome Centre Ambassador",
    department: "Student Welcome & Support Centre",
    location: "Main Campus",
    hours: 8,
    wage: 16.55,
    description: "Be the first point of contact for new and prospective students. Give tours, answer questions, and help with orientation activities.",
    requirements: ["Outgoing and friendly", "Knowledge of campus programs", "Bilingual an asset"],
    responsibilities: ["Lead campus tours", "Answer student inquiries", "Support orientation events", "Maintain welcome desk"],
    tags: ["Student Services", "Community", "Communication"],
    postedDate: "2026-03-20",
    deadline: "2026-04-12",
    isRemote: false,
  },
];
