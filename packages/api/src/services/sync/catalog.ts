export type SyncId =
  | "motoristas"
  | "rastreaveis"
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
  "recebimentos",
  "seguro",
  "manutencao",
] as const;

export const SYNC_COMPLETO_ORDEM: readonly SyncId[] = [
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "motoristas",
  "rastreaveis",
  "recebimentos",
  "seguro",
  "manutencao",
];

export type SyncCatalogEntry = {
  id: SyncId;
  rotulo: string;
  destino: string;
  interativo: boolean;
  nota?: string;
};

export const SYNC_CATALOG: SyncCatalogEntry[] = [
  {
    id: "pedagios",
    rotulo: "Pedágio Digital",
    destino: "cliente-despesas.json",
    interativo: true,
    nota: "Sessão BFF expira em minutos; modo offline com jsonPath",
  },
  {
    id: "infracoes",
    rotulo: "Infrações DETRAN SC",
    destino: "infracoes.json + cliente-despesas.json",
    interativo: true,
    nota: "Captcha/ticket por placa; frota SC automática",
  },
  {
    id: "ipva-licenciamento",
    rotulo: "IPVA e licenciamento DETRAN SC",
    destino: "parceiro-despesas.json",
    interativo: true,
    nota: "Captcha/ticket por placa",
  },
  {
    id: "detran-rs",
    rotulo: "DETRAN RS (IPVA/lic. + resumo infrações)",
    destino: "parceiro-despesas.json",
    interativo: false,
    nota: "Apenas ufRegistro=RS",
  },
  {
    id: "motoristas",
    rotulo: "Motoristas Rastreame",
    destino: "clientes.json",
    interativo: false,
  },
  {
    id: "rastreaveis",
    rotulo: "Rastreáveis Rastreame + FIPE",
    destino: "veiculos.json",
    interativo: false,
  },
  {
    id: "recebimentos",
    rotulo: "Gastos gerais Rastreame",
    destino: "cliente-despesas.json",
    interativo: false,
  },
  {
    id: "seguro",
    rotulo: "Comprovantes de seguro (PDF)",
    destino: "parceiro-despesas.json",
    interativo: false,
    nota: "Lê PDFs em seguroComprovantesDir (config/lanza_paths.json)",
  },
  {
    id: "manutencao",
    rotulo: "Manutenção parceiro → Rastreame",
    destino: "Rastreame (tela Manutenção)",
    interativo: false,
  },
];

export function normalizarSyncId(raw: string): SyncId | null {
  const k = raw.trim().toLowerCase();
  if (k === "gastos-gerais" || k === "sync-recebimentos") return "recebimentos";
  if (k === "sync-motoristas") return "motoristas";
  if (k === "sync-rastreaveis") return "rastreaveis";
  if (k === "sync-pedagios") return "pedagios";
  if (k === "sync-infracoes") return "infracoes";
  if (k === "sync-ipva-licenciamento") return "ipva-licenciamento";
  if (k === "sync-detran-rs") return "detran-rs";
  if (k === "sync-seguro") return "seguro";
  if (k === "sync-manutencao") return "manutencao";
  return (SYNC_IDS as readonly string[]).includes(k) ? (k as SyncId) : null;
}

export function metaSync() {
  return {
    syncs: SYNC_CATALOG,
    ordemCompleto: SYNC_COMPLETO_ORDEM,
  };
}
