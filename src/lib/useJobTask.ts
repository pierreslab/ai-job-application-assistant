"use client";

import { useSyncExternalStore } from "react";
import { GenType, getLatestTask, getTasks, subscribe } from "@/lib/generationStore";

export function useJobTask(jobId: string, type: GenType) {
  useSyncExternalStore(subscribe, getTasks, getTasks);
  return getLatestTask(jobId, type);
}
