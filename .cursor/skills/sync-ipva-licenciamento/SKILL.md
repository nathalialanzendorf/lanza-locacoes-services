---
name: sync-ipva-licenciamento
description: >-
  Syncs IPVA and Licenciamento debits from DETRAN SC (transito-api debitos)
  into database/parceiro-despesas.json via cadastrar-despesa rules (partner/owner costs).
  Uses placa and renavam from database/veiculos.json. Use when syncing IPVA,
  licenciamento, despesas DETRAN, débitos veículo parceiro, or updating
  parceiro-despesas.json from Detran Digital SC.
---

# Sync IPVA e Licenciamento — DETRAN SC

Consulta **placa + RENAVAM** em `database/veiculos.json` no **Detran Digital SC** e grava **somente** débitos de **IPVA** e **Licenciamento** em `database/parceiro-despesas.json`.

São despesas do **parceiro/dono** do veículo (não cobrar locatário). Alimentam **relatorio-prestacao-contas**.

## Semântica da resposta DETRAN

| Bloco API | O que importa aqui |
|-----------|-------------------|
| **`debitos`** | Filtrar **IPVA** e **Licenciamento** → `parceiro-despesas.json` |
| **`debitos`** (multas) | **Ignorar** — skill **sync-infracoes** |
| **`infracoes` / `historicoInfracoes`** | **Ignorar** |

Outros débitos (DPVAT, taxa DETRAN, CRLV, etc.) também são ignorados nesta skill.

## Autenticação

Mesmas variáveis de **sync-infracoes** (`.env`):

| Variável | Uso |
|----------|-----|
| `DETRAN_SC_AUTH` | JWT Bearer |
| `DETRAN_SC_EMPRESA` | Header `X-Empresa` |
| `DETRAN_SC_APP_VERSION` | Opcional |

## Executar (CLI)

Na raiz do repo:

```bash
# Frota inteira
npx tsx src/run.ts sync-ipva-licenciamento

# Uma placa
npx tsx src/run.ts sync-ipva-licenciamento --placa MKV-6268

# Simular
npx tsx src/run.ts sync-ipva-licenciamento --dry-run --placa MKV-6268

# Debug (JSON ou ticket do DevTools)
npx tsx src/run.ts sync-ipva-licenciamento --placa MKV-6268 --json relatorios/_detran_resposta.json
npx tsx src/run.ts sync-ipva-licenciamento --placa MKV-6268 --ticket <uuid>
```

Relatório de lote: `relatorios/_sync_ipva_licenciamento.json`.

## Integração com cadastrar-despesa

A sync **não substitui** o fluxo manual — reutiliza o **mesmo schema** de `database/parceiro-despesas.json` que **cadastrar-despesa**:

| Campo | Valor na sync |
|-------|----------------|
| `categoria` | `IPVA` ou `Licenciamento` |
| `valor` | `valorAtual` do débito DETRAN |
| `data` | `vencimento` (DD/MM/AAAA) |
| `placa` | veículo consultado |
| `competencia` | MM/AAAA derivado do vencimento ou exercício |
| `descricao` | classe do débito + exercício |
| `origem` | `detran-sc/debitos/{PLACA}/{categoria}/{id}` — dedupe na reimportação |
| `veiculoId` | uuid em `veiculos.json` (ou `null` com aviso) |

Para lançamento **manual** avulso (sem DETRAN), continuar com **cadastrar-despesa**:

```bash
npx tsx src/run.ts gravar-despesa "Licenciamento" "149,37" "30/12/2026" "MKV-6268" "Licenciamento Anual 2026"
npx tsx src/run.ts gravar-despesa "IPVA" "850,00" "15/03/2026" "MKV-6268" "IPVA 2026"
```

## Fluxo do agente

1. Confirmar credenciais DETRAN no `.env`.
2. `--dry-run --placa X` para validar extração.
3. Executar sync (frota ou placa).
4. Resumir novos/atualizados por categoria.
5. Se faltar veículo em `veiculos.json`, avisar e oferecer **cadastrar-veiculo**.

## Critério de conclusão

- Só entram categorias **IPVA** e **Licenciamento**.
- Multas e outros débitos **não** duplicados em `parceiro-despesas.json`.
- Reimportação atualiza valor/data pelo `origem` (sem duplicar).

## Skills relacionadas

- **cadastrar-despesa** — lançamento manual e schema de despesas.
- **sync-infracoes** — multas/infrações → `cliente-despesas.json`.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
- **cadastrar-veiculo** — placa + renavam para consulta DETRAN.
- Detalhes API: [reference.md](reference.md)
