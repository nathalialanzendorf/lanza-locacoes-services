# DETRAN RS (PROCERGS) — referência técnica

## Base URL

```
https://pcsdetran.procergs.com.br/pcsdetran/rest
```

Origin / Referer: `https://pcsdetran.rs.gov.br/`

## Endpoint (confirmado 28/06/2026)

| Método | Path |
|--------|------|
| GET | `/veiculos/{PLACA}/?renavam={RENAVAM}&contabiliza=false` → dados completos do veículo |

**Sem ticket nem captcha** — uma única chamada devolve tudo. Bem mais simples que o SC.

Headers obrigatórios:

```
Authorization: Bearer <token>     ← DETRAN_RS_AUTH
X-User-Id: <base64 do CPF>         ← DETRAN_RS_USER_ID
Accept: application/json, text/plain, */*
```

## Estrutura da resposta (blocos usados)

| Bloco | Campos relevantes |
|-------|-------------------|
| `identificacao` | `placa`, `renavam`, `ufPlaca` (= "RS"), `marcaModelo`, `exercLicenciamento`, `dtVencLicenciamento` |
| `imposto.historico[]` | por exercício: `exercicio`, `situacao`, `dataVencimento`, `valorOriginal`, `debitos[]`, `dividaAtiva` |
| `imposto.historico[].debitos[]` | `descricao` (ex. "Cota Única"), `valorOriginal`, `valorTotalComDesconto` (com multa+juros), `valorMulta`, `valorJurosMulta`, `dataPagamento` |
| `expedicaoDocumento` | `vlrLic` (taxa de licenciamento), `txtSitLic` (texto com data limite), `exercRefLic` |
| `infracao` | **só totais**: `qtVencidas`/`vlVencidas`, `qtAVencer`/`vlAVencer`, `qtAgPrazoDef`, `qtAgPrazoJulg`, `qtSuspensas` — **sem lista por multa** |
| `seguro` | DPVAT (`situacaoExercAtual` etc.) |
| `licenciamento`, `restricao`, `furtadoRoubado` | situação documental / restrições |

### IPVA — quais entram

- Entra a entrada de `imposto.historico` cuja **`situacao` não seja paga** (`/liquidad|conclu|pago|quitad|baixad/i`) **e** que tenha `debitos[]`.
- Cada `debito` sem `dataPagamento` vira **uma** despesa IPVA (cota única e cada parcela coexistem — origem distinta).
- Valor gravado = `valorTotalComDesconto` (total atualizado com multa+juros), caindo para `valorOriginal` se ausente.

### Licenciamento

- `expedicaoDocumento.vlrLic > 0` → despesa Licenciamento do exercício `exercRefLic`.
- Vencimento extraído de `txtSitLic` ("Data limite para pagamento: DD/MM/AAAA") ou `identificacao.dtVencLicenciamento`.

### Infrações

- O endpoint devolve **apenas o resumo agregado**. Não há detalhe (auto, data de autuação, local). Quando há infrações (`total > 0`), o sync emite **aviso** para revisão manual — não grava em `cliente-despesas.json`.

## TLS

Em redes com interceção TLS → `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Defina **`DETRAN_RS_TLS_INSECURE=1`** (também aceita `DETRAN_SC_TLS_INSECURE=1`/`RASTREAME_TLS_INSECURE=1`).

## Módulos

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranRs/auth.ts` | Env + headers |
| `src/lib/detranRs/consulta.ts` | GET único |
| `src/lib/detranRs/mapDebitos.ts` | IPVA/Licenciamento + resumo de infrações |
| `src/lib/detranRs/syncVeiculo.ts` | Orquestra (frota RS, por placa, --json) |
| `src/cli/syncDetranRs.ts` | CLI `sync-detran-rs` |

## Capturar credenciais

1. [pcsdetran.rs.gov.br](https://pcsdetran.rs.gov.br/) logado.
2. DevTools → Network → pedido `veiculos/...`.
3. Copiar `Authorization` (Bearer) e `X-User-Id` → variáveis `DETRAN_RS_AUTH`, `DETRAN_RS_USER_ID`.

Debug offline: salvar a resposta e usar `--json arquivo.json --placa PLACA`.
