import {
  compactPlaca,
  excluirPlacaSigapayPorPlaca,
  findVeiculoByPlaca,
  formatPlacaHyphen,
  listarAvisos,
  listarAvisosLote,
  listarVeiculosSigapay,
  loadPlacasParaSyncEstacionamento,
  placasIguais,
  registrarPlacaSigapay,
  solicitarCodigoPixRegularizacao,
  verificarCodigoPixRegularizacao,
  type AvisoStatus,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

function modeloComposto(v: {
  modelo?: string;
  marca?: string;
  marcaModelo?: string;
  ano?: number | string;
  anoModelo?: string;
  cor?: string;
}): string | null {
  let modelo = v.modelo?.trim();
  if (!modelo && v.marcaModelo) {
    const mm = String(v.marcaModelo).trim();
    modelo = mm.includes("/") ? mm.split("/").slice(1).join("/").trim() : mm;
  }
  if (!modelo) return null;
  const ano = v.ano ?? (v.anoModelo ? String(v.anoModelo).split("/")[0]?.trim() : undefined);
  return [modelo, v.marca, ano, v.cor]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean)
    .join(" ");
}

export async function listarVeiculosPortal() {
  const items = await listarVeiculosSigapay();
  return { total: items.length, items };
}

export async function registrarVeiculoPortal(input: {
  placa: string;
  modelo?: string;
  apelido?: string;
}) {
  const placa = input.placa?.trim();
  if (!placa) throw new HttpError(400, 'Campo "placa" é obrigatório');

  const local = findVeiculoByPlaca(placa);
  const modelo = input.modelo?.trim() ?? (local ? modeloComposto(local) : null);

  const r = await registrarPlacaSigapay({
    placa,
    modelo: modelo ?? undefined,
    apelido: input.apelido,
  });
  if (!r.ok) {
    throw new HttpError(r.status || 502, `Falha ao registrar placa: ${r.body.slice(0, 200)}`);
  }
  return r;
}

export async function excluirVeiculoPortal(placa: string, dryRun = false) {
  if (!placa?.trim()) throw new HttpError(400, "Placa obrigatória");
  if (dryRun) {
    const lista = await listarVeiculosSigapay();
    const v = lista.find((x) => placasIguais(x.placa, placa));
    return {
      dryRun: true,
      placa: formatPlacaHyphen(placa),
      encontrada: Boolean(v),
      id: v?.id ?? null,
    };
  }
  return excluirPlacaSigapayPorPlaca(placa);
}

export async function listarAvisosPlaca(placa: string, status: AvisoStatus = "aberto") {
  if (!placa?.trim()) throw new HttpError(400, "Placa obrigatória");
  const items = await listarAvisos(placa, { status });
  return { placa: formatPlacaHyphen(placa), status, total: items.length, items: serializarAvisos(items) };
}

function serializarAvisos(items: Awaited<ReturnType<typeof listarAvisos>>) {
  return items.map(({ id, placa, dataHoraRaw, dataHoraIso, valor, local, emAberto }) => ({
    id,
    placa,
    dataHoraRaw,
    dataHoraIso,
    valor,
    local,
    emAberto,
  }));
}

export async function listarAvisosFrota(status: AvisoStatus = "aberto", placaFiltro?: string) {
  const placas = loadPlacasParaSyncEstacionamento(placaFiltro);
  const items = placas.length ? await listarAvisosLote(placas, { status }) : [];
  return {
    placas: placas.map(formatPlacaHyphen),
    status,
    total: items.length,
    items: serializarAvisos(items),
  };
}

export async function conferirPlacasPortal(registrar = false) {
  const locais = loadPlacasParaSyncEstacionamento();
  const portal = await listarVeiculosSigapay();
  const portalSet = new Set(portal.map((v) => compactPlaca(v.placa)));
  const localSet = new Set(locais.map((p) => compactPlaca(p)));

  const faltam = locais.filter((p) => !portalSet.has(compactPlaca(p)));
  const extras = portal.filter((v) => !localSet.has(compactPlaca(v.placa)));

  const registrados: { placa: string; ok: boolean; detalhe?: string }[] = [];
  if (registrar && faltam.length) {
    for (const p of faltam) {
      const local = findVeiculoByPlaca(p);
      const modelo = local ? modeloComposto(local) : null;
      if (!modelo) {
        registrados.push({
          placa: formatPlacaHyphen(p),
          ok: false,
          detalhe: "sem modelo em veiculos.json",
        });
        continue;
      }
      try {
        const r = await registrarPlacaSigapay({ placa: p, modelo });
        registrados.push({
          placa: r.placa,
          ok: r.ok,
          detalhe: r.ok ? undefined : `HTTP ${r.status}`,
        });
      } catch (e) {
        registrados.push({
          placa: formatPlacaHyphen(p),
          ok: false,
          detalhe: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return {
    local: locais.length,
    portal: portal.length,
    cadastradas: locais.length - faltam.length,
    faltam: faltam.map(formatPlacaHyphen),
    extras: extras.map((v) => ({ placa: v.placa, modelo: v.modelo })),
    registrados,
  };
}

export async function solicitarPixRegularizacao(body: { phone?: string; plate?: string }) {
  const phone = body.phone?.trim();
  const plate = body.plate?.trim();
  if (!phone) throw new HttpError(400, 'Campo "phone" é obrigatório.');
  if (!plate) throw new HttpError(400, 'Campo "plate" é obrigatório.');

  try {
    const data = await solicitarCodigoPixRegularizacao(phone, plate);
    return { data };
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}

export async function verificarPixRegularizacao(body: { id?: string; code?: string }) {
  const id = body.id?.trim();
  const code = body.code?.trim();
  if (!id) throw new HttpError(400, 'Campo "id" é obrigatório.');
  if (!code) throw new HttpError(400, 'Campo "code" é obrigatório.');

  try {
    const data = await verificarCodigoPixRegularizacao(id, code);
    return { data };
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}
