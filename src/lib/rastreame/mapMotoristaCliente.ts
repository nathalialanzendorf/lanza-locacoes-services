/**
 * Converte motorista Rastreame → registro de database/clientes.json.
 */
import type { MotoristaRastreame } from "./motorista.js";

export type ClienteImportado = Record<string, unknown> & {
  id?: string;
  nome?: string;
  cpf?: string;
  rastreameMotoristaKey?: string;
  rastreameMotoristaId?: string | number;
};

function isoToBr(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

function formatCpf(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Extrai campos gravados em `observacao` pelo postMotorista (montarObservacao). */
export function parseObservacaoRastreame(obs: string): Partial<ClienteImportado> {
  const out: Partial<ClienteImportado> = { endereco: {} };
  const end = out.endereco as Record<string, string | null>;

  for (const raw of obs.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const cpfM = line.match(/^CPF:\s*(.+)$/i);
    if (cpfM) {
      const fmt = formatCpf(cpfM[1]!);
      if (fmt) out.cpf = fmt;
      continue;
    }

    const rgM = line.match(/^RG:\s*(.+)$/i);
    if (rgM) {
      const parts = rgM[1]!.trim().split(/\s+/);
      out.rg = parts[0];
      if (parts.length > 1) out.rgOrgaoExpedidor = parts.slice(1).join(" ");
      continue;
    }

    const nascM = line.match(/^Nascimento:\s*(.+)$/i);
    if (nascM) {
      const [data, local] = nascM[1]!.split(" - ").map((s) => s.trim());
      out.dataNascimento = data;
      if (local) out.localNascimento = local;
      continue;
    }

    if (/^1a Habilitacao:/i.test(line)) {
      if (!out.cnh) out.cnh = {};
      (out.cnh as Record<string, string>).primeiraHabilitacao = line.replace(/^1a Habilitacao:\s*/i, "");
      continue;
    }
    if (/^Emissao CNH:/i.test(line)) {
      if (!out.cnh) out.cnh = {};
      (out.cnh as Record<string, string>).dataEmissao = line.replace(/^Emissao CNH:\s*/i, "");
      continue;
    }
    if (/^Espelho:/i.test(line)) {
      if (!out.cnh) out.cnh = {};
      (out.cnh as Record<string, string>).numeroEspelho = line.replace(/^Espelho:\s*/i, "");
      continue;
    }
    if (/^Orgao emissor:/i.test(line)) {
      const rest = line.replace(/^Orgao emissor:\s*/i, "");
      const [org, uf] = rest.split("/");
      if (!out.cnh) out.cnh = {};
      const cnh = out.cnh as Record<string, string>;
      cnh.orgaoEmissor = org?.trim() ?? "";
      cnh.ufEmissor = uf?.trim() ?? "";
      continue;
    }
    if (/^Filiacao:/i.test(line)) {
      out.filiacao = line.replace(/^Filiacao:\s*/i, "");
      continue;
    }
    if (/^Telefone:/i.test(line)) {
      out.telefone = line.replace(/^Telefone:\s*/i, "");
      continue;
    }

    const endM = line.match(/^Endereco:\s*(.+)$/i);
    if (endM) {
      const rest = endM[1]!.trim();
      const dash = rest.lastIndexOf(" - ");
      if (dash >= 0) {
        const antes = rest.slice(0, dash);
        const depois = rest.slice(dash + 3);
        const slash = depois.lastIndexOf("/");
        if (slash >= 0) {
          end.cidade = depois.slice(0, slash).trim();
          const ufCep = depois.slice(slash + 1).trim().split(/\s+/);
          end.uf = ufCep[0] ?? null;
          end.cep = ufCep[1] ?? null;
        }
        const commaParts = antes.split(",");
        end.logradouro = commaParts[0]?.trim() ?? null;
        if (commaParts.length > 1) {
          const numBairro = commaParts.slice(1).join(",").trim().split(/\s+/);
          end.numero = numBairro[0] ?? null;
          end.bairro = numBairro.slice(1).join(" ") || null;
        }
      }
    }
  }

  if (Object.values(end).every((v) => !v)) delete out.endereco;
  return out;
}

export function motoristaToCliente(m: MotoristaRastreame): ClienteImportado | null {
  const nome = (m.nome ?? "").trim();
  if (!nome) return null;

  const parsed = parseObservacaoRastreame(m.observacao ?? "");
  const cnhNum = String(m.cnh ?? "").replace(/\D/g, "");
  const categoria =
    m.categoriaCnh?.key ?? m.categoriaCnh?.value ?? (parsed.cnh as Record<string, string> | undefined)?.categoria;
  const validade = isoToBr(m.vencimentoCnh);

  const cliente: ClienteImportado = {
    nome,
    cpf: parsed.cpf,
    rg: parsed.rg,
    rgOrgaoExpedidor: parsed.rgOrgaoExpedidor,
    dataNascimento: parsed.dataNascimento,
    localNascimento: parsed.localNascimento,
    filiacao: parsed.filiacao,
    telefone: parsed.telefone ?? null,
    email: null,
    endereco: parsed.endereco ?? {
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
    },
    cnh: {
      numeroRegistro: cnhNum || undefined,
      categoria: categoria ?? undefined,
      validade: validade ?? undefined,
      ...((parsed.cnh ?? {}) as Record<string, unknown>),
    },
    rastreameMotoristaKey: m.key != null ? String(m.key) : undefined,
    rastreameMotoristaId: m.id,
    origemImportacao: "rastreame",
  };

  if (!cliente.cpf && !cnhNum) return null;
  if (!cliente.cpf) delete cliente.cpf;
  return cliente;
}

export function normCpfKey(cpf: string): string {
  return cpf.replace(/\D/g, "");
}
