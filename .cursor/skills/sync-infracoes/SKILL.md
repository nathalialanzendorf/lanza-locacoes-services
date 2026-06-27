---
name: sync-infracoes
description: >-
  Syncs traffic fines and infractions from DETRAN SC into database/cliente-despesas.json
  for tenant billing and contract closure. Uses tool .cursor/tools/detran-sc/.
  Use when syncing multas, infrações, DETRAN SC, cliente-despesas, or before relatorio-encerramento-contrato.
---

# Sync infrações — DETRAN SC → cliente-despesas.json

Skill de **negócio**: trazer multas e infrações do **DETRAN SC** para `database/cliente-despesas.json` (categoria `Infração`), para cobrança do locatário e **relatorio-encerramento-contrato**.

> **Tipo no Rastreame:** categoria `Infração` → `MULTA` (ver de-para canônico em [`.cursor/tools/rastreame/README.md`](../../tools/rastreame/README.md)).

**Execução técnica** (auth, API, headers): tool **`.cursor/tools/detran-sc/`** — ler [README.md](../../tools/detran-sc/README.md) e [infracoes.md](../../tools/detran-sc/infracoes.md) antes de correr a CLI.

## DETRAN por UF — usa as duas tools (SC + RS)

Esta skill cobre **ambos os DETRANs**, roteando por **`ufRegistro`** do veículo:

- `SC` ou ausente → tool **`.cursor/tools/detran-sc/`** (fluxo com ticket/captcha desta skill).
- `RS` → tool **`.cursor/tools/detran-rs/`** (CLI `sync-detran-rs`, sem captcha). **O endpoint do RS só devolve o RESUMO das infrações** (qt/valor, sem detalhe por multa) → não popula `cliente-despesas.json`; fica como aviso para revisão manual.

O CLI `sync-infracoes` faz o roteamento sozinho: `--placa` de veículo RS é delegada à tool RS; na frota, processa SC e depois RS. Para rodar SC + IPVA/Lic. SC de uma vez use o guarda-chuva **`sync-detran-sc`**; para tudo do RS, **`sync-detran-rs`**.

## Quando usar

- Utilizador pede **sync multas / infrações / DETRAN** para locatários.
- Antes de **relatorio-encerramento-contrato** — garantir multas atualizadas.
- Após cadastrar veículo — exige `renavam` em `database/veiculos.json`.

## Semântica (resumo)

| Origem DETRAN | Gravação |
|---------------|----------|
| `infracoes` (autuação) | Cobrável; `quitadaDetran: false` |
| `debitos` (multas) | Importar **só multas** (ignorar IPVA/licenciamento) |
| `historicoInfracoes` | `quitadaDetran: true` — não cobrar no encerramento |

`paga` = locatário pagou à Lanza (independente de `quitadaDetran`).

## Quitadas e sem-cliente/sem-data — não entram na cobrança

Regra de negócio (aplicada no código de gravação e na varredura):

- **Quitada no DETRAN** (`quitadaDetran: true`): fica salva no banco (histórico), mas **não é cobrável**. Como não há cliente a vincular, gravamos **`condutorConfirmado: true`** e **não** marcamos `revisarManual` — mesmo sem data de autuação (o campo pode ficar nulo). Não aparece na varredura "a atribuir / sem data".
- **Sem data de autuação** (e não quitada): **não dá para comparar com o período de vigência do contrato**, então **não é lançada como despesa cobrável**; fica em `revisarManual` ("sem data") até o DETRAN preencher a data (ou revisão manual). São as únicas que sobram na varredura "sem data".
- **Com data (não quitada): resolução automática por vigência** — a gravação/sync tenta inferir o condutor pelo contrato vigente na data (`resolverCondutorVigencia`):
  - **contrato + cliente encontrados** → **vincula e confirma** (`condutorId`, `condutorContrato`, `condutorConfirmado: true`). A inferência considera **contratos já devolvidos/encerrados** (o locatário responde pelo período em que teve o carro) e calcula o fim de cada contrato pelo **início do próximo contrato da placa** / dica de devolução no nome da pasta (ex.: `(devolvido 18.05)`).
  - **nenhum contrato ativo na data** → **"Não identificado"** (`condutorNaoIdentificado: true`, `condutorConfirmado: true`, `condutorId: null`): salva no histórico, **não cobrável** a nenhum cliente (não há locação documentada na data).
  - **contrato achado mas cliente fora de `clientes.json`** → fica **pendente** ("a atribuir"): cadastrar o cliente e re-rodar.
- Uma multa **não quitada** que depois é quitada no DETRAN é **atualizada** na próxima sync (vira `quitadaDetran: true`, `condutorConfirmado: true`, sai da revisão).

> Resumo: **só cobra do locatário** infração **com data** dentro da vigência **e** **não quitada**. Sem data, quitada **ou** "Não identificado" → fora do cálculo de despesas do cliente.

### Conciliar registros existentes (`atribuir-condutores`)

Para reaplicar a regra a infrações **já gravadas** sem precisar consultar o DETRAN de novo:

```bash
npx tsx src/run.ts atribuir-condutores --dry-run        # prévia (não grava)
npx tsx src/run.ts atribuir-condutores                  # aplica
npx tsx src/run.ts atribuir-condutores --placa MKV6268  # só uma placa
npx tsx src/run.ts atribuir-condutores --incluir-pedagios  # inclui pedágios (padrão: só infrações)
```

Idempotente — só mexe nas pendentes (sem condutor e não confirmadas). Vincula as inferíveis, marca **"Não identificado"** as sem contrato e deixa pendentes as de **cliente faltando** (reporta a pasta do contrato) e **sem data**.

## Sem placa = TODOS os veículos (frota)

`sync-infracoes` **sem `--placa` processa todos os veículos ativos** do `database`, roteando por UF.

### RS (`ufRegistro="RS"`) — automático

Uma chamada GET por veículo, **sem captcha** (precisa de `DETRAN_RS_AUTH`/`DETRAN_RS_USER_ID`). Já roda dentro de `sync-infracoes` (frota) e em `sync-detran-rs`. Infrações do RS vêm só como **resumo** → aviso para revisão manual.

### SC — captcha só nasce no browser (confirmado 28/06/2026)

O `requisitar-consulta` exige **captcha** para **iniciar** uma consulta nova. Sem captcha, ele só devolve ticket se já houver consulta **pendente** para a placa (ex.: logo após consultar no portal) — senão retorna **`Captcha inválido`**. Logo, **não há varredura 100% automática da frota**. Caminhos:

- **Frota inteira:** capturar no navegador e processar em lote:
  1. Colar `scripts/capturarDetranConsole.js` no Console do portal.
  2. **Consultar todas as placas SC** + rodar **`baixarDetranData()`** → baixa `detran_data.json`.
  3. `npx tsx scripts/processarDetranTickets.ts --data "%USERPROFILE%\Downloads\detran_data.json"` — grava infrações **e** IPVA/Licenciamento de todas (uma captura cobre as duas skills).
- **Uma placa logo após consultar no portal:** `sync-infracoes --placa PLACA` reaproveita o ticket pendente (sem captcha).

Basta `DETRAN_SC_AUTH` (token válido — `HTTP 401` = recapturar) e `DETRAN_SC_EMPRESA`. Rede com interceção TLS: `DETRAN_SC_TLS_INSECURE=1`.

### Uma placa só (`--placa`)

`sync-infracoes --placa PLACA` tenta consultar sozinho (funciona se houver pendência). Atalhos: **`--ticket <t>`** (ticket do DevTools) ou **`--json arquivo.json`** (offline). Se vier `Captcha inválido`, consulte a placa no portal primeiro (ou use o fluxo de captura).

## Fluxo do agente

1. Confirmar variáveis de ambiente do utilizador: `DETRAN_SC_AUTH`, `DETRAN_SC_EMPRESA` (SC) e `DETRAN_RS_AUTH`/`DETRAN_RS_USER_ID` (RS, se houver placas RS).
2. **Sem placa (frota / todos os veículos):** RS roda automático; **SC precisa de captura no browser** (`baixarDetranData()` → `processarDetranTickets.ts --data …`), pois o captcha só nasce no portal.
3. **Com placa:** consulte a placa no portal e rode `sync-infracoes --placa PLACA` (reaproveita o pendente) ou passe `--ticket <t>`. Placa RS é roteada sozinha para a tool RS.
4. Revisar `relatorios/sync/_sync_infracoes.json` (inclui a `auditoria` — ver abaixo).
5. Multas novas com `condutorConfirmado: false` → confirmar condutor antes de cobrar (`gravar-cliente-despesa confirmar <autoInfracao>`).
6. **Espelhar no Rastreame (Gastos Gerais):** `sync-gastos-gerais` (push). Despesa de cliente vai sempre para a tela **Gastos Gerais** (não para Manutenção).

## Varredura de multas sem condutor (sempre no fim do sync)

Ao final de **todo** `sync-infracoes` (placa ou frota) é feita uma **varredura**
que lista as infrações ativas **sem condutor** (`condutorId: null`). **Quitadas no
DETRAN e já confirmadas (`condutorConfirmado: true`) são excluídas** da varredura
(não são cobráveis). Restam:

- **A atribuir** — infrações **não quitadas, com data** cujo contrato foi achado mas
  o **cliente não está em `clientes.json`** (cadastrar o cliente e rodar
  `atribuir-condutores`). As que têm contrato + cliente já são **vinculadas e
  confirmadas automaticamente** pela vigência (não aparecem aqui).
- **Não identificado** — não quitadas, com data, mas **sem contrato ativo na data**
  (`condutorNaoIdentificado: true`, confirmadas) → não cobráveis, fora da varredura.
- **Sem data (revisar)** — **não quitadas** e sem data de autuação → não dá para
  comparar com a vigência; ficam para revisão manual.
- **Ignoradas (antes da locação)** — geradas **antes** do veículo entrar em
  locação → não são do locatário, ficam `condutorId: null` de propósito.

O corte usa o campo **`inicioLocacoes`** (YYYY-MM-DD) de cada veículo em
`database/veiculos.json`. Para preencher/atualizar esse campo a partir do 1º
registro de locação (Locação semanal/Caução/Diária) em `cliente-despesas.json`:

```bash
npx tsx src/run.ts inicio-locacoes listar              # ver datas derivadas
npx tsx src/run.ts inicio-locacoes derivar             # preenche só placas vazias
npx tsx src/run.ts inicio-locacoes derivar --sobrescrever  # recalcula todas
```

Se uma placa não tiver `inicioLocacoes`, a varredura avisa (não consegue
descartar as anteriores à locação) — definir manualmente o campo no veículo.

## CLI

```bash
# Frota SC: capturar no browser, depois processar em lote:
npx tsx scripts/processarDetranTickets.ts --data "%USERPROFILE%\Downloads\detran_data.json"
# Frota RS (automático):
npx tsx src/run.ts sync-detran-rs

# Uma placa (após consultar no portal, reaproveita o pendente):
npx tsx src/run.ts sync-infracoes --placa QJB-0I83
npx tsx src/run.ts sync-infracoes --dry-run --placa QJB-0I83 --ticket <t>
```

Debug offline (resposta já capturada): `--json relatorios/_tmp/_detran_resposta.json` ou `--ticket <t>` — ver tool.

## Destino

- **Ficheiro:** `database/cliente-despesas.json`
- **Chave:** `autoInfracao`
- **Campos:** `origem: detran-sc`, `categoria: Infração`

## Idempotência

- **Chave:** `autoInfracao` (case-insensitive) via `sincronizarClienteDespesa`.
- Reexecutar sync frota/placa **atualiza** multas existentes; **não duplica**.
- `--dry-run` não grava; produção é segura para repetir após falha parcial.
- Ver [`_idempotencia.md`](../_idempotencia.md).

Detalhes de API e módulos: [reference.md](reference.md) e `.cursor/tools/detran-sc/reference.md`.

## Skills relacionadas

- **sync-ipva-licenciamento** — IPVA/licenciamento do **mesmo** portal → `parceiro-despesas.json` (não misturar).
- **relatorio-encerramento-contrato** — consome infrações (`paga`, `quitadaDetran`).
- **cadastro-veiculo** — `renavam` obrigatório para consulta DETRAN.
