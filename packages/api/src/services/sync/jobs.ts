import crypto from "node:crypto";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type SyncJob = {
  id: string;
  sync: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  input: unknown;
  result?: unknown;
  error?: string;
};

const jobs = new Map<string, SyncJob>();
const MAX_JOBS = 100;

function trimJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  while (jobs.size > MAX_JOBS && sorted.length) {
    const old = sorted.shift()!;
    jobs.delete(old.id);
  }
}

export function createJob(sync: string, input: unknown): SyncJob {
  const job: SyncJob = {
    id: crypto.randomUUID(),
    sync,
    status: "pending",
    createdAt: new Date().toISOString(),
    input,
  };
  jobs.set(job.id, job);
  trimJobs();
  return job;
}

export function getJob(id: string): SyncJob | null {
  return jobs.get(id) ?? null;
}

export function listJobs(limit = 20): SyncJob[] {
  return [...jobs.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function markJobRunning(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "running";
  job.startedAt = new Date().toISOString();
}

export function markJobCompleted(id: string, result: unknown): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  job.result = result;
}

export function markJobFailed(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.finishedAt = new Date().toISOString();
  job.error = error;
}

export function runJobAsync(
  jobId: string,
  fn: () => Promise<unknown>,
): void {
  markJobRunning(jobId);
  void fn()
    .then((result) => markJobCompleted(jobId, result))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      markJobFailed(jobId, msg);
    });
}
