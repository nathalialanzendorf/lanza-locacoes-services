import crypto from "node:crypto";

import { getDbBackend, pgQuery } from "@lanza/db";

import type { JobProgress, JobStatus, SyncJob } from "./jobsTypes.js";

const memoryJobs = new Map<string, SyncJob>();
const MAX_JOBS = 100;
/** Após falha por tabela ausente, mantém memória nesta instância (evita split-brain local). */
let forceMemoryStore = false;

function usePostgres(): boolean {
  if (forceMemoryStore) return false;
  const b = getDbBackend();
  return b === "postgres" || b === "dual";
}

function isMissingSyncJobsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /sync_jobs|does not exist|relation "lanza\.sync_jobs"/i.test(msg);
}

async function withStore<T>(
  pgFn: () => Promise<T>,
  memFn: () => T | Promise<T>,
): Promise<T> {
  if (!usePostgres()) return memFn();
  try {
    return await pgFn();
  } catch (err) {
    if (isMissingSyncJobsTable(err)) {
      forceMemoryStore = true;
      console.warn("[sync-jobs] tabela lanza.sync_jobs ausente — fallback memória");
      return memFn();
    }
    throw err;
  }
}

function trimMemoryJobs(): void {
  if (memoryJobs.size <= MAX_JOBS) return;
  const sorted = [...memoryJobs.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  while (memoryJobs.size > MAX_JOBS && sorted.length) {
    const old = sorted.shift()!;
    memoryJobs.delete(old.id);
  }
}

type JobRow = {
  id: string;
  sync: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  input: unknown;
  result: unknown;
  error: string | null;
  progress: JobProgress | null;
};

function rowToJob(row: JobRow): SyncJob {
  return {
    id: row.id,
    sync: row.sync,
    status: row.status as JobStatus,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : undefined,
    input: row.input ?? undefined,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    progress: row.progress ?? undefined,
  };
}

async function pgGetJob(id: string): Promise<SyncJob | null> {
  const r = await pgQuery<JobRow>(
    `SELECT id, sync, status, created_at, started_at, finished_at, input, result, error, progress
     FROM lanza.sync_jobs WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToJob(row) : null;
}

export async function storeCreateJob(sync: string, input: unknown): Promise<SyncJob> {
  const job: SyncJob = {
    id: crypto.randomUUID(),
    sync,
    status: "pending",
    createdAt: new Date().toISOString(),
    input,
  };

  return withStore(
    async () => {
      await pgQuery(
        `INSERT INTO lanza.sync_jobs (id, sync, status, created_at, input)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [job.id, job.sync, job.status, job.createdAt, JSON.stringify(input ?? null)],
      );
      return (await pgGetJob(job.id)) ?? job;
    },
    () => {
      memoryJobs.set(job.id, job);
      trimMemoryJobs();
      return job;
    },
  );
}

export async function storeGetJob(id: string): Promise<SyncJob | null> {
  return withStore(
    () => pgGetJob(id),
    () => memoryJobs.get(id) ?? null,
  );
}

export async function storeListJobs(limit = 20): Promise<SyncJob[]> {
  return withStore(
    async () => {
      const r = await pgQuery<JobRow>(
        `SELECT id, sync, status, created_at, started_at, finished_at, input, result, error, progress
         FROM lanza.sync_jobs
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );
      return r.rows.map(rowToJob);
    },
    () =>
      [...memoryJobs.values()]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit),
  );
}

async function pgUpdateJob(
  id: string,
  patch: Partial<{
    status: JobStatus;
    startedAt: string;
    finishedAt: string;
    result: unknown;
    error: string;
    progress: JobProgress;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (patch.status) {
    sets.push(`status = $${i++}`);
    vals.push(patch.status);
  }
  if (patch.startedAt) {
    sets.push(`started_at = $${i++}`);
    vals.push(patch.startedAt);
  }
  if (patch.finishedAt) {
    sets.push(`finished_at = $${i++}`);
    vals.push(patch.finishedAt);
  }
  if (patch.result !== undefined) {
    sets.push(`result = $${i++}::jsonb`);
    vals.push(JSON.stringify(patch.result));
  }
  if (patch.error !== undefined) {
    sets.push(`error = $${i++}`);
    vals.push(patch.error);
  }
  if (patch.progress) {
    sets.push(`progress = $${i++}::jsonb`);
    vals.push(JSON.stringify(patch.progress));
  }

  if (!sets.length) return;
  vals.push(id);
  await pgQuery(`UPDATE lanza.sync_jobs SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function storeMarkJobRunning(id: string): Promise<void> {
  const startedAt = new Date().toISOString();
  await withStore(
    () => pgUpdateJob(id, { status: "running", startedAt }),
    () => {
      const job = memoryJobs.get(id);
      if (!job) return;
      job.status = "running";
      job.startedAt = startedAt;
    },
  );
}

export async function storeUpdateJobProgress(id: string, progress: JobProgress): Promise<void> {
  await withStore(
    () => pgUpdateJob(id, { progress }),
    () => {
      const job = memoryJobs.get(id);
      if (!job) return;
      job.progress = progress;
    },
  );
}

export async function storeMarkJobCompleted(
  id: string,
  result: unknown,
  error?: string,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const patch = {
    status: "completed" as const,
    finishedAt,
    result,
    ...(error?.trim() ? { error: error.trim() } : {}),
  };
  await withStore(
    () => pgUpdateJob(id, patch),
    () => {
      const job = memoryJobs.get(id);
      if (!job) return;
      job.status = "completed";
      job.finishedAt = finishedAt;
      job.result = result;
      if (error?.trim()) job.error = error.trim();
    },
  );
}

export async function storeMarkJobFailed(id: string, error: string): Promise<void> {
  const finishedAt = new Date().toISOString();
  await withStore(
    () => pgUpdateJob(id, { status: "failed", finishedAt, error }),
    () => {
      const job = memoryJobs.get(id);
      if (!job) return;
      job.status = "failed";
      job.finishedAt = finishedAt;
      job.error = error;
    },
  );
}

export async function storeMarkJobCancelled(id: string, error: string): Promise<void> {
  const finishedAt = new Date().toISOString();
  await withStore(
    () => pgUpdateJob(id, { status: "cancelled", finishedAt, error }),
    () => {
      const job = memoryJobs.get(id);
      if (!job) return;
      job.status = "cancelled";
      job.finishedAt = finishedAt;
      job.error = error;
    },
  );
}
