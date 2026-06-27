# DETRAN SC — referência técnica

## Base URL

```
https://backend.detran.sc.gov.br/transito-api
```

Origin / Referer: `https://servicos.detran.sc.gov.br/`

## Endpoints (confirmados 27/06/2026)

| Etapa | Método | Path |
|-------|--------|------|
| Iniciar consulta | GET | `/veiculo/requisitar-consulta?p={placa}&r={renavam}&c={captcha}&v=` → devolve o ticket (UUID) |
| Resposta | GET | `/veiculo/resposta-consulta?t={uuid}` → dados do veículo |

> O endpoint antigo `POST /veiculo/consulta` foi **descontinuado** (responde HTTP 404).

Headers: `Authorization`, `X-Empresa`, `X-App-Version` (ver [README.md](README.md)).

## Captcha: obrigatório para INICIAR consulta nova (confirmado 28/06/2026)

O parâmetro **`c`** do `requisitar-consulta` é um **token Cloudflare Turnstile** gerado no
browser. Comportamento real observado:

- **Com consulta já pendente** para a placa (ex.: logo após consultar no portal), o
  `requisitar-consulta?p=PLACA` **sem `c`** devolve o ticket pendente:
  `200 {"pendente":true,"token":"<uuid>"}` → e a `resposta-consulta?t=<uuid>` traz os dados.
- **Sem consulta pendente**, o backend exige o captcha → responde **`Captcha inválido`**.

Consequência: **a varredura 100% automática da frota NÃO funciona** — placas sem
pendência retornam "Captcha inválido". O captcha só nasce no browser. Portanto:

| Caso | Como |
|------|------|
| Frota (todas as placas) | capturar no browser (`scripts/capturarDetranConsole.js` + `baixarDetranData()`) e `processarDetranTickets.ts --data …` |
| Uma placa **logo após** consultar no portal | `sync-infracoes --placa PLACA` (reaproveita o ticket pendente, sem captcha) |
| Ticket `t` capturado no DevTools | `sync-infracoes --ticket <t> --placa PLACA` |
| Resposta JSON salva (offline) | `sync-infracoes --json arquivo.json --placa PLACA` |

> O código tenta `requisitar-consulta` sem captcha primeiro; se a placa não tiver
> pendência, devolve `Captcha inválido` (por placa, como aviso no modo frota). Token
> `DETRAN_SC_AUTH` expira ~5 h → `HTTP 401` = recapturar.

## TLS

Nesta máquina há interceção TLS (proxy/antivírus) → `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
Defina **`DETRAN_SC_TLS_INSECURE=1`** (a tool também aceita `RASTREAME_TLS_INSECURE=1` como fallback).

## Classificação `debitos[]`

| Texto | sync-infracoes | sync-ipva-licenciamento |
|-------|----------------|-------------------------|
| multa / `numeroAuto` | ✅ | ❌ |
| IPVA | ❌ | ✅ |
| Licenciamento | ❌ | ✅ |
| DPVAT, taxa DETRAN, CRLV | ❌ | ❌ |

## Módulos

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranSc/auth.ts` | Env + headers |
| `src/lib/detranSc/consulta.ts` | POST + poll |
| `src/lib/detranSc/mapInfracoes.ts` | Infrações |
| `src/lib/detranSc/mapDebitosProprietario.ts` | IPVA/licenciamento |
| `src/lib/detranSc/syncVeiculo.ts` | Orquestra infrações |
| `src/lib/detranSc/syncDespesasVeiculo.ts` | Orquestra parceiro |
| `src/cli/syncInfracoes.ts` | CLI infrações |
| `src/cli/syncIpvaLicenciamento.ts` | CLI IPVA/licenciamento |

## Capturar token

1. [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/) logado.
2. DevTools → Network → `transito-api`.
3. Consultar veículo → copiar `Authorization` (JWT) e `X-Empresa`.

Debug offline: `--json relatorios/_tmp/_detran_resposta.json`.
