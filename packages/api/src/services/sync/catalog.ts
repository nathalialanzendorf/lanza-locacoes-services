export type SyncId =
  | "motoristas"
  | "rastreaveis"
  | "rastreaveis-enviar"
  | "fipe"
  | "recebimentos"
  | "pedagios"
  | "infracoes"
  | "ipva-licenciamento"
  | "detran-rs"
  | "seguro"
  | "manutencao";

export const SYNC_IDS: readonly SyncId[] = [
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "motoristas",
  "rastreaveis",
  "rastreaveis-enviar",
  "fipe",
  "recebimentos",
  "seguro",
  "manutencao",
] as const;

export const SYNC_COMPLETO_ORDEM: readonly SyncId[] = [
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "rastreaveis",
  "fipe",
  "seguro",
  "motoristas",
  "rastreaveis-enviar",
  "recebimentos",
  "manutencao",
];

export type SyncDirecao = "buscar" | "enviar";

export type SyncCatalogEntry = {
  id: SyncId;
  rotulo: string;
  destino: string;
  interativo: boolean;
  direcao: SyncDirecao;
  nota?: string;
};

export const SYNC_CATALOG: SyncCatalogEntry[] = [
  {
    id: "pedagios",
    rotulo: "Pedágio Digital",
    destino: "cliente-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "Sessão BFF expira em minutos; modo offline com jsonPath",
  },
  {
    id: "infracoes",
    rotulo: "Infrações DETRAN SC",
    destino: "infracoes.json + cliente-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "Captcha/ticket por placa; frota SC automática",
  },
  {
    id: "ipva-licenciamento",
    rotulo: "IPVA e licenciamento DETRAN SC",
    destino: "parceiro-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "Captcha/ticket por placa",
  },
  {
    id: "detran-rs",
    rotulo: "DETRAN RS (IPVA/lic. + resumo infrações)",
    destino: "parceiro-despesas.json",
    interativo: false,
    direcao: "buscar",
    nota: "Apenas ufRegistro=RS",
  },
  {
    id: "motoristas",
    rotulo: "Clientes → Rastreame",
    destino: "clientes.json → Rastreame",
    interativo: false,
    direcao: "enviar",
    nota: "Apenas envio — não busca dados do Rastreame.",
  },
  {
    id: "rastreaveis",
    rotulo: "Rastreáveis ← Rastreame",
    destino: "Rastreame → veiculos.json",
    interativo: false,
    direcao: "buscar",
    nota: "Pull de rastreáveis. Não inclui FIPE — use o sync FIPE à parte.",
  },
  {
    id: "rastreaveis-enviar",
    rotulo: "Rastreáveis → Rastreame",
    destino: "veiculos.json → Rastreame",
    interativo: false,
    direcao: "enviar",
    nota: "Push de veículos ativos. Inativos não são enviados ao Rastreame.",
  },
  {
    id: "fipe",
    rotulo: "FIPE (frota ativa)",
    destino: "veiculos.json",
    interativo: false,
    direcao: "buscar",
    nota: "Separado do sync Rastreame; só veículos ativos",
  },
  {
    id: "recebimentos",
    rotulo: "Gastos gerais → Rastreame",
    destino: "cliente-despesas.json → Rastreame",
    interativo: false,
    direcao: "enviar",
    nota: "Apenas envio — não busca gastos do Rastreame.",
  },
  {
    id: "seguro",
    rotulo: "Comprovantes de seguro (PDF)",
    destino: "parceiro-despesas.json",
    interativo: false,
    direcao: "buscar",
    nota: "Lê PDFs em seguroComprovantesDir (config/lanza_paths.json)",
  },
  {
    id: "manutencao",
    rotulo: "Manutenção → Rastreame",
    destino: "parceiro-despesas.json → Rastreame (Manutenção)",
    interativo: false,
    direcao: "enviar",
    nota: "Apenas envio de despesas de parceiro.",
  },
];

export function normalizarSyncId(raw: string): SyncId | null {
  const k = raw.trim().toLowerCase();
  if (k === "gastos-gerais" || k === "sync-recebimentos") return "recebimentos";
  if (k === "sync-cliente" || k === "sync-motoristas") return "motoristas";
  if (k === "sync-rastreaveis") return "rastreaveis";
  if (k === "rastreaveis-enviar" || k === "sync-rastreaveis-push" || k === "rastreaveis-push") {
    return "rastreaveis-enviar";
  }
  if (k === "sync-fipe" || k === "atualizar-fipe-veiculos") return "fipe";
  if (k === "sync-pedagios") return "pedagios";
  if (k === "sync-infracoes") return "infracoes";
  if (k === "sync-ipva-licenciamento") return "ipva-licenciamento";
  if (k === "sync-detran-rs") return "detran-rs";
  if (k === "sync-seguro") return "seguro";
  if (k === "sync-manutencao") return "manutencao";
  return (SYNC_IDS as readonly string[]).includes(k) ? (k as SyncId) : null;
}

export function syncDirecaoDefaults(id: SyncId): { pullOnly: boolean; pushOnly: boolean } {
  const entry = SYNC_CATALOG.find((s) => s.id === id);
  if (entry?.direcao === "enviar") {
    return { pullOnly: false, pushOnly: true };
  }
  return { pullOnly: true, pushOnly: false };
}

export function metaSync() {
  return {
    syncs: SYNC_CATALOG,
    ordemCompleto: SYNC_COMPLETO_ORDEM,
  };
}
