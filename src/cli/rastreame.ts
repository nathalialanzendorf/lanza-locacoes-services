/**
 * Integração rastreame.com.br — port de rastreame.py
 */
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://rastreame.com.br";
const BASE = `${ORIGIN}/keek/rest/motorista`;
const LOGIN_URL = `${ORIGIN}/auth/rest/login/v2/keek/America@Recife`;

let tokenCache: string | null = null;

async function login(): Promise<string | null> {
  const lg = process.env.RASTREAME_LOGIN;
  const sn = process.env.RASTREAME_SENHA;
  if (!lg || !sn) return null;
  const authz = Buffer.from(`${lg}&#58;${sn}&#58;${ORIGIN}`, "utf8").toString("base64");
  try {
    const r = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "0",
        authorization: authz,
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/149.0.0.0",
      },
      body: "",
    });
    const raw = await r.text();
    if (!r.ok) {
      console.error(
        `ERRO login rastreame [HTTP ${r.status}]:`,
        raw.slice(0, 200),
      );
      return null;
    }
    const d = JSON.parse(raw) as { accessToken?: string };
    return d.accessToken ?? null;
  } catch (e) {
    console.error("ERRO login rastreame:", e);
    return null;
  }
}

async function token(): Promise<string> {
  if (tokenCache) return tokenCache;
  const t = process.env.RASTREAME_AUTH || (await login());
  if (!t) {
    console.error(
      "ERRO: defina RASTREAME_LOGIN + RASTREAME_SENHA (ou RASTREAME_AUTH) nas variáveis de ambiente.",
    );
    process.exit(2);
  }
  tokenCache = t;
  return t;
}

async function headers(post: boolean): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-r2f-auth": await token(),
    "X-r2f-ns": "null",
    Referer: "https://rastreame.com.br/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/149.0.0.0",
  };
  if (post) h.Origin = "https://rastreame.com.br";
  return h;
}

function digits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

type Motorista = { id?: string; nome?: string; cnh?: string };

async function listar(): Promise<Motorista[]> {
  const r = await fetch(`${BASE}?ativo=true&size=2000`, {
    headers: await headers(false),
  });
  const d = (await r.json()) as { content?: Motorista[] } | Motorista[];
  if (Array.isArray(d)) return d;
  return d.content ?? [];
}

async function achar(cnh: string, nome: string): Promise<Motorista | null> {
  const cnhD = digits(cnh);
  const nomeN = nome.trim().toLowerCase();
  for (const m of await listar()) {
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

async function add(clienteJson: string): Promise<void> {
  const c = JSON.parse(fs.readFileSync(clienteJson, "utf8")) as Cliente;
  const cnh = (c.cnh ?? {}) as Record<string, string>;
  const ja = await achar(cnh.numeroRegistro ?? "", String(c.nome ?? ""));
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
  const r = await fetch(`${BASE}/`, {
    method: "POST",
    headers: await headers(true),
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

export async function main(argv: string[]): Promise<void> {
  if (argv.length < 1) {
    console.error(`Uso:
  rastreame check <cnh> ["nome"]
  rastreame add <cliente.json>`);
    process.exit(2);
  }
  const cmd = argv[0]!;
  if (cmd === "check") {
    const cnh = argv[1] ?? "";
    const nome = argv[2] ?? "";
    const m = await achar(cnh, nome);
    console.log(
      m ? `JA CADASTRADO: ${m.nome} (id ${m.id})` : "NAO CADASTRADO",
    );
  } else if (cmd === "add") {
    await add(path.resolve(argv[1]!));
  } else {
    console.error("Comando desconhecido:", cmd);
    process.exit(2);
  }
}
