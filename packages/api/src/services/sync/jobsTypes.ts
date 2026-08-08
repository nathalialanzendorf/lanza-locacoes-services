export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type JobProgress = {
  total: number;
  done: number;
  percent: number;
  sucesso: number;
  falhas: number;
  /** Linhas por veículo (sync FIPE). */
  resultados?: Array<{
    placa: string;
    marcaModelo?: string;
    anoModelo?: string;
    ok: boolean;
    fipeCodigo?: string;
    fipeModelo?: string;
    fipeValor?: string;
    fipeReferencia?: string;
    fipe?: string;
    fonte?: "parallelum" | "placafipebrasil";
    erro?: string;
  }>;
  /** Fase textual (ex.: pedágios — consultando portal). */
  fase?: string;
};

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
  progress?: JobProgress;
};

export type SyncProgressCallback = (p: JobProgress) => void;
