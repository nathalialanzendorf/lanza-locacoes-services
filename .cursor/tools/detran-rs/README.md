# Tool — DETRAN RS (PROCERGS / pcsdetran)

API REST em [pcsdetran.procergs.com.br](https://pcsdetran.procergs.com.br/) (portal `pcsdetran.rs.gov.br`). Consulta **placa + RENAVAM** de `database/veiculos.json`.

Diferente do DETRAN SC: é **uma única chamada GET** por veículo, **sem ticket nem captcha**.

```
GET /pcsdetran/rest/veiculos/{PLACA}/?renavam={RENAVAM}&contabiliza=false
```

| CLI | Destino | Conteúdo |
|-----|---------|----------|
| `sync-detran-rs` | `database/parceiro-despesas.json` (IPVA, Licenciamento) | IPVA em aberto + taxa de licenciamento |

Referência API: [reference.md](reference.md)

## Quando usar (roteamento por UF)

O campo **`ufRegistro`** do veículo (`database/veiculos.json`) decide a tool:

- `SC` ou ausente → tool **detran-sc**.
- `RS` → tool **detran-rs** (esta).

Os comandos `sync-infracoes` e `sync-ipva-licenciamento` **roteiam sozinhos**: placa RS é delegada a esta tool; na frota processam SC e depois RS. `sync-detran-rs` processa **só** `ufRegistro="RS"` (e a frota SC pula RS). Use `--no-rs`/`--sc-only` para forçar apenas SC.

> O endpoint do RS devolve o **resumo** das infrações (sem detalhe por multa) — por isso `sync-detran-rs` cobre IPVA/Licenciamento e **sinaliza** infrações para revisão manual.

## Autenticação (variáveis de ambiente do utilizador)

| Variável | Uso |
|----------|-----|
| `DETRAN_RS_AUTH` | Token Bearer (header `Authorization`) |
| `DETRAN_RS_USER_ID` | Header `X-User-Id` (base64 do CPF) |
| `DETRAN_RS_TLS_INSECURE` | Opcional — `1` em redes com interceptação TLS |

Capturar em pcsdetran.rs.gov.br → DevTools → Network → pedido `veiculos/...` com `Authorization` e `X-User-Id`. **Nunca** versionar no Git; não usar `.env` para credenciais.

## Resumo rápido

```bash
# Toda a frota RS (ufRegistro="RS")
npx tsx src/run.ts sync-detran-rs [--dry-run]

# Um veículo
npx tsx src/run.ts sync-detran-rs --placa PWH3A45

# A partir de um JSON salvo (sem chamar a API)
npx tsx src/run.ts sync-detran-rs --placa PWH3A45 --json resposta.json
```

Relatório de lote: `relatorios/sync/_sync_detran_rs.json`.

## O que o sync grava

| Origem no payload | Vira | Regra |
|-------------------|------|-------|
| `imposto.historico[].debitos[]` (situação não-paga) | IPVA (`parceiro-despesas`) | uma despesa por forma (cota única / parcela); exercícios liquidados são ignorados; valor = `valorTotalComDesconto` (com multa+juros) |
| `expedicaoDocumento.vlrLic` (> 0) | Licenciamento (`parceiro-despesas`) | taxa do exercício `exercRefLic`; vencimento de `txtSitLic`/`dtVencLicenciamento` |
| `infracao` (totais) | — | o endpoint só devolve **resumo** (qt/valor); **sem detalhe por multa** → fica como aviso para revisão manual |

## Idempotência

- **Chave `origem`:** `detran-rs/debitos/{PLACA}/{categoria}/{exercicio[-forma]}`.
- Reexecutar **atualiza** valores; **não duplica**. Origens RS e SC são distintas e nunca se fundem.

## Código

`src/lib/detranRs/` — `auth.ts`, `consulta.ts`, `mapDebitos.ts`, `syncVeiculo.ts` · CLI `src/cli/syncDetranRs.ts`

## Skills relacionadas

- **cadastro-veiculo** — gravar `ufRegistro` e `renavam`.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json` (IPVA/Licenciamento, inclusive RS).
