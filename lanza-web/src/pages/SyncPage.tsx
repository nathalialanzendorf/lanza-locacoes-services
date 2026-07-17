import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { ResultPanel } from "@/components/ResultPanel";
import { useSyncJobs, useSyncMeta } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import type { SyncCatalogEntry, SyncJob } from "@/api/types";

const SYNC_PRIORIDADE = [
  "motoristas",
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "rastreaveis",
  "seguro",
  "recebimentos",
  "detran-rs",
  "manutencao",
] as const;

const SKILL_ALIASES: Record<string, string> = {
  motoristas: "sync-cliente",
  rastreaveis: "sync-veículo",
  infracoes: "sync-infracoes",
  "ipva-licenciamento": "sync-ipva-licenciamento",
  pedagios: "sync-pedagios",
  seguro: "sync-seguro",
  recebimentos: "sync-recebimentos",
  "detran-rs": "sync-detran-rs",
  manutencao: "sync-manutencao",
};

function statusBadge(status: SyncJob["status"]) {
  switch (status) {
    case "completed":
      return "badge badge--ok";
    case "failed":
      return "badge badge--danger";
    case "running":
      return "badge badge--warn";
    default:
      return "badge badge--muted";
  }
}

function ordenarSyncs(syncs: SyncCatalogEntry[]): SyncCatalogEntry[] {
  const map = new Map(syncs.map((s) => [s.id, s]));
  const ordered: SyncCatalogEntry[] = [];
  for (const id of SYNC_PRIORIDADE) {
    const item = map.get(id);
    if (item) ordered.push(item);
  }
  for (const s of syncs) {
    if (!ordered.some((o) => o.id === s.id)) ordered.push(s);
  }
  return ordered;
}

export function SyncPage() {
  const qc = useQueryClient();
  const metaQuery = useSyncMeta();
  const [dryRun, setDryRun] = useState(false);
  const [asyncMode, setAsyncMode] = useState(true);
  const [placa, setPlaca] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const jobsQuery = useSyncJobs();
  const jobs = jobsQuery.data?.jobs ?? [];

  const syncs = useMemo(
    () => ordenarSyncs(metaQuery.data?.syncs ?? []),
    [metaQuery.data],
  );

  const bodyOpts = useMemo(
    () => ({
      dryRun,
      placa: placa.trim() || undefined,
    }),
    [dryRun, placa],
  );

  async function disparar(label: string, fn: () => Promise<unknown>) {
    setRunningId(label);
    setError(null);
    setLastResult(null);
    try {
      const r = await fn();
      setLastResult(r);
      void qc.invalidateQueries({ queryKey: ["sync-jobs"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao executar sync.");
    } finally {
      setRunningId(null);
    }
  }

  function executarSync(id: string) {
    void disparar(id, () => lanzaApi.executarSync(id, bodyOpts, { async: asyncMode }));
  }

  function executarCompleto() {
    void disparar("completo", () =>
      lanzaApi.executarSyncCompleto(bodyOpts, { async: asyncMode }),
    );
  }

  return (
    <PageHeader
      title="Sincronizações"
      description="Aciona os syncs Lanza (Rastreame, DETRAN, Pedágio, seguro). Syncs longos correm em background."
    >
      <section className="form-card sync-options">
        <h2 className="form-card__title">Opções globais</h2>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Placa (opcional)</span>
            <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} />
            <span className="field__hint">Infrações, IPVA e pedágio — uma placa</span>
          </label>
          <label className="field checkbox-label">
            <input type="checkbox" checked={asyncMode} onChange={(e) => setAsyncMode(e.target.checked)} />
            Executar em background (recomendado)
          </label>
          <label className="field checkbox-label">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry-run (simular, não grava)
          </label>
        </div>
      </section>

      <section className="sync-completo">
        <div>
          <h2 className="form-card__title">Sync completo</h2>
          <p className="field__hint">
            Equivalente à skill <code>sync</code> — pedágios primeiro, depois DETRAN, Rastreame e seguro.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={runningId !== null}
          onClick={executarCompleto}
        >
          {runningId === "completo" ? "A iniciar…" : "Executar /sync completo"}
        </button>
      </section>

      {metaQuery.isError ? (
        <QueryError
          message={
            metaQuery.error instanceof LanzaApiError
              ? metaQuery.error.message
              : "Falha ao carregar catálogo de syncs."
          }
        />
      ) : null}

      {error ? <p className="form-card__error">{error}</p> : null}

      <div className="sync-grid">
        {metaQuery.isLoading ? (
          <p className="field__hint">A carregar syncs…</p>
        ) : (
          syncs.map((s) => (
            <article key={s.id} className="sync-card">
              <header className="sync-card__head">
                <h3>{s.rotulo}</h3>
                <code className="sync-card__skill">{SKILL_ALIASES[s.id] ?? s.id}</code>
              </header>
              <p className="sync-card__destino">→ {s.destino}</p>
              {s.nota ? <p className="sync-card__nota">{s.nota}</p> : null}
              {s.interativo ? (
                <span className="badge badge--warn">Interativo (captcha/sessão)</span>
              ) : (
                <span className="badge badge--muted">Automático</span>
              )}
              <button
                type="button"
                className="btn btn--primary sync-card__btn"
                disabled={runningId !== null}
                onClick={() => executarSync(s.id)}
              >
                {runningId === s.id ? "A iniciar…" : "Executar"}
              </button>
            </article>
          ))
        )}
      </div>

      <ResultPanel title="Última resposta" data={lastResult} />

      <section className="form-card">
        <h2 className="form-card__title">Jobs recentes</h2>
        {jobs.length === 0 ? (
          <p className="field__hint">Nenhum job nesta instância da API.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sync</th>
                  <th>Status</th>
                  <th>Criado</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong>{j.sync}</strong>
                      <br />
                      <span className="field__hint">{j.id.slice(0, 8)}…</span>
                    </td>
                    <td>
                      <span className={statusBadge(j.status)}>{j.status}</span>
                    </td>
                    <td>{new Date(j.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="sync-job-error">{j.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageHeader>
  );
}
