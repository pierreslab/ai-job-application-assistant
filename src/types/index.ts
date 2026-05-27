export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  hours?: number;
  wage?: number;
  description: string;
  requirements: string[];
  responsibilities: string[];
  tags: string[];
  postedDate?: string;
  deadline?: string;
  contactEmail?: string;
  jobUrl?: string;
  isRemote?: boolean;
  hiringManager?: string;
  source?: string;
}

export interface UserProfile {
  name: string;
  program: string;
  year: string;
  skills: string[];
  interests: string[];
  preferredHours: [number, number];
  preferredWage: number;
  availability: string[];
  notes: string;
  preferRemote: boolean;
}

export interface JobMatch {
  job: Job;
  score: number;
  reasoning: string;
  highlights: string[];
  concerns: string[];
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "",
  program: "",
  year: "",
  skills: [],
  interests: [],
  preferredHours: [5, 20],
  preferredWage: 0,
  availability: [],
  notes: "",
  preferRemote: false,
};
