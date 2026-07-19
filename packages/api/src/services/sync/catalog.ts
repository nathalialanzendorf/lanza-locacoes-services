export type SyncId =
  | "motoristas"
  | "rastreaveis"
  | "rastreaveis-enviar"
  | "fipe"
  | "recebimentos"
  | "pedagios"
  | "estacionamento"
  | "infracoes"
  | "ipva-licenciamento"
  | "detran-rs"
  | "seguro"
  | "manutencao";

export const RASTREAME_SYNC_IDS: readonly SyncId[] = [
  "motoristas",
  "rastreaveis",
  "rastreaveis-enviar",
  "recebimentos",
  "manutencao",
] as const;

export const SYNC_IDS: readonly SyncId[] = [
  "pedagios",
  "estacionamento",
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
  "estacionamento",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "fipe",
  "seguro",
];

export type SyncDirecao = "buscar" | "enviar";

export type SyncCatalogEntry = {
  id: SyncId;
  rotulo: string;
  destino: string;
  interativo: boolean;
  direcao: SyncDirecao;
  nota?: string;
  /** Integração Rastreame descontinuada — evitar uso. */
  depreciado?: boolean;
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
    id: "estacionamento",
    rotulo: "SigaPay",
    destino: "cliente-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "ACT/avisos Zona Azul; sessão via SIGAPAY_COOKIE+TOKEN ou jsonPath offline",
  },
  {
    id: "infracoes",
    rotulo: "Infrações ← DETRAN SC",
    destino: "infracoes.json + cliente-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "Captcha/ticket por placa; frota SC automática",
  },
  {
    id: "ipva-licenciamento",
    rotulo: "IPVA e licenciamento ← DETRAN SC",
    destino: "parceiro-despesas.json",
    interativo: true,
    direcao: "buscar",
    nota: "Captcha/ticket por placa",
  },
  {
    id: "detran-rs",
    rotulo: "Infrações, IPVA e licenciamento ← DETRAN RS",
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
    depreciado: true,
    nota: "Descontinuado — Lanza não espelha mais no Rastreame.",
  },
  {
    id: "rastreaveis",
    rotulo: "Rastreáveis ← Rastreame",
    destino: "Rastreame → veiculos.json",
    interativo: false,
    direcao: "buscar",
    depreciado: true,
    nota: "Descontinuado — não busca mais dados do Rastreame.",
  },
  {
    id: "rastreaveis-enviar",
    rotulo: "Rastreáveis → Rastreame",
    destino: "veiculos.json → Rastreame",
    interativo: false,
    direcao: "enviar",
    depreciado: true,
    nota: "Descontinuado — Lanza não envia mais veículos ao Rastreame.",
  },
  {
    id: "fipe",
    rotulo: "Tabela FIPE",
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
    depreciado: true,
    nota: "Descontinuado — despesas ficam só no Lanza.",
  },
  {
    id: "seguro",
    rotulo: "Boletos seguro",
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
    depreciado: true,
    nota: "Descontinuado — despesas de parceiro ficam só no Lanza.",
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
  if (k === "sync-estacionamento" || k === "sync-sigapay") return "estacionamento";
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
