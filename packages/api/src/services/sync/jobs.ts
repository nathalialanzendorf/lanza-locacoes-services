import type { JobProgress, JobStatus } from "./jobsTypes.js";
import {
  storeCreateJob,
  storeGetJob,
  storeListJobs,
  storeMarkJobCompleted,
  storeMarkJobFailed,
  storeMarkJobRunning,
  storeUpdateJobProgress,
} from "./jobsStore.js";

export type { JobProgress, JobStatus, SyncJob } from "./jobsTypes.js";

export async function createJob(sync: string, input: unknown) {
  return storeCreateJob(sync, input);
}

export async function getJob(id: string) {
  return storeGetJob(id);
}

export async function listJobs(limit = 20) {
  return storeListJobs(limit);
}

export async function markJobRunning(id: string): Promise<void> {
  await storeMarkJobRunning(id);
}

export async function updateJobProgress(id: string, progress: JobProgress): Promise<void> {
  await storeUpdateJobProgress(id, progress);
}

export async function markJobCompleted(id: string, result: unknown): Promise<void> {
  await storeMarkJobCompleted(id, result);
}

export async function markJobFailed(id: string, error: string): Promise<void> {
  await storeMarkJobFailed(id, error);
}

export function runJobAsync(jobId: string, fn: () => Promise<unknown>): void {
  void markJobRunning(jobId)
    .then(() => fn())
    .then((result) => markJobCompleted(jobId, result))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return markJobFailed(jobId, msg);
    });
}
