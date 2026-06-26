---
name: sync-infracoes
description: >-
  Syncs traffic infractions from DETRAN SC (servicos.detran.sc.gov.br transito-api)
  into database/cliente-despesas.json (categoria Infração) using placa and renavam
  from database/veiculos.json. Maps infracoes (notified, no boleto), debitos
  (unpaid multa boletos only), and historicoInfracoes (paid at DETRAN). Use when
  syncing multas, infrações, sync infracoes, DETRAN SC, atualizar cliente-despesas.json,
  or consulta veículo frota.
---

# Sync infrações — DETRAN SC

Consulta **placa + RENAVAM** de cada veículo em `database/veiculos.json` no portal **Detran Digital SC** (`transito-api`) e grava/atualiza `database/cliente-despesas.json` (categoria **Infração**).

## Semântica da resposta DETRAN (regras Lanza)

| Bloco API | Significado | Ação no `cliente-despesas.json` |
|-----------|-------------|------------------------|
| **`infracoes`** | Autuações **notificadas**, **sem boleto** — ainda não pagas | Cadastrar/atualizar como **cobrável locatário** (`quitadaDetran: false`) |
| **`debitos`** | Mistura: multas com boleto em aberto **+** licenciamento/IPVA | Importar **só multas**; **ignorar** licenciamento, IPVA, DPVAT, taxas DETRAN (dono/parceiro) |
| **`historicoInfracoes`** | Multas com boleto **gerado e pagas** no DETRAN | Cadastrar/atualizar com **`quitadaDetran: true`** — **não** entra no encerramento de contrato |

O campo `paga` em `cliente-despesas.json` continua reservado para **pagamento pelo locatário à Lanza**. Não confundir com quitada no DETRAN.

## Autenticação (`.env` na raiz)

| Variável | Origem |
|----------|--------|
| `DETRAN_SC_AUTH` | Header `Authorization: Bearer …` — DevTools → Network em [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/) |
| `DETRAN_SC_EMPRESA` | Header `X-Empresa` (ex. `5071090`) |
| `DETRAN_SC_APP_VERSION` | Opcional — header `X-App-Version` (copiar do portal se 401/403) |

**Nunca** versionar token JWT nem colar `curl` com sessão no Git.

Token expira (≈5 h); renovar no portal quando a CLI falhar com 401.

## Executar (CLI)

Na raiz do repo, após `npm install`:

```bash
# Toda a frota (placa + renavam de veiculos.json)
npx tsx src/run.ts sync-infracoes

# Uma placa
npx tsx src/run.ts sync-infracoes --placa QJB-0I83

# Simular sem gravar
npx tsx src/run.ts sync-infracoes --dry-run --placa QJB-0I83

# Resposta já capturada (debug)
npx tsx src/run.ts sync-infracoes --placa QJB-0I83 --ticket d3a46e54-373a-4689-9a7a-4138adcd0159

# JSON salvo do DevTools
npx tsx src/run.ts sync-infracoes --placa QJB-0I83 --json relatorios/_detran_resposta.json
```

Relatório de lote: `relatorios/_sync_infracoes.json`.

## Fluxo do agente

1. Confirmar `DETRAN_SC_AUTH` e `DETRAN_SC_EMPRESA` no `.env` (ou pedir ao operador).
2. `--dry-run --placa X` num veículo de teste.
3. Sincronizar frota ou placa pedida.
4. Listar multas **novas** com `condutorConfirmado: false` — operador confirma condutor antes de cobrar (**encerrar-contrato**).
5. Confirmar condutor: `npx tsx src/run.ts gravar-cliente-despesa confirmar <autoInfracao>`.

## Campos gravados

- Chave natural: `autoInfracao`
- `origem`: `detran-sc`
- `quitadaDetran`: `true` se veio de `historicoInfracoes`
- Inferência de condutor: mesma lógica de `gravar-cliente-despesa` (contratos + data da autuação)

## Critério de conclusão

- Veículos sem `renavam` em `veiculos.json` são ignorados (avisar operador).
- Débitos de licenciamento/IPVA **não** aparecem em `cliente-despesas.json`.
- Multas cobráveis têm `quitadaDetran !== true`.
- Duplicados por `autoInfracao` são atualizados (situação/valor), não duplicados.

## Skills relacionadas

- **encerrar-contrato** — usa `cliente-despesas.json` (só categoria Infração; exclui `quitadaDetran` e `paga`).
- **sync-ipva-licenciamento** — IPVA/Licenciamento do mesmo portal → `parceiro-despesas.json`.
- **cadastrar-veiculo** — garante `renavam` correto para a consulta.
- Detalhes API / mapeamento: [reference.md](reference.md)
