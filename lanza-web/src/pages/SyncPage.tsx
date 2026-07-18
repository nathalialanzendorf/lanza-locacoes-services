import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { ResultPanel } from "@/components/ResultPanel";
import { useSyncJobs, useSyncMeta } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { bodySyncGlobal, opcoesSyncCompleto, ordenarSyncsPorDirecao } from "@/lib/syncUi";
import { LABEL } from "@/lib/labels";
import type { SyncCatalogEntry, SyncDirecao, SyncJob } from "@/api/types";

const SKILL_ALIASES: Record<string, string> = {
  motoristas: "sync-cliente",
  rastreaveis: "sync-veículo",
  "rastreaveis-enviar": "sync-veículo",
  fipe: "sync-fipe",
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

type SyncCardProps = {
  sync: SyncCatalogEntry;
  direcao: SyncDirecao;
  running: boolean;
  disabled: boolean;
  onExecutar: () => void;
};

function SyncCard({ sync, direcao, running, disabled, onExecutar }: SyncCardProps) {
  const acao = direcao === "enviar" ? "Enviar" : "Buscar";

  return (
    <article className="sync-card">
      <header className="sync-card__head">
        <h3>{sync.rotulo}</h3>
        <code className="sync-card__skill">{SKILL_ALIASES[sync.id] ?? sync.id}</code>
      </header>
      <p className="sync-card__destino">{sync.destino}</p>
      {sync.nota ? <p className="sync-card__nota">{sync.nota}</p> : null}
      <div className="sync-card__badges">
        <span className={direcao === "enviar" ? "badge badge--warn" : "badge badge--ok"}>{acao}</span>
        {sync.interativo ? (
          <span className="badge badge--muted">Interativo</span>
        ) : (
          <span className="badge badge--muted">Automático</span>
        )}
      </div>
      <button type="button" className="btn btn--primary sync-card__btn" disabled={disabled} onClick={onExecutar}>
        {running ? LABEL.processando : acao}
      </button>
    </article>
  );
}

type SyncSectionProps = {
  titulo: string;
  descricao: string;
  syncs: SyncCatalogEntry[];
  direcao: SyncDirecao;
  runningId: string | null;
  onExecutar: (id: string) => void;
};

function SyncSection({ titulo, descricao, syncs, direcao, runningId, onExecutar }: SyncSectionProps) {
  if (syncs.length === 0) return null;

  return (
    <section className="sync-section">
      <header className="sync-section__head">
        <h2 className="form-card__title">{titulo}</h2>
        <p className="field__hint">{descricao}</p>
      </header>
      <div className="sync-grid">
        {syncs.map((s) => (
          <SyncCard
            key={s.id}
            sync={s}
            direcao={direcao}
            running={runningId === s.id}
            disabled={runningId !== null}
            onExecutar={() => onExecutar(s.id)}
          />
        ))}
      </div>
    </section>
  );
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

  const syncs = metaQuery.data?.syncs ?? [];
  const syncsBuscar = useMemo(() => ordenarSyncsPorDirecao(syncs, "buscar"), [syncs]);
  const syncsEnviar = useMemo(() => ordenarSyncsPorDirecao(syncs, "enviar"), [syncs]);

  const globalOpts = useMemo(() => ({ dryRun, placa }), [dryRun, placa]);
  const usarAsync = asyncMode && !dryRun;

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
    void disparar(id, () => lanzaApi.executarSync(id, bodySyncGlobal(globalOpts), { async: usarAsync }));
  }

  function executarCompleto() {
    void disparar("completo", () =>
      lanzaApi.executarSyncCompleto(
        {
          ...bodySyncGlobal(globalOpts),
          opcoes: opcoesSyncCompleto(syncs, globalOpts),
        },
        { async: usarAsync },
      ),
    );
  }

  function toggleDryRun(checked: boolean) {
    setDryRun(checked);
    if (checked) setAsyncMode(false);
  }

  return (
    <PageHeader
      title="Sincronizações"
      description="Buscar dados de fontes externas ou enviar alterações locais ao Rastreame."
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
            <input
              type="checkbox"
              checked={asyncMode}
              disabled={dryRun}
              onChange={(e) => setAsyncMode(e.target.checked)}
            />
            Executar em background (recomendado)
          </label>
          <label className="field checkbox-label">
            <input type="checkbox" checked={dryRun} onChange={(e) => toggleDryRun(e.target.checked)} />
            Dry-run (simular, não grava)
          </label>
        </div>
        {dryRun ? (
          <p className="field__hint sync-dryrun-hint">
            Dry-run executa em modo síncrono e exibe o resultado JSON abaixo — nada é gravado.
          </p>
        ) : null}
      </section>

      <section className="sync-completo">
        <div>
          <h2 className="form-card__title">Sync completo</h2>
          <p className="field__hint">
            Busca (DETRAN, pedágio, FIPE, rastreáveis…) e envia (motoristas, gastos, manutenção) na ordem
            definida.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={runningId !== null}
          onClick={executarCompleto}
        >
          {runningId === "completo" ? LABEL.processando : "Executar sync completo"}
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

      {metaQuery.isLoading ? (
        <p className="field__hint">A carregar syncs…</p>
      ) : (
        <>
          <SyncSection
            titulo="Buscar dados"
            descricao="Puxa informações para o database local (DETRAN, pedágio, FIPE). Rastreáveis: pull do Rastreame (sem FIPE)."
            syncs={syncsBuscar}
            direcao="buscar"
            runningId={runningId}
            onExecutar={executarSync}
          />
          <SyncSection
            titulo="Enviar dados"
            descricao="Espelha o database local no Rastreame (motoristas, rastreáveis, gastos gerais, manutenção)."
            syncs={syncsEnviar}
            direcao="enviar"
            runningId={runningId}
            onExecutar={executarSync}
          />
        </>
      )}

      <ResultPanel title={dryRun ? "Resultado (dry-run)" : "Última resposta"} data={lastResult} />

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
