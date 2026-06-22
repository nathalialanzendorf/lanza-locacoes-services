/**
 * API /keek/rest/motorista — listagem e cadastro de motorista.
 */
import fs from "node:fs";

import { RASTREAME_ORIGIN, rastreameJsonHeaders } from "./auth.js";

const MOTORISTA_BASE = `${RASTREAME_ORIGIN}/keek/rest/motorista`;

function digits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

export type Motorista = { id?: string; key?: string; nome?: string; cnh?: string };

export async function listMotoristas(): Promise<Motorista[]> {
  const r = await fetch(`${MOTORISTA_BASE}?ativo=true&size=2000`, {
    headers: await rastreameJsonHeaders(false),
  });
  const d = (await r.json()) as { content?: Motorista[] } | Motorista[];
  if (Array.isArray(d)) return d;
  return d.content ?? [];
}

export async function findMotorista(
  cnh: string,
  nome: string,
): Promise<Motorista | null> {
  const cnhD = digits(cnh);
  const nomeN = nome.trim().toLowerCase();
  for (const m of await listMotoristas()) {
    if (cnhD && digits(String(m.cnh ?? "")) === cnhD) return m;
    if (nomeN && (m.nome ?? "").trim().toLowerCase() === nomeN) return m;
  }
  return null;
}

function br2iso(d: string | undefined): string | null {
  const m = (d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

type Cliente = Record<string, unknown>;

function montarObservacao(c: Cliente): string {
  const cnh = (c.cnh ?? {}) as Record<string, string>;
  const linhas: string[] = [];
  if (c.cpf) linhas.push(`CPF: ${c.cpf}`);
  if (c.rg) {
    let s = `RG: ${c.rg}`;
    if (c.rgOrgaoExpedidor) s += ` ${c.rgOrgaoExpedidor}`;
    linhas.push(s);
  }
  if (c.dataNascimento) {
    let s = `Nascimento: ${c.dataNascimento}`;
    if (c.localNascimento) s += ` - ${c.localNascimento}`;
    linhas.push(s);
  }
  if (cnh.primeiraHabilitacao) {
    linhas.push(`1a Habilitacao: ${cnh.primeiraHabilitacao}`);
  }
  if (cnh.dataEmissao) linhas.push(`Emissao CNH: ${cnh.dataEmissao}`);
  if (cnh.numeroEspelho) linhas.push(`Espelho: ${cnh.numeroEspelho}`);
  if (cnh.orgaoEmissor || cnh.ufEmissor) {
    linhas.push(
      `Orgao emissor: ${cnh.orgaoEmissor ?? ""}/${cnh.ufEmissor ?? ""}`,
    );
  }
  if (c.filiacao) linhas.push(`Filiacao: ${c.filiacao}`);
  if (c.telefone) linhas.push(`Telefone: ${c.telefone}`);
  const end = (c.endereco ?? {}) as Record<string, string>;
  if (Object.values(end).some(Boolean)) {
    const e = `${end.logradouro ?? ""}, ${end.numero ?? ""} ${end.bairro ?? ""} - ${end.cidade ?? ""}/${end.uf ?? ""} ${end.cep ?? ""}`;
    linhas.push("Endereco: " + e.replace(/\s+/g, " ").trim());
  }
  return linhas.join("\n");
}

export async function postMotorista(clienteJsonPath: string): Promise<void> {
  const c = JSON.parse(
    fs.readFileSync(clienteJsonPath, "utf8"),
  ) as Cliente;
  const cnh = (c.cnh ?? {}) as Record<string, string>;
  const ja = await findMotorista(cnh.numeroRegistro ?? "", String(c.nome ?? ""));
  if (ja) {
    console.log(
      `JA CADASTRADO no rastreame: ${ja.nome} (id ${ja.id}) — nada a fazer.`,
    );
    return;
  }
  const payload = {
    nome: c.nome,
    cnh: cnh.numeroRegistro,
    categoriaCnh: { key: cnh.categoria },
    observacao: montarObservacao(c),
    vencimentoCnh: br2iso(cnh.validade),
    vencimentoToxicologico: null,
  };
  const r = await fetch(`${MOTORISTA_BASE}/`, {
    method: "POST",
    headers: await rastreameJsonHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  if (!r.ok) {
    console.error(`ERRO HTTP ${r.status} ao cadastrar:`, body.slice(0, 300));
    if (r.status === 401 || r.status === 403) {
      console.error(">> Token expirado? Atualize RASTREAME_AUTH.");
    }
    process.exit(1);
  }
  console.log(`CADASTRADO no rastreame [HTTP ${r.status}]: ${payload.nome}`);
  console.log(body.slice(0, 300));
}
