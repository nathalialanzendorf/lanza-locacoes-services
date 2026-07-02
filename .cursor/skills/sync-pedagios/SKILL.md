---
name: sync-pedagios
description: >-
  Consulta passagens de pedágio em aberto no pedagiodigital.com por placa e grava em
  database/cliente-despesas.json (categoria Pedágio), com vínculo de cliente igual ao das
  infrações e espelho em Gastos Gerais do Rastreame. Usa a tool .cursor/tools/pedagio-digital/.
  Use when syncing pedágios, pedagiodigital, passagens em aberto, or cobrança de pedágio do locatário.
---

# Sync pedágios — pedagiodigital.com → cliente-despesas.json

Skill de **negócio**: trazer as **passagens de pedágio em aberto** do **pedagiodigital.com** para `database/cliente-despesas.json` (categoria `Pedágio`), para cobrança do locatário, e replicar no Rastreame como qualquer despesa de cliente.

> **Tipo no Rastreame:** categoria `Pedágio` / `Estacionamento` → `PEDAGIO` (ver de-para canônico em [`.cursor/tools/rastreame/README.md`](../../tools/rastreame/README.md)).

**Execução técnica** (auth por cookie+CSRF, endpoints): tool **`.cursor/tools/pedagio-digital/`** — ler [README.md](../../tools/pedagio-digital/README.md) e [reference.md](../../tools/pedagio-digital/reference.md) antes de correr a CLI.

## Quando usar

- Utilizador pede **sync pedágios / passagens em aberto** para locatários.
- Antes de **relatorio-encerramento-contrato** — garantir pedágios atualizados.
- Após **cadastro-veiculo** (veículo novo): cadastrar a placa no portal (ver abaixo).

## Regras de gravação (verbatim do utilizador)

- **tipo:** Pedágio
- **Título:** `ATRASADO Pagamento pedágio {dd/mm/aaaa HH:mm}` — incluir na data a **mesma data e horário** em que foi realizada a passagem (formato brasileiro com barras).
- **selecionar o veículo** de acordo com a **placa** e **cliente**.
- **sempre incluir tag confirmação** para verificar se a vinculação do cliente está correta e confirmada.

O **vínculo do cliente é o mesmo das infrações**: condutor inferido pelo contrato ativo na placa **na data/hora da passagem** (`condutorId` + `condutorContrato`), gravado com **`condutorConfirmado: false`** (a "tag confirmação") até o utilizador confirmar.

**Movimentação (`locacoes.json`):** além do período do contrato, considera **reserva** — passagem na placa substituta com `substituiPlaca` vigente na data/hora vincula ao **contrato do veículo principal** em manutenção (skill **cadastro-movimentacao**). Manter `manutencao` + `reserva` cadastrados antes do sync.

## Apenas veículos ativos

A sincronização (frota e conferência) considera **somente veículos ativos** (`ativo !== false` em `veiculos.json`). Veículos inativos/vendidos são ignorados — não cadastrar nem sincronizar pedágios deles. (Mesma regra das skills `sync-veiculo` e `sync-cliente`.)

## Fluxo do agente

1. Garantir sessão. Caminho **gratuito recomendado**: `npx tsx src/run.ts pedagio-digital login` (abre o Chrome, preenche `PEDAGIO_DIGITAL_LOGIN`/`SENHA`, você resolve o reCAPTCHA 1x → sessão cacheada que renova sozinha). Alternativas: `PEDAGIO_DIGITAL_COOKIE`+`PEDAGIO_DIGITAL_CSRF` (DevTools) ou um solver pago (`PEDAGIO_DIGITAL_CAPTCHA_PROVIDER`+`_APIKEY`). **A sessão do BFF expira em poucos minutos**, mas a tool faz refresh silencioso pelo perfil e auto-retry em HTTP 401; se a renovação exigir captcha de novo, refaça o `login`. Modo offline (passo abaixo) também serve.
2. **Teste:** `sync-pedagios --dry-run` (frota numa única chamada `Passagem/list-logado`).
3. **Produção:** frota (sem `--placa`) ou `--placa PLACA`.
4. Revisar `relatorios/sync/_sync_pedagios.json`.
5. **Confirmar o condutor de CADA registro `condutorConfirmado: false` (via selector):** para **cada** passagem nova/atualizada que ficou com `condutorConfirmado: false`, **perguntar ao utilizador** a confirmação do condutor com um **selector** (ferramenta de perguntas). As opções:
   - o **condutor inferido** pelo contrato ativo na data/hora (opção recomendada, em primeiro);
   - os **demais condutores** com contrato na placa naquela data (quando houver mais de um);
   - **"Sem condutor / não cobrar"** (mantém sem vínculo).
   Após a escolha, gravar: `gravar-cliente-despesa confirmar PED-<id> [condutorId]` (passar o `condutorId` escolhido quando for diferente do inferido; "sem condutor" → não confirmar). Só registros confirmados são considerados prontos para cobrança.

   > **SEMPRE informar a data e hora da passagem na confirmação.** O condutor correto depende de qual contrato estava ativo **naquele instante** — então o enunciado de toda confirmação deve conter a **data e hora exatas** (`dd/mm/aaaa HH:mm`) da passagem. Ao **agrupar** várias passagens por placa/condutor, **listar as datas/horas** de todas as passagens do grupo (não confirmar em bloco sem mostrar quando cada uma ocorreu), para o utilizador detectar passagens que pertencem a outro condutor.
6. **Espelhar no Rastreame — SEMPRE (push automático):** ao final de **todo** `/sync-pedagios`, executar **sempre** o push `npx tsx src/run.ts sync-gastos-gerais --push-only` — cria/atualiza o gasto `tipo PEDAGIO` no motorista/rastreável certos. O push **ignora** passagens sem condutor resolvido (só empurra as já vinculadas), por isso é seguro rodar sempre; o passo 5 (confirmar condutor) serve para revisar o vínculo antes de cobrar, **não** para bloquear o push.

> **Regra `/sync-pedagios`:** o comando do agente é considerado completo só depois do push do passo 6. Mesmo quando o pull não traz nada novo (`novos: 0`), rodar o push ao final para garantir o espelho no Rastreame.

## CLI

```bash
npx tsx src/run.ts sync-pedagios
npx tsx src/run.ts sync-pedagios --placa ABC1D23
npx tsx src/run.ts sync-pedagios --dry-run --placa ABC1D23
```

Offline (recomendado se a sessão expira): salve a resposta de `Passagem/list-logado`
(DevTools → Response → Save) e processe sem API — toda a frota numa só passada:

```bash
npx tsx src/run.ts sync-pedagios --json relatorios/_tmp/_pd_passagens.json --dry-run
npx tsx src/run.ts sync-pedagios --json relatorios/_tmp/_pd_passagens.json   # grava
```

(`--json ... --placa ABC1D23` processa só uma placa.)

Cadastrar placa nova no portal (após cadastro-veiculo): `npx tsx src/run.ts pedagio-digital register --placa ABC1D23`.

## Destino

- **Ficheiro:** `database/cliente-despesas.json`
- **Chave:** `autoInfracao` = `PED-<id da passagem>`
- **Campos:** `origem: pedagio-digital`, `categoria: Pedágio`, `situacao: "Em aberto"`, `rastreameTipo: PEDAGIO`.

## Rastreame

Como toda despesa de cliente, o registro é replicado em **Gastos Gerais** (tipo `PEDAGIO`) por **`sync-gastos-gerais`** (push). O motorista/rastreável é resolvido pelo `condutorId`/placa; o título com `ATRASADO` marca o débito em aberto.

> Tags `ATRASADO` / `[NEGOCIADO X]` (despesa de cliente): regra na skill **`cadastro-recebimento`** (fonte única) e em **`renegociar-debitos`** para `[NEGOCIADO X]`.

## Idempotência

- **Chave:** `PED-<id>` (case-insensitive) via `sincronizarClienteDespesa`.
- Reexecutar sync frota/placa **atualiza** passagens existentes; **não duplica**.
- `--dry-run` não grava; produção é segura para repetir após falha parcial.
- Ver [`_idempotencia.md`](../_idempotencia.md).

Detalhes de campos e mapeamento: [reference.md](reference.md) e `.cursor/tools/pedagio-digital/reference.md`.

## Skills relacionadas

- **sync-infracoes** — mesmo destino (`cliente-despesas.json`) e mesmo vínculo de condutor; categoria `Infração`.
- **sync-recebimentos** (skill) — faz o push do registro `Pedágio` para o Rastreame via comando `sync-gastos-gerais`.
- **cadastro-veiculo** — cadastrar a placa no portal (`pedagio-digital register`) em veículo novo.
- **relatorio-encerramento-contrato** — consome pedágios em aberto do locatário.
