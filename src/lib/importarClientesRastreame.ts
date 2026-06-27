import { syncMotoristas } from "../lib/rastreame/motoristasSync.js";

export type ImportarClientesResult = {
  totalRastreame: number;
  importados: number;
  atualizados: number;
  ignorados: { nome: string; motivo: string }[];
};

/** @deprecated Preferir `sync-motoristas --pull-only`. */
export async function importarClientesRastreame(opts?: {
  dryRun?: boolean;
}): Promise<ImportarClientesResult> {
  const r = await syncMotoristas({
    dryRun: opts?.dryRun,
    pull: true,
    push: false,
  });

  return {
    totalRastreame: r.pull.novos + r.pull.atualizados + r.pull.ignorados,
    importados: r.pull.novos,
    atualizados: r.pull.atualizados,
    ignorados: r.pull.erros.map((e) => {
      const [nome, ...rest] = e.split(":");
      return { nome: nome?.trim() ?? e, motivo: rest.join(":").trim() || "erro" };
    }),
  };
}
