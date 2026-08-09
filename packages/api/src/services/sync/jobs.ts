import type { JobProgress, JobStatus, SyncJob } from "./jobsTypes.js";
import { summarizeSyncJobResult } from "./jobResultSummary.js";
import {
  storeCreateJob,
  storeGetJob,
  storeListJobs,
  storeMarkJobCancelled,
  storeMarkJobCompleted,
  storeMarkJobFailed,
  storeMarkJobRunning,
  storeUpdateJobProgress,
} from "./jobsStore.js";

export type { JobProgress, JobStatus, SyncJob } from "./jobsTypes.js";

/** Tempo máximo de execução de um job async (5 minutos). */
export const JOB_TIMEOUT_MS = 5 * 60 * 1000;

const cancellationReasons = new Map<string, string>();

export class JobCancelledError extends Error {
  constructor(message = "Job cancelado") {
    super(message);
    this.name = "JobCancelledError";
  }
}

export async function createJob(sync: string, input: unknown) {
  return storeCreateJob(sync, input);
}

export async function getJob(id: string) {
  const job = await storeGetJob(id);
  if (!job) return null;
  return expireStaleJobIfNeeded(job);
}

export async function listJobs(limit = 20) {
  const jobs = await storeListJobs(limit);
  return Promise.all(jobs.map((j) => expireStaleJobIfNeeded(j)));
}

export async function markJobRunning(id: string): Promise<void> {
  await storeMarkJobRunning(id);
}

export async function updateJobProgress(id: string, progress: JobProgress): Promise<void> {
  await assertJobActive(id);
  await storeUpdateJobProgress(id, progress);
}

export async function markJobCompleted(
  id: string,
  result: unknown,
  errorSummary?: string,
): Promise<void> {
  if (await isJobCancellationRequested(id)) {
    await finalizeCancellation(id);
    return;
  }
  await storeMarkJobCompleted(id, result, errorSummary);
  cancellationReasons.delete(id);
}

export async function markJobFailed(id: string, error: string): Promise<void> {
  await storeMarkJobFailed(id, error);
  cancellationReasons.delete(id);
}

export async function markJobCancelled(id: string, reason: string): Promise<void> {
  cancellationReasons.set(id, reason);
  await storeMarkJobCancelled(id, reason);
}

export async function isJobCancellationRequested(id: string): Promise<boolean> {
  if (cancellationReasons.has(id)) return true;
  const job = await storeGetJob(id);
  return job?.status === "cancelled";
}

export async function assertJobActive(id: string): Promise<void> {
  if (await isJobCancellationRequested(id)) {
    throw new JobCancelledError(cancellationReasons.get(id) ?? "Job cancelado");
  }
}

/** Marca cancelamento (UI ou timeout). Só afecta jobs pending/running. */
export async function requestCancelJob(id: string, reason = "Cancelado pelo utilizador"): Promise<boolean> {
  const job = await storeGetJob(id);
  if (!job) return false;
  if (job.status !== "pending" && job.status !== "running") return false;
  await markJobCancelled(id, reason);
  return true;
}

async function finalizeCancellation(id: string): Promise<void> {
  const reason = cancellationReasons.get(id) ?? "Job cancelado";
  await storeMarkJobCancelled(id, reason);
}

function jobElapsedMs(job: { startedAt?: string; createdAt: string }): number {
  const ref = job.startedAt ?? job.createdAt;
  return Date.now() - new Date(ref).getTime();
}

async function expireStaleJobIfNeeded(job: SyncJob): Promise<SyncJob> {
  if (job.status !== "pending" && job.status !== "running") return job;
  if (jobElapsedMs(job) <= JOB_TIMEOUT_MS) return job;
  const reason = "Timeout após 5 minutos";
  cancellationReasons.set(job.id, reason);
  await storeMarkJobCancelled(job.id, reason);
  return {
    ...job,
    status: "cancelled",
    error: reason,
    finishedAt: new Date().toISOString(),
  };
}

function runJobWithLimits(jobId: string, fn: () => Promise<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      void requestCancelJob(jobId, "Timeout após 5 minutos");
      cleanup();
      reject(new JobCancelledError("Timeout após 5 minutos"));
    }, JOB_TIMEOUT_MS);

    const poll = setInterval(() => {
      void isJobCancellationRequested(jobId).then((cancelled) => {
        if (cancelled) {
          cleanup();
          reject(new JobCancelledError(cancellationReasons.get(jobId) ?? "Job cancelado"));
        }
      });
    }, 1000);

    function cleanup() {
      clearTimeout(timeout);
      clearInterval(poll);
    }

    fn()
      .then((result) => {
        cleanup();
        resolve(result);
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}

export function runJobAsync(jobId: string, fn: () => Promise<unknown>): void {
  void markJobRunning(jobId)
    .then(() => assertJobActive(jobId))
    .then(() => runJobWithLimits(jobId, fn))
    .then((result) => markJobCompleted(jobId, result, summarizeSyncJobResult(result)))
    .catch(async (err) => {
      if (err instanceof JobCancelledError || (await isJobCancellationRequested(jobId))) {
        await finalizeCancellation(jobId);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      await markJobFailed(jobId, msg);
    });
}
